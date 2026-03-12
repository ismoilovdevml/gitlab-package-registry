import { getAuthenticatedClient } from "@/lib/dal";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Package } from "lucide-react";
import Link from "next/link";
import { getPackageTypeColor } from "@/lib/gitlab/install-commands";
import type { PackageType } from "@/lib/gitlab/types";
import { PackageFilters } from "./package-filters";

export const dynamic = "force-dynamic";

const PACKAGE_TYPES: PackageType[] = [
  "npm", "maven", "pypi", "docker", "nuget",
  "golang", "composer", "conan", "helm", "generic",
];

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    type?: string;
    search?: string;
    project?: string;
    group?: string;
  }>;
}) {
  const params = await searchParams;
  const { packages, groups: groupsApi } = await getAuthenticatedClient();
  const page = parseInt(params.page || "1", 10);
  const packageType = PACKAGE_TYPES.includes(params.type as PackageType)
    ? (params.type as PackageType)
    : undefined;
  const projectId = params.project ? parseInt(params.project, 10) : undefined;
  const groupId = params.group ? parseInt(params.group, 10) : undefined;

  // Fetch packages based on scope
  let result;
  const searchFilters = {
    page,
    per_page: 20,
    package_type: packageType,
    package_name: params.search || undefined,
    order_by: "created_at" as const,
    sort: "desc" as const,
  };

  if (projectId) {
    result = await packages.listProjectPackages(projectId, searchFilters);
  } else if (groupId) {
    result = await packages.listGroupPackages(groupId, searchFilters);
  } else {
    // Get all packages from all groups the user has access to
    const topGroups = await groupsApi.listGroups({ per_page: 100, top_level_only: true });

    if (topGroups.data.length > 0) {
      const allPackages = await Promise.all(
        topGroups.data.slice(0, 5).map((g) =>
          packages.listGroupPackages(g.id, searchFilters).catch(() => ({
            data: [],
            totalPages: 0,
            totalItems: 0,
            currentPage: 1,
            nextPage: null,
          }))
        )
      );

      const combined = allPackages.flatMap((r) => r.data);
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      result = {
        data: combined.slice(0, 20),
        totalPages: 1,
        totalItems: allPackages.reduce((sum, r) => sum + r.totalItems, 0),
        currentPage: 1,
        nextPage: combined.length > 20 ? 2 : null,
      };
    } else {
      result = { data: [], totalPages: 0, totalItems: 0, currentPage: 1, nextPage: null };
    }
  }

  const buildFilterUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (params.project) p.set("project", params.project);
    if (params.group) p.set("group", params.group);
    if (params.search) p.set("search", params.search);
    if (params.type) p.set("type", params.type);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    return `/packages${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paketlar</h1>
        <p className="text-muted-foreground">
          {result.totalItems > 0
            ? `Jami ${result.totalItems} ta paket topildi`
            : "Paketlarni ko\u2018rish, qidirish va filtrlash"}
        </p>
      </div>

      {/* Search */}
      <PackageFilters
        currentType={packageType}
        currentSearch={params.search}
        projectId={params.project}
        groupId={params.group}
      />

      {/* Package type filter pills */}
      <div className="flex flex-wrap gap-2">
        <Link href={buildFilterUrl({ type: undefined, page: undefined })}>
          <Badge
            variant={!packageType ? "default" : "outline"}
            className="cursor-pointer"
          >
            Barchasi
          </Badge>
        </Link>
        {PACKAGE_TYPES.map((type) => (
          <Link key={type} href={buildFilterUrl({ type, page: undefined })}>
            <Badge
              variant={packageType === type ? "default" : "outline"}
              className="cursor-pointer"
            >
              {type}
            </Badge>
          </Link>
        ))}
      </div>

      {/* Package list */}
      {result.data.length > 0 ? (
        <div className="space-y-2">
          {result.data.map((pkg) => (
            <Link
              key={`${pkg.id}-${pkg.name}`}
              href={`/packages/${pkg.id}?project=${pkg.project_id || projectId || ""}`}
            >
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center gap-4 py-3">
                  <Package className="h-8 w-8 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{pkg.name}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getPackageTypeColor(pkg.package_type)}`}>
                        {pkg.package_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                      <span>{pkg.version}</span>
                      <span>&middot;</span>
                      <span>{new Date(pkg.created_at).toLocaleDateString("uz-UZ")}</span>
                      {pkg.pipeline && (
                        <>
                          <span>&middot;</span>
                          <span className="text-xs">Pipeline #{pkg.pipeline.id}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge variant={pkg.status === "default" ? "secondary" : "outline"} className="shrink-0">
                    {pkg.status}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold">Paket topilmadi</h2>
          <p className="text-muted-foreground mt-2">
            {params.search
              ? `"${params.search}" bo\u2018yicha hech narsa topilmadi`
              : "Bu loyihada paketlar yo\u2018q"}
          </p>
        </div>
      )}

      {/* Pagination */}
      {result.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          {page > 1 && (
            <Link
              href={buildFilterUrl({ page: String(page - 1) })}
              className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted"
            >
              Oldingi
            </Link>
          )}
          <span className="text-sm text-muted-foreground px-3">
            Sahifa {page} / {result.totalPages}
          </span>
          {result.nextPage && (
            <Link
              href={buildFilterUrl({ page: String(page + 1) })}
              className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted"
            >
              Keyingi
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
