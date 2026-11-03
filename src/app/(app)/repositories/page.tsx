import Link from "next/link";
import { Boxes, Container, FolderGit2, Info, Lock, Globe, Building2 } from "lucide-react";
import { getAuthenticatedClient } from "@/lib/dal";
import { PageHeader } from "@/components/ombor/page-header";
import { EmptyState, ErrorState } from "@/components/ombor/empty-state";
import { StatusBadge } from "@/components/ombor/status-badge";
import { CopyButton } from "@/components/ombor/copy-button";
import { Pagination } from "@/components/ombor/pagination";
import { formatBytes, formatNumber, timeAgo, formatDateTime } from "@/lib/format";
import { routes } from "@/lib/routes";
import type { GitLabProject } from "@/lib/gitlab/types";
import { parseRepositoryListParams, repositoriesHref } from "@/lib/repositories/params";
import { listFilterGroups, listRepositoryProjects, roleOf } from "@/lib/repositories/server";
import { RepositoryFilters } from "./repository-filters";
import { SummaryCard } from "./_components/summary-card";

export const metadata = { title: "Repositories" };
export const dynamic = "force-dynamic";

const VISIBILITY = {
  private: { icon: Lock, label: "Private" },
  internal: { icon: Building2, label: "Internal" },
  public: { icon: Globe, label: "Public" },
} as const;

function sumStat(projects: GitLabProject[], key: "packages_size" | "container_registry_size") {
  let total = 0;
  let reported = 0;
  for (const p of projects) {
    const v = p.statistics?.[key];
    if (typeof v === "number") {
      total += v;
      reported++;
    }
  }
  return { total, reported };
}

