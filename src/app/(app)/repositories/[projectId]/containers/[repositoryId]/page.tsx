import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, Container, ExternalLink, HardDrive, Tags } from "lucide-react";
import { getAuthenticatedClient } from "@/lib/dal";
import { PageHeader } from "@/components/ombor/page-header";
import { ErrorState } from "@/components/ombor/empty-state";
import { CodeBlock } from "@/components/ombor/code-block";
import { CopyButton } from "@/components/ombor/copy-button";
import { Pagination } from "@/components/ombor/pagination";
import { StatusBadge } from "@/components/ombor/status-badge";
import { formatBytes, formatDate, formatNumber, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { parsePage, parsePositiveInt } from "@/lib/repositories/params";
import {
  canMaintain,
  getContainerRepository,
  getRepositoryProject,
  isStatus,
  listTagsWithDetails,
  roleOf,
} from "@/lib/repositories/server";
import { SummaryCard } from "../../../_components/summary-card";
import { linkButton } from "../../../_components/link-styles";
import { RegistryDisabled } from "../../../_components/registry-disabled";
import { TagsTable, type TagRow } from "./tags-table";
import { DeleteRepositoryButton } from "./delete-repository-button";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; repositoryId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const repositoryId = parsePositiveInt((await params).repositoryId);
  if (!repositoryId) return { title: "Container repository" };
  try {
    const repo = await getContainerRepository(repositoryId);
    return { title: `${repo.path} · Container repository` };
  } catch {
    return { title: "Container repository" };
  }
}

