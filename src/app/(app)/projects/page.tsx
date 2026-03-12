import { getAuthenticatedClient } from "@/lib/dal";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderGit2, Layers, ExternalLink } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; group?: string }>;
}) {
  const params = await searchParams;
  const { groups, projects } = await getAuthenticatedClient();
  const page = parseInt(params.page || "1", 10);

  const groupId = params.group ? parseInt(params.group, 10) : undefined;

  const [groupsResult, projectsResult] = await Promise.all([
    groupId
      ? groups.listSubgroups(groupId, { page, per_page: 20, order_by: "name", sort: "asc" })
      : groups.listGroups({ page, per_page: 20, order_by: "name", sort: "asc", top_level_only: true }),
    groupId
      ? projects.listGroupProjects(groupId, { page, per_page: 50, order_by: "name", sort: "asc" })
      : projects.listProjects({ page, per_page: 50, order_by: "last_activity_at", sort: "desc" }),
  ]);

  let currentGroup = null;
  if (groupId) {
    try {
      currentGroup = await groups.getGroup(groupId);
    } catch {
      // group not found
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          {currentGroup && (
            <Link href="/projects" className="text-muted-foreground hover:text-foreground text-sm">
              Barcha guruhlar
            </Link>
          )}
          {currentGroup && <span className="text-muted-foreground">/</span>}
          <h1 className="text-2xl font-bold tracking-tight">
            {currentGroup ? currentGroup.full_name : "Loyihalar va Guruhlar"}
          </h1>
        </div>
        <p className="text-muted-foreground mt-1">
          {currentGroup
            ? currentGroup.description || "Guruh ichidagi loyihalar va kichik guruhlar"
            : "GitLab guruhlari va loyihalar bo'yicha navigatsiya"}
        </p>
      </div>

      {/* Groups */}
      {groupsResult.data.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Guruhlar ({groupsResult.totalItems})
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {groupsResult.data.map((group) => (
              <Link key={group.id} href={`/projects?group=${group.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                      {group.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {group.description || group.full_path}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      {projectsResult.data.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FolderGit2 className="h-5 w-5" />
            Loyihalar ({projectsResult.totalItems})
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {projectsResult.data.map((project) => (
              <Link key={project.id} href={`/packages?project=${project.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FolderGit2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {project.description || project.path_with_namespace}
                    </p>
                    <Badge variant="secondary" className="mt-2 text-xs">
                      {project.namespace.full_path}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {groupsResult.data.length === 0 && projectsResult.data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderGit2 className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold">Hech narsa topilmadi</h2>
          <p className="text-muted-foreground mt-2">
            Bu guruhda loyiha yoki kichik guruh yo&apos;q
          </p>
        </div>
      )}

      {/* Pagination */}
      {(groupsResult.totalPages > 1 || projectsResult.totalPages > 1) && (
        <div className="flex items-center justify-center gap-2 pt-4">
          {page > 1 && (
            <Link
              href={`/projects?page=${page - 1}${groupId ? `&group=${groupId}` : ""}`}
              className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted"
            >
              Oldingi
            </Link>
          )}
          <span className="text-sm text-muted-foreground px-3">
            Sahifa {page} / {Math.max(groupsResult.totalPages, projectsResult.totalPages)}
          </span>
          {(groupsResult.nextPage || projectsResult.nextPage) && (
            <Link
              href={`/projects?page=${page + 1}${groupId ? `&group=${groupId}` : ""}`}
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