export default async function RepositoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseRepositoryListParams(await searchParams);
  const ctx = await getAuthenticatedClient();

  const [listRes, groupsRes] = await Promise.allSettled([listRepositoryProjects(ctx, params), listFilterGroups(ctx)]);
  const groups = groupsRes.status === "fulfilled" ? groupsRes.value.map((g) => ({ id: g.id, fullPath: g.full_path })) : null;

  const header = (
    <PageHeader
      title="Repositories"
      description="Each GitLab project you're a member of is a repository: its own package registry plus container registry. Open one to see its packages, images and client setup."
    />
  );

  if (listRes.status === "rejected") {
    return (
      <>
        {header}
        <ErrorState error={listRes.reason} title="Couldn't load your projects from GitLab" />
      </>
    );
  }

  const { page: result, sortFallback } = listRes.value;
  const projects = result.data;
  const pkg = sumStat(projects, "packages_size");
  const reg = sumStat(projects, "container_registry_size");
  const pkgEnabled = projects.filter((p) => p.packages_enabled).length;
  const regEnabled = projects.filter((p) => p.container_registry_enabled).length;
  // GitLab omits x-total on very large collections (>10k); then totalItems is just this page's length.
  const totalKnown = result.totalItems > projects.length || (!result.nextPage && result.currentPage === 1);
  const filtered = Boolean(params.q || params.group);

  return (
    <>
      {header}

      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4">
        <SummaryCard
          icon={<FolderGit2 />}
          title="Project registries"
          value={totalKnown ? formatNumber(result.totalItems) : "10,000+"}
          description={
            filtered
              ? "Projects matching the current filter."
              : `Projects you're a member of. ${pkgEnabled} of ${projects.length} on this page have the package registry enabled.`
          }
        />
        <SummaryCard
          tone="violet"
          icon={<Boxes />}
          title="Package storage"
          value={pkg.reported ? formatBytes(pkg.total) : "—"}
          description={
            pkg.reported
              ? `Sum for the ${pkg.reported} project${pkg.reported === 1 ? "" : "s"} on this page whose statistics GitLab shares with you.`
              : "GitLab shares storage statistics only with Reporter+ members."
          }
        />
        <SummaryCard
          tone="teal"
          icon={<Container />}
          title="Container storage"
          value={reg.reported ? formatBytes(reg.total) : "—"}
          description={
            reg.reported
              ? `Container registry size on this page. ${regEnabled} of ${projects.length} projects have the container registry enabled.`
              : `Not reported by this GitLab instance. ${regEnabled} of ${projects.length} projects on this page have the container registry enabled.`
          }
        />
      </div>

      {sortFallback && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border bg-info-soft px-4 py-3 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" />
          GitLab only allows administrators to sort projects by storage size, so results are sorted by last activity.
        </p>
      )}

      <section className="flex flex-col rounded-[14px] border bg-card">
        <RepositoryFilters params={params} groups={groups} />
        {projects.length === 0 ? (
          <EmptyState
            className="m-4 border-dashed"
            icon={<FolderGit2 />}
            title={filtered ? "No repositories match" : "No repositories yet"}
            description={
              filtered
                ? "Try a different search term or group."
                : "You're not a member of any GitLab project yet. Projects you join will appear here."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-muted/40 text-left text-muted-foreground">
                  <th className="border-b px-[18px] py-2.5 font-medium">Repository</th>
                  <th className="border-b px-3 py-2.5 font-medium">Registries</th>
                  <th className="border-b px-3 py-2.5 font-medium">Endpoint</th>
                  <th className="border-b px-3 py-2.5 text-right font-medium">Packages</th>
                  <th className="border-b px-3 py-2.5 text-right font-medium">Containers</th>
                  <th className="border-b px-3 py-2.5 font-medium">Last activity</th>
                  <th className="border-b px-[18px] py-2.5 font-medium">Your role</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <RepositoryRow key={p.id} project={p} gitlabUrl={ctx.gitlabUrl} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Pagination
        page={result.currentPage}
        totalPages={totalKnown ? result.totalPages : null}
        hasNext={Boolean(result.nextPage)}
        hrefFor={(page) => repositoriesHref({ ...params, page })}
      />
    </>
  );
}

function RepositoryRow({ project: p, gitlabUrl }: { project: GitLabProject; gitlabUrl: string }) {
  const vis = p.visibility ? VISIBILITY[p.visibility] : null;
  const role = roleOf(p);
  const endpoint = `${gitlabUrl}/api/v4/projects/${p.id}/packages`;
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30">
      <td className="max-w-[320px] px-[18px] py-3.5">
        <Link href={routes.repository(p.id)} className="flex flex-col gap-0.5 text-foreground hover:text-primary">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{p.name}</span>
            {vis && <vis.icon className="size-3.5 shrink-0 text-muted-foreground" aria-label={vis.label} />}
          </span>
          <span className="truncate text-xs text-muted-foreground">{p.namespace.full_path}</span>
        </Link>
      </td>
      <td className="px-3 py-3.5">
        <div className="flex flex-wrap gap-1">
          <StatusBadge tone={p.packages_enabled ? "info" : "neutral"}>
            Packages{p.packages_enabled ? "" : " off"}
          </StatusBadge>
          <StatusBadge tone={p.container_registry_enabled ? "info" : "neutral"}>
            Container{p.container_registry_enabled ? "" : " off"}
          </StatusBadge>
        </div>
      </td>
      <td className="px-3 py-3.5">
        <span className="inline-flex items-center gap-1">
          <code className="font-mono text-xs whitespace-nowrap text-muted-foreground">/projects/{p.id}/packages</code>
          <CopyButton text={endpoint} label="Copy endpoint" />
        </span>
      </td>
      <td className="tabular px-3 py-3.5 text-right whitespace-nowrap">{formatBytes(p.statistics?.packages_size)}</td>
      <td className="tabular px-3 py-3.5 text-right whitespace-nowrap">{formatBytes(p.statistics?.container_registry_size)}</td>
      <td className="px-3 py-3.5 whitespace-nowrap text-muted-foreground" title={formatDateTime(p.last_activity_at)}>
        {timeAgo(p.last_activity_at)}
      </td>
      <td className="px-[18px] py-3.5 whitespace-nowrap">{role ? role.name : "—"}</td>
    </tr>
  );
}
