import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Boxes, Building2, Container, ExternalLink, Globe, HardDrive, Lock, Package } from "lucide-react";
import { getAuthenticatedClient } from "@/lib/dal";
import { PageHeader } from "@/components/ombor/page-header";
import { EmptyState, ErrorState } from "@/components/ombor/empty-state";
import { FormatBadge } from "@/components/ombor/format-badge";
import { StatusBadge, packageStatusTone } from "@/components/ombor/status-badge";
import { CopyButton } from "@/components/ombor/copy-button";
import { formatBytes, formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { getRegistrySetupSnippets } from "@/lib/gitlab/install-commands";
import type { GitLabPackage, GitLabProject, GitLabRegistryRepository, PaginatedResponse } from "@/lib/gitlab/types";
import { parsePositiveInt } from "@/lib/repositories/params";
import { containerSetupSnippets, getRepositoryProject, isStatus, roleOf } from "@/lib/repositories/server";
import { SummaryCard } from "../_components/summary-card";
import { SetupSnippets } from "../_components/setup-snippets";
import { linkButton, linkButtonGhost } from "../_components/link-styles";
import { RegistryDisabled } from "../_components/registry-disabled";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ projectId: string }> };

const VISIBILITY = { private: Lock, internal: Building2, public: Globe } as const;
const DEFAULT_FORMATS = ["npm", "maven", "pypi", "generic"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parsePositiveInt((await params).projectId);
  if (!id) return { title: "Repository" };
  try {
    const project = await getRepositoryProject(id);
    return { title: `${project.path_with_namespace} · Repositories` };
  } catch {
    return { title: "Repository" };
  }
}

