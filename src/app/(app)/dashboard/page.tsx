import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, FolderGit2, Layers, Activity } from "lucide-react";
import { getAuthenticatedClient } from "@/lib/dal";
import { getPackageTypeColor } from "@/lib/gitlab/install-commands";
import Link from "next/link";
import { DashboardSearch } from "./dashboard-search";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { client, groups: groupsApi, packages } = await getAuthenticatedClient();

  // Fetch stats in parallel
  const [versionResult, groupsResult, recentPackagesResults] = await Promise.allSettled([
    client.getVersion(),
    groupsApi.listGroups({ per_page: 100, top_level_only: true }),
    (async () => {
      // Get top groups first, then fetch recent packages from them
      const topGroups = await groupsApi.listGroups({ per_page: 5, top_level_only: true });
      if (topGroups.data.length === 0) return [];

      const results = await Promise.all(
        topGroups.data.slice(0, 3).map((g) =>
          packages.listGroupPackages(g.id, {
            per_page: 10,
            order_by: "created_at",
            sort: "desc",
          }).catch(() => ({ data: [], totalItems: 0, totalPages: 0, currentPage: 1, nextPage: null }))
        )
      );

      const all = results.flatMap((r) => r.data);
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return all.slice(0, 10);
    })(),
  ]);

  const version = versionResult.status === "fulfilled" ? versionResult.value : null;
  const groupsData = groupsResult.status === "fulfilled" ? groupsResult.value : null;
  const recentPackages = recentPackagesResults.status === "fulfilled" ? recentPackagesResults.value : [];

  // Calculate total packages from groups
  let totalPackages = 0;
  if (groupsData && groupsData.data.length > 0) {
    const packageCounts = await Promise.all(
      groupsData.data.slice(0, 5).map((g) =>
        packages.listGroupPackages(g.id, { per_page: 1 }).catch(() => ({
          data: [],
          totalItems: 0,
          totalPages: 0,
          currentPage: 1,
          nextPage: null,
        }))
      )
    );
    totalPackages = packageCounts.reduce((sum, r) => sum + r.totalItems, 0);
  }

  // Count package types
  const typeCounts: Record<string, number> = {};
  for (const pkg of recentPackages) {
    typeCounts[pkg.package_type] = (typeCounts[pkg.package_type] || 0) + 1;
  }

  const stats = [
    {
      title: "Jami paketlar",
      value: totalPackages.toString(),
      description: "Barcha turdagi paketlar",
      icon: Package,
    },
    {
      title: "Guruhlar",
      value: groupsData?.totalItems.toString() || "0",
      description: "Mavjud guruhlar soni",
      icon: Layers,
    },
    {
      title: "Paket turlari",
      value: Object.keys(typeCounts).length.toString(),
      description: Object.keys(typeCounts).join(", ") || "Hali yo\u2018q",
      icon: FolderGit2,
    },
    {
      title: "Registr holati",
      value: version ? "Faol" : "Noma\u2018lum",
      description: version ? `GitLab ${version.version}` : "GitLab API ulanishda xatolik",
      icon: Activity,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Paket registri umumiy ko&apos;rinishi
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent packages */}
        <Card>
          <CardHeader>
            <CardTitle>So&apos;nggi paketlar</CardTitle>
            <CardDescription>
              Yaqinda nashr etilgan paketlar
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentPackages.length > 0 ? (
              <div className="space-y-3">
                {recentPackages.map((pkg) => (
                  <Link
                    key={`${pkg.id}-${pkg.name}`}
                    href={`/packages/${pkg.id}?project=${pkg.project_id || ""}`}
                    className="flex items-center gap-3 hover:bg-muted/50 rounded-md p-1.5 -m-1.5 transition-colors"
                  >
                    <Package className="h-8 w-8 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{pkg.name}</p>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getPackageTypeColor(pkg.package_type)}`}>
                          {pkg.package_type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {pkg.version} &middot; {new Date(pkg.created_at).toLocaleDateString("uz-UZ")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Hali paketlar yo&apos;q
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick search */}
        <Card>
          <CardHeader>
            <CardTitle>Tezkor qidiruv</CardTitle>
            <CardDescription>
              Paketlarni nomi bo&apos;yicha qidiring
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DashboardSearch />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
