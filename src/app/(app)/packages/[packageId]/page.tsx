import { getAuthenticatedClient } from "@/lib/dal";
import { getSettings } from "@/lib/setup";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Package, FileText, Copy, ArrowLeft, Calendar, GitBranch } from "lucide-react";
import Link from "next/link";
import { getInstallCommand, getPackageTypeColor } from "@/lib/gitlab/install-commands";
import { CopyButton } from "./copy-button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default async function PackageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ packageId: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { packageId: packageIdStr } = await params;
  const { project: projectIdStr } = await searchParams;
  const packageId = parseInt(packageIdStr, 10);
  const projectId = projectIdStr && projectIdStr !== "" ? parseInt(projectIdStr, 10) : undefined;

  if (isNaN(packageId)) {
    notFound();
  }

  const { packages, projects, groups: groupsApi } = await getAuthenticatedClient();
  const settings = await getSettings();
  const gitlabUrl = settings?.gitlabUrl || "";

  // If no projectId provided, try to find the package across groups
  let resolvedProjectId = projectId;
  if (!resolvedProjectId) {
    // Search across top-level groups to find which project owns this package
    const topGroups = await groupsApi.listGroups({ per_page: 10, top_level_only: true });
    for (const group of topGroups.data) {
      try {
        const groupPkgs = await packages.listGroupPackages(group.id, { per_page: 100 });
        const found = groupPkgs.data.find((p) => p.id === packageId);
        if (found?.project_id) {
          resolvedProjectId = found.project_id;
          break;
        }
      } catch {
        // skip
      }
    }
  }

  if (!resolvedProjectId) {
    notFound();
  }

  const [pkg, files, project] = await Promise.allSettled([
    packages.getPackage(resolvedProjectId, packageId),
    packages.getPackageFiles(resolvedProjectId, packageId),
    projects.getProject(resolvedProjectId),
  ]);

  if (pkg.status === "rejected") {
    notFound();
  }

  const packageData = pkg.value;
  const packageFiles = files.status === "fulfilled" ? files.value : [];
  const projectData = project.status === "fulfilled" ? project.value : null;

  const installCmd = getInstallCommand(
    packageData.package_type,
    packageData.name,
    packageData.version,
    gitlabUrl,
    projectData?.path_with_namespace,
  );

  const totalSize = packageFiles.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        href={`/packages${projectId ? `?project=${projectId}` : ""}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Paketlarga qaytish
      </Link>

      {/* Package header */}
      <div className="flex items-start gap-4">
        <Package className="h-12 w-12 text-muted-foreground shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{packageData.name}</h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getPackageTypeColor(packageData.package_type)}`}>
              {packageData.package_type}
            </span>
            <Badge variant={packageData.status === "default" ? "secondary" : "outline"}>
              {packageData.status}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            <span className="font-medium text-foreground">v{packageData.version}</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(packageData.created_at).toLocaleDateString("uz-UZ", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            {projectData && (
              <span>{projectData.path_with_namespace}</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left column — main info */}
        <div className="md:col-span-2 space-y-6">
          {/* Install command */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">O&apos;rnatish buyrug&apos;i</CardTitle>
              <CardDescription>
                Paketni o&apos;rnatish uchun quyidagi buyruqni ishlating
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto font-mono">
                  {installCmd}
                </pre>
                <CopyButton text={installCmd} />
              </div>
            </CardContent>
          </Card>

          {/* Package files */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Fayllar ({packageFiles.length})
              </CardTitle>
              {totalSize > 0 && (
                <CardDescription>
                  Jami hajm: {formatFileSize(totalSize)}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {packageFiles.length > 0 ? (
                <div className="space-y-2">
                  {packageFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{file.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(file.created_at).toLocaleDateString("uz-UZ")}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground shrink-0 ml-4">
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Fayllar topilmadi
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — metadata */}
        <div className="space-y-6">
          {/* Package info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ma&apos;lumotlar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tur</span>
                <span className="font-medium">{packageData.package_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Versiya</span>
                <span className="font-medium">{packageData.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Holat</span>
                <span className="font-medium">{packageData.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hajm</span>
                <span className="font-medium">{totalSize > 0 ? formatFileSize(totalSize) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fayllar</span>
                <span className="font-medium">{packageFiles.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Yaratilgan</span>
                <span className="font-medium">
                  {new Date(packageData.created_at).toLocaleDateString("uz-UZ")}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Pipeline info */}
          {packageData.pipeline && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID</span>
                  <span className="font-medium">#{packageData.pipeline.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Branch</span>
                  <span className="font-medium">{packageData.pipeline.ref}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Holat</span>
                  <Badge variant={packageData.pipeline.status === "success" ? "default" : "secondary"}>
                    {packageData.pipeline.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SHA</span>
                  <span className="font-mono text-xs">
                    {packageData.pipeline.sha.slice(0, 8)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {packageData.tags && packageData.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Teglar</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {packageData.tags.map((tag) => (
                    <Badge key={tag.name} variant="outline">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Checksums */}
          {packageFiles.length > 0 && packageFiles[0].file_sha256 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tekshiruv summalari</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {packageFiles[0].file_sha256 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">SHA-256</p>
                    <p className="font-mono text-xs break-all">{packageFiles[0].file_sha256}</p>
                  </div>
                )}
                {packageFiles[0].file_md5 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">MD5</p>
                    <p className="font-mono text-xs break-all">{packageFiles[0].file_md5}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