export default async function RepositoryPage({ params }: Props) {
  const projectId = parsePositiveInt((await params).projectId);
  if (!projectId) notFound();

  const ctx = await getAuthenticatedClient();

  let project: GitLabProject;
  try {
    project = await getRepositoryProject(projectId);
  } catch (e) {
    if (isStatus(e, 404)) notFound();
    return (
      <>
        <PageHeader title="Repository" eyebrow={<Link href={routes.repositories} className="hover:text-foreground">Repositories</Link>} />
        <ErrorState error={e} title="Couldn't load this project from GitLab" />
      </>
    );
  }

  const packagesEnabled = project.packages_enabled !== false;
  const registryEnabled = project.container_registry_enabled !== false;

  const [pkgRes, repoRes] = await Promise.allSettled([
    packagesEnabled
      ? ctx.packages.listProjectPackages(projectId, { per_page: 20, order_by: "created_at", sort: "desc" })
      : Promise.resolve(null),
    registryEnabled ? ctx.registry.listProjectRepositories(projectId, { tagsCount: true, perPage: 50 }) : Promise.resolve(null),
  ]);

  const role = roleOf(project);
  const VisIcon = project.visibility ? VISIBILITY[project.visibility] : null;
  const stats = project.statistics;
  const pkgPage = pkgRes.status === "fulfilled" ? pkgRes.value : null;
  const repoPage = repoRes.status === "fulfilled" ? repoRes.value : null;

  // Setup snippets for the formats this project actually uses (or a few common ones).
  const usedFormats = Array.from(new Set((pkgPage?.data ?? []).map((p) => p.package_type)));
  const formats = (usedFormats.length ? usedFormats : DEFAULT_FORMATS).slice(0, 6);
  const installCtx = {
    gitlabUrl: ctx.gitlabUrl,
    projectId,
    projectPath: project.path_with_namespace,
    groupId: project.namespace.kind === "group" ? project.namespace.id : undefined,
  };
  const snippetGroups = packagesEnabled
    ? formats.map((format) => ({ format, snippets: getRegistrySetupSnippets(format, installCtx) }))
    : [];
  const containerSnippets = registryEnabled ? containerSetupSnippets(project) : [];
  if (containerSnippets.length) snippetGroups.push({ format: "container", snippets: containerSnippets });

  return (
    <>
      <PageHeader
        eyebrow={
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1">
            <Link href={routes.repositories} className="hover:text-foreground">
              Repositories
            </Link>
            <span aria-hidden>/</span>
            <span className="truncate">{project.namespace.full_path}</span>
          </nav>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="break-all">{project.name}</span>
            {VisIcon && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
                <VisIcon className="size-3" aria-hidden />
                {project.visibility}
              </span>
            )}
            {role && <StatusBadge tone="info">{role.name}</StatusBadge>}
          </span>
        }
        description={<span className="font-mono text-xs break-all">{project.path_with_namespace}</span>}
        actions={
          <>
            <a href={project.web_url} target="_blank" rel="noreferrer" className={linkButton}>
              <ExternalLink /> Project
            </a>
            {packagesEnabled && (
              <a href={`${project.web_url}/-/packages`} target="_blank" rel="noreferrer" className={linkButton}>
                <ExternalLink /> Package registry
              </a>
            )}
            {registryEnabled && (
              <a href={`${project.web_url}/container_registry`} target="_blank" rel="noreferrer" className={linkButton}>
                <ExternalLink /> Container registry
              </a>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4">
        <SummaryCard
          icon={<Package />}
          title="Packages"
          value={pkgPage ? formatNumber(pkgPage.totalItems) : "—"}
          description={formatBytes(stats?.packages_size) + " stored"}
        />
        <SummaryCard
          tone="teal"
          icon={<Container />}
          title="Images"
          value={repoPage ? formatNumber(repoPage.totalItems) : "—"}
          description={
            typeof stats?.container_registry_size === "number"
              ? `${formatBytes(stats.container_registry_size)} stored`
              : "Registry size not reported by GitLab"
          }
        />
        <SummaryCard
          tone="neutral"
          icon={<HardDrive />}
          title="Project storage"
          value={formatBytes(stats?.storage_size)}
          description={stats ? "Total project storage (repo, LFS, artifacts, packages…)." : "Statistics need Reporter access."}
        />
      </div>

      <div className="flex flex-col gap-6">
        <Section
          title="Packages"
          icon={<Boxes />}
          action={
            packagesEnabled && pkgPage && pkgPage.totalItems > 0 ? (
              <Link href={`${routes.packages}?project=${projectId}`} className={linkButtonGhost}>
                View all <ArrowRight />
              </Link>
            ) : null
          }
        >
          {!packagesEnabled ? (
            <RegistryDisabled kind="packages" webUrl={project.web_url} />
          ) : pkgRes.status === "rejected" ? (
            isStatus(pkgRes.reason, 403, 404) ? (
              <RegistryDisabled kind="packages" webUrl={project.web_url} />
            ) : (
              <ErrorState error={pkgRes.reason} title="Couldn't load packages" className="m-4" />
            )
          ) : (
            <PackagesTable page={pkgPage!} projectId={projectId} />
          )}
        </Section>

        <Section title="Container images" icon={<Container />}>
          {!registryEnabled ? (
            <RegistryDisabled kind="container" webUrl={project.web_url} />
          ) : repoRes.status === "rejected" ? (
            isStatus(repoRes.reason, 403, 404) ? (
              <RegistryDisabled kind="container" webUrl={project.web_url} />
            ) : (
              <ErrorState error={repoRes.reason} title="Couldn't load container images" className="m-4" />
            )
          ) : (
            <ImagesTable page={repoPage!} projectId={projectId} />
          )}
        </Section>

        {snippetGroups.length > 0 && (
          <Section title="Registry setup" icon={<Package />}>
            <div className="flex flex-col gap-3 p-[18px]">
              <p className="text-sm text-muted-foreground">
                Configure a client to use this project&apos;s registry. Replace{" "}
                <code className="font-mono text-xs">&lt;your_token&gt;</code> with a personal, project or deploy token
                (or <code className="font-mono text-xs">$CI_JOB_TOKEN</code> in CI).
              </p>
              <SetupSnippets groups={snippetGroups} />
            </div>
          </Section>
        )}
      </div>
    </>
  );
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-[14px] border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-[18px] py-3.5">
        <h2 className="flex items-center gap-2 text-base font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const th = "border-b px-3 py-2.5 font-medium first:px-[18px] last:px-[18px]";
const td = "px-3 py-3 first:px-[18px] last:px-[18px]";

function PackagesTable({ page, projectId }: { page: PaginatedResponse<GitLabPackage>; projectId: number }) {
  if (page.data.length === 0) {
    return (
      <EmptyState
        className="m-4"
        icon={<Boxes />}
        title="No packages yet"
        description="Publish a package to this project's registry with one of the setup snippets below, or from CI."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-muted/40 text-left text-muted-foreground">
            <th className={th}>Name</th>
            <th className={th}>Format</th>
            <th className={th}>Version</th>
            <th className={th}>Status</th>
            <th className={th}>Published</th>
          </tr>
        </thead>
        <tbody>
          {page.data.map((p) => (
            <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
              <td className={`${td} max-w-[320px]`}>
                <Link href={routes.package(projectId, p.id)} className="block truncate font-medium text-foreground hover:text-primary">
                  {p.name}
                </Link>
              </td>
              <td className={td}>
                <FormatBadge type={p.package_type} />
              </td>
              <td className={`${td} max-w-[200px] truncate font-mono text-xs`}>{p.version || "—"}</td>
              <td className={td}>
                <StatusBadge tone={packageStatusTone(p.status)}>{p.status === "default" ? "active" : p.status}</StatusBadge>
              </td>
              <td className={`${td} whitespace-nowrap text-muted-foreground`} title={formatDateTime(p.created_at)}>
                {timeAgo(p.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {page.totalItems > page.data.length && (
        <p className="border-t px-[18px] py-3 text-xs text-muted-foreground">
          Showing the {page.data.length} most recent of {formatNumber(page.totalItems)} packages.
        </p>
      )}
    </div>
  );
}

function ImagesTable({ page, projectId }: { page: PaginatedResponse<GitLabRegistryRepository>; projectId: number }) {
  if (page.data.length === 0) {
    return (
      <EmptyState
        className="m-4"
        icon={<Container />}
        title="No container images yet"
        description="Push an image with the Container setup snippet below and it will show up here."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-muted/40 text-left text-muted-foreground">
            <th className={th}>Image</th>
            <th className={th}>Location</th>
            <th className={`${th} text-right`}>Tags</th>
            <th className={th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {page.data.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
              <td className={`${td} max-w-[280px]`}>
                <Link
                  href={routes.containerRepository(projectId, r.id)}
                  className="block truncate font-medium text-foreground hover:text-primary"
                >
                  {r.name || r.path}
                </Link>
                {r.status && <span className="text-xs text-warning">{r.status.replace(/_/g, " ")}</span>}
              </td>
              <td className={td}>
                <span className="inline-flex max-w-[420px] items-center gap-1">
                  <code className="truncate font-mono text-xs text-muted-foreground">{r.location}</code>
                  <CopyButton text={r.location} label="Copy image location" />
                </span>
              </td>
              <td className={`${td} tabular text-right`}>{formatNumber(r.tags_count)}</td>
              <td className={`${td} whitespace-nowrap text-muted-foreground`} title={formatDateTime(r.created_at)}>
                {timeAgo(r.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {page.nextPage && (
        <p className="border-t px-[18px] py-3 text-xs text-muted-foreground">
          Showing the first {page.data.length} of {formatNumber(page.totalItems)} images.
        </p>
      )}
    </div>
  );
}