export default async function ContainerRepositoryPage({ params, searchParams }: Props) {
  const p = await params;
  const projectId = parsePositiveInt(p.projectId);
  const repositoryId = parsePositiveInt(p.repositoryId);
  if (!projectId || !repositoryId) notFound();
  const page = parsePage((await searchParams).page);

  const ctx = await getAuthenticatedClient();
  const [repoRes, projectRes, tagsRes] = await Promise.allSettled([
    getContainerRepository(repositoryId),
    getRepositoryProject(projectId),
    listTagsWithDetails(ctx, projectId, repositoryId, page),
  ]);

  if (repoRes.status === "rejected" && isStatus(repoRes.reason, 404)) notFound();
  if (projectRes.status === "rejected" && isStatus(projectRes.reason, 404)) notFound();
  if (repoRes.status === "fulfilled" && repoRes.value.project_id !== projectId) notFound();

  const eyebrow = (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1">
      <Link href={routes.repositories} className="hover:text-foreground">
        Repositories
      </Link>
      <span aria-hidden>/</span>
      {projectRes.status === "fulfilled" ? (
        <Link href={routes.repository(projectId)} className="truncate hover:text-foreground">
          {projectRes.value.path_with_namespace}
        </Link>
      ) : (
        <Link href={routes.repository(projectId)} className="hover:text-foreground">
          Project {projectId}
        </Link>
      )}
      <span aria-hidden>/</span>
      <span>Container images</span>
    </nav>
  );

  if (repoRes.status === "rejected") {
    return (
      <>
        <PageHeader title="Container repository" eyebrow={eyebrow} />
        {isStatus(repoRes.reason, 403) ? (
          <RegistryDisabled kind="container" webUrl={projectRes.status === "fulfilled" ? projectRes.value.web_url : undefined} />
        ) : (
          <ErrorState error={repoRes.reason} title="Couldn't load this container repository" />
        )}
      </>
    );
  }

  const repo = repoRes.value;
  const project = projectRes.status === "fulfilled" ? projectRes.value : null;
  const role = project ? roleOf(project) : null;
  const canDelete = project ? canMaintain(project) : false;
  const deleting = repo.status === "delete_scheduled" || repo.status === "delete_ongoing";
  const exampleTag = tagsRes.status === "fulfilled" ? (tagsRes.value.page.data[0]?.name ?? "latest") : "latest";

  const tags: TagRow[] =
    tagsRes.status === "fulfilled"
      ? tagsRes.value.page.data.map((t) => ({
          name: t.name,
          digest: t.digest ?? null,
          revision: t.short_revision ?? null,
          totalSize: typeof t.total_size === "number" ? t.total_size : null,
          createdAt: t.created_at ?? null,
        }))
      : [];

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="break-all">{repo.name || repo.path}</span>
            {role && <StatusBadge tone="info">{role.name}</StatusBadge>}
            {deleting && <StatusBadge tone="warning">Deletion scheduled</StatusBadge>}
          </span>
        }
        description={<span className="font-mono text-xs break-all">{repo.path}</span>}
        actions={
          <>
            {project && (
              <a
                href={`${project.web_url}/container_registry/${repo.id}`}
                target="_blank"
                rel="noreferrer"
                className={linkButton}
              >
                <ExternalLink /> Open in GitLab
              </a>
            )}
            {canDelete && !deleting && (
              <DeleteRepositoryButton
                projectId={projectId}
                repositoryId={repo.id}
                path={repo.path}
                tagsCount={repo.tags_count ?? null}
              />
            )}
          </>
        }
      />

      {projectRes.status === "rejected" && (
        <ErrorState
          error={projectRes.reason}
          title="Couldn't load the project — your role is unknown, so delete actions are hidden"
          className="mb-6"
        />
      )}

      {deleting && (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          GitLab is deleting this repository in the background. Tags may still be listed until it finishes.
        </p>
      )}

      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4">
        <SummaryCard icon={<Tags />} title="Tags" value={formatNumber(repo.tags_count)} />
        <SummaryCard
          tone="teal"
          icon={<HardDrive />}
          title="Size"
          value={formatBytes(repo.size)}
          description={
            typeof repo.size === "number"
              ? "Deduplicated size reported by the registry."
              : "Reported only when GitLab's container registry metadata database is enabled."
          }
        />
        <SummaryCard
          tone="neutral"
          icon={<CalendarClock />}
          title="Created"
          value={<span className="text-lg">{formatDate(repo.created_at)}</span>}
          description={
            repo.cleanup_policy_started_at
              ? `Cleanup policy last ran ${timeAgo(repo.cleanup_policy_started_at)}.`
              : "No cleanup policy run recorded."
          }
        />
      </div>

      <section className="mb-6 flex flex-col gap-3 rounded-[14px] border bg-card p-[18px]">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Container className="size-4 text-muted-foreground" /> Pull this image
        </h2>
        <div className="flex min-w-0 items-center gap-1 text-sm">
          <span className="shrink-0 text-muted-foreground">Location</span>
          <code className="min-w-0 truncate font-mono text-xs">{repo.location}</code>
          <CopyButton text={repo.location} label="Copy image location" />
        </div>
        <CodeBlock code={`docker pull ${repo.location}:${exampleTag}`} />
      </section>

      <section className="flex flex-col rounded-[14px] border bg-card pb-2">
        <div className="flex items-center justify-between gap-3 border-b px-[18px] py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Tags className="size-4 text-muted-foreground" /> Tags
          </h2>
          {tagsRes.status === "fulfilled" && tagsRes.value.detailFailures > 0 && (
            <span className="text-xs text-warning">
              Details unavailable for {tagsRes.value.detailFailures} tag{tagsRes.value.detailFailures === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {tagsRes.status === "rejected" ? (
          isStatus(tagsRes.reason, 403, 404) ? (
            <RegistryDisabled kind="container" webUrl={project?.web_url} />
          ) : (
            <ErrorState error={tagsRes.reason} title="Couldn't load tags" className="m-4" />
          )
        ) : (
          <TagsTable
            projectId={projectId}
            repositoryId={repo.id}
            location={repo.location}
            tags={tags}
            canDelete={canDelete}
          />
        )}
      </section>

      {tagsRes.status === "fulfilled" && (
        <Pagination
          page={tagsRes.value.page.currentPage}
          totalPages={tagsRes.value.page.totalPages}
          hasNext={Boolean(tagsRes.value.page.nextPage)}
          hrefFor={(n) => `${routes.containerRepository(projectId, repositoryId)}${n > 1 ? `?page=${n}` : ""}`}
        />
      )}
    </>
  );
}
