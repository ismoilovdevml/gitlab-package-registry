import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink, FileArchive, GitBranch, Layers, Package } from "lucide-react";
import { CopyButton } from "@/components/ombor/copy-button";
import { SnippetTabs } from "@/components/ombor/code-block";
import { EmptyState, ErrorState } from "@/components/ombor/empty-state";
import { FormatBadge } from "@/components/ombor/format-badge";
import { StatusBadge, packageStatusTone } from "@/components/ombor/status-badge";
import { getAuthenticatedClient } from "@/lib/dal";
import { NotFoundError } from "@/lib/gitlab/errors";
import { getFormat } from "@/lib/gitlab/formats";
import { getInstallSnippets, getRegistrySetupSnippets, type InstallContext } from "@/lib/gitlab/install-commands";
import { accessLevelOf } from "@/lib/gitlab/permissions";
import {
  AccessLevel,
  type GitLabPackage,
  type GitLabPackageFile,
  type GitLabPipelineRef,
  type GitLabProject,
} from "@/lib/gitlab/types";
import { formatBytes, formatDateTime, formatNumber, shortSha, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { DeletePackageButton } from "./_components/delete-package-button";
import { FilesTable } from "./_components/files-table";
import { LinkButton } from "./_components/link-button";
import { PipelineLink } from "./_components/pipeline-link";
import { PipelinesTable } from "./_components/pipelines-table";
import { packageStatusLabel } from "./_components/status";
import { VersionSelect } from "./_components/version-select";
import { VersionsTable } from "./_components/versions-table";

export const dynamic = "force-dynamic";

type Params = Promise<{ projectId: string; packageId: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const TABS = ["overview", "versions", "files", "pipelines"] as const;
type Tab = (typeof TABS)[number];

function parseId(value: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

// Shared between generateMetadata and the page within one request.
const loadPackage = cache(async (projectId: number, packageId: number) => {
  const { packages } = await getAuthenticatedClient();
  return packages.getPackage(projectId, packageId);
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { projectId, packageId } = await params;
  const p = parseId(projectId);
  const k = parseId(packageId);
  if (!p || !k) return { title: "Package" };
  try {
    const pkg = await loadPackage(p, k);
    return { title: `${pkg.name}@${pkg.version}` };
  } catch {
    return { title: "Package" };
  }
}

function value<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === "fulfilled" ? r.value : null;
}

const panel = "rounded-xl border bg-card";

export default async function PackageDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const raw = await params;
  const projectId = parseId(raw.projectId);
  const packageId = parseId(raw.packageId);
  if (!projectId || !packageId) notFound();

  const sp = await searchParams;
  const tabParam = typeof sp.tab === "string" ? sp.tab : "";
  const tab: Tab = (TABS as readonly string[]).includes(tabParam) ? (tabParam as Tab) : "overview";

  const ctx = await getAuthenticatedClient();
  const pkgPromise = loadPackage(projectId, packageId);
  const [pkgR, projectR, filesR, pipelinesR, versionsR] = await Promise.allSettled([
    pkgPromise,
    ctx.projects.getProject(projectId),
    ctx.packages.getPackageFiles(projectId, packageId),
    ctx.packages.getPackagePipelines(projectId, packageId),
    pkgPromise.then((p) => ctx.packages.listPackageVersions(projectId, p.name, p.package_type)),
  ]);

  if (pkgR.status === "rejected") {
    if (pkgR.reason instanceof NotFoundError) notFound();
    return (
      <div className="flex flex-col gap-5">
        <Breadcrumb projectId={projectId} />
        <ErrorState error={pkgR.reason} title="Couldn't load this package from GitLab" />
      </div>
    );
  }

  const pkg = pkgR.value;
  const project = value(projectR);
  const files = value(filesR);
  const pipelines = value(pipelinesR);
  const versions = value(versionsR);

  const canDelete = project ? accessLevelOf(project) >= AccessLevel.MAINTAINER : false;
  const projectPath = project?.path_with_namespace;
  const format = getFormat(pkg.package_type);
  const webUrl = pkg._links?.web_path ? `${ctx.gitlabUrl}${pkg._links.web_path}` : null;
  const downloadUrls: Record<number, string> = {};
  if (projectPath && files) {
    for (const f of files) downloadUrls[f.id] = ctx.packages.fileWebUrl(projectPath, f.id);
  }
  const singleFile = files && files.length === 1 ? files[0] : null;

  const tabHref = (t: Tab) => (t === "overview" ? routes.package(projectId, packageId) : `${routes.package(projectId, packageId)}?tab=${t}`);
  const tabs: { key: Tab; label: string; count?: number | null }[] = [
    { key: "overview", label: "Overview" },
    { key: "versions", label: "Versions", count: versions?.length ?? null },
    { key: "files", label: "Files", count: files?.length ?? null },
    { key: "pipelines", label: "Pipelines", count: pipelines?.length ?? null },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumb projectId={projectId} projectPath={projectPath} name={pkg.name} />

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className={cn("hidden size-14 shrink-0 items-center justify-center rounded-[14px] sm:flex", format.badge)}
            aria-hidden
          >
            <Package className="size-6" />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-2xl font-semibold tracking-[-0.02em] break-all sm:text-[28px]">{pkg.name}</h1>
              <FormatBadge type={pkg.package_type} />
              <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[13px] font-medium">{pkg.version}</span>
              <StatusBadge tone={packageStatusTone(pkg.status)} dot>
                {packageStatusLabel(pkg.status)}
              </StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground">
              in{" "}
              <Link href={routes.repository(projectId)} className="font-medium text-primary hover:underline">
                {projectPath ?? `project #${projectId}`}
              </Link>{" "}
              · published <span title={formatDateTime(pkg.created_at)}>{timeAgo(pkg.created_at)}</span>
            </p>
            {pkg.tags && pkg.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pkg.tags.map((t) => (
                  <span key={t.name} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {versions && versions.length > 1 && (
            <VersionSelect
              projectId={projectId}
              currentId={pkg.id}
              versions={withCurrent(versions, pkg).map((v) => ({
                id: v.id,
                version: v.version,
                tags: (v.tags ?? []).map((t) => t.name),
              }))}
            />
          )}
          {singleFile && downloadUrls[singleFile.id] && (
            <LinkButton external href={downloadUrls[singleFile.id]} title={`Download ${singleFile.file_name} via GitLab`}>
              <Download />
              Download
            </LinkButton>
          )}
          {webUrl && (
            <LinkButton external href={webUrl}>
              <ExternalLink />
              Open in GitLab
            </LinkButton>
          )}
          {canDelete && (
            <DeletePackageButton projectId={projectId} packageId={pkg.id} name={pkg.name} version={pkg.version} isCurrent />
          )}
        </div>
      </div>

      <nav aria-label="Package sections" className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 shrink-0 items-center border-b-2 px-3.5 text-sm whitespace-nowrap transition-colors",
                active
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count !== undefined && t.count !== null && <span className="tabular ml-1">· {formatNumber(t.count)}</span>}
            </Link>
          );
        })}
      </nav>

      {tab === "overview" && (
        <Overview
          pkg={pkg}
          project={project}
          projectR={projectR}
          files={files}
          filesR={filesR}
          pipelines={pipelines}
          versions={versions}
          versionsR={versionsR}
          gitlabUrl={ctx.gitlabUrl}
          projectId={projectId}
          canDelete={canDelete}
          versionsHref={tabHref("versions")}
        />
      )}

      {tab === "versions" && (
        <section className={panel}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
            <h2 className="text-base font-semibold">All versions</h2>
            <span className="text-[13px] text-muted-foreground">
              GitLab&apos;s API doesn&apos;t expose download counts, so the last download time is shown instead.
            </span>
          </div>
          {versionsR.status === "rejected" ? (
            <ErrorState error={versionsR.reason} className="m-5 mt-0" />
          ) : versions && versions.length > 0 ? (
            <VersionsTable projectId={projectId} currentId={pkg.id} versions={versions} canDelete={canDelete} />
          ) : (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No other versions found.</p>
          )}
        </section>
      )}

      {tab === "files" && (
        <section className={panel}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
            <h2 className="text-base font-semibold">Files</h2>
            {files && files.length > 0 && (
              <span className="tabular text-[13px] text-muted-foreground">
                {formatNumber(files.length)} {files.length === 1 ? "file" : "files"} · {formatBytes(totalSize(files))}
              </span>
            )}
          </div>
          {filesR.status === "rejected" ? (
            <ErrorState error={filesR.reason} className="m-5 mt-0" />
          ) : files && files.length > 0 ? (
            <FilesTable
              projectId={projectId}
              packageId={pkg.id}
              files={files}
              downloadUrls={downloadUrls}
              canDelete={canDelete}
            />
          ) : (
            <EmptyState
              icon={<FileArchive />}
              title="No files"
              description="GitLab has no files stored for this package version."
              className="m-5 mt-0"
            />
          )}
        </section>
      )}

      {tab === "pipelines" && (
        <section className={panel}>
          <div className="px-5 py-4">
            <h2 className="text-base font-semibold">Pipelines</h2>
            <p className="text-[13px] text-muted-foreground">CI pipelines that built or updated this package version.</p>
          </div>
          {pipelinesR.status === "rejected" ? (
            <ErrorState error={pipelinesR.reason} className="m-5 mt-0" />
          ) : pipelines && pipelines.length > 0 ? (
            <PipelinesTable pipelines={pipelines} />
          ) : (
            <EmptyState
              icon={<GitBranch />}
              title="No pipelines"
              description="This version was published outside CI (for example from a developer machine), so GitLab has no pipeline for it."
              className="m-5 mt-0"
            />
          )}
        </section>
      )}
    </div>
  );
}

function Breadcrumb({ projectId, projectPath, name }: { projectId: number; projectPath?: string; name?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
      <Link href={routes.packages} className="text-primary hover:underline">
        Packages
      </Link>
      <span aria-hidden>/</span>
      <Link href={routes.repository(projectId)} className="break-all hover:text-foreground hover:underline">
        {projectPath ?? `project #${projectId}`}
      </Link>
      {name && (
        <>
          <span aria-hidden>/</span>
          <span className="break-all text-foreground" aria-current="page">
            {name}
          </span>
        </>
      )}
    </nav>
  );
}

function totalSize(files: GitLabPackageFile[]): number {
  return files.reduce((sum, f) => sum + (f.size || 0), 0);
}

/** The versions list may not include the current package (e.g. hidden status); make sure the select can show it. */
function withCurrent(versions: GitLabPackage[], pkg: GitLabPackage): GitLabPackage[] {
  return versions.some((v) => v.id === pkg.id) ? versions : [pkg, ...versions];
}

function Overview({
  pkg,
  project,
  projectR,
  files,
  filesR,
  pipelines,
  versions,
  versionsR,
  gitlabUrl,
  projectId,
  canDelete,
  versionsHref,
}: {
  pkg: GitLabPackage;
  project: GitLabProject | null;
  projectR: PromiseSettledResult<GitLabProject>;
  files: GitLabPackageFile[] | null;
  filesR: PromiseSettledResult<GitLabPackageFile[]>;
  pipelines: GitLabPipelineRef[] | null;
  versions: GitLabPackage[] | null;
  versionsR: PromiseSettledResult<GitLabPackage[]>;
  gitlabUrl: string;
  projectId: number;
  canDelete: boolean;
  versionsHref: string;
}) {
  const installCtx: InstallContext = {
    gitlabUrl,
    projectId,
    projectPath: project?.path_with_namespace,
    groupId: project?.namespace.kind === "group" ? project.namespace.id : undefined,
  };
  const installSnippets = getInstallSnippets(
    { packageType: pkg.package_type, name: pkg.name, version: pkg.version, fileName: files?.[0]?.file_name },
    installCtx,
  );
  const setupSnippets = getRegistrySetupSnippets(pkg.package_type, installCtx);
  const pipeline = pkg.pipeline ?? pkg.pipelines?.[0] ?? pipelines?.[0] ?? null;
  const primaryFile = files && files.length === 1 ? files[0] : null;

  // Tag → version map across all versions (npm dist-tags etc.).
  const distTags: { tag: string; version: string; id: number }[] = [];
  for (const v of versions ?? []) {
    for (const t of v.tags ?? []) distTags.push({ tag: t.name, version: v.version, id: v.id });
  }

  const details: { label: string; value: React.ReactNode }[] = [
    { label: "Size", value: files ? formatBytes(totalSize(files)) : "—" },
    { label: "Files", value: files ? formatNumber(files.length) : "—" },
    { label: "Published", value: <span title={formatDateTime(pkg.created_at)}>{formatDateTime(pkg.created_at)}</span> },
    {
      label: "Last downloaded",
      value: pkg.last_downloaded_at ? (
        <span title={formatDateTime(pkg.last_downloaded_at)}>{timeAgo(pkg.last_downloaded_at)}</span>
      ) : (
        <span className="text-muted-foreground">Never</span>
      ),
    },
    { label: "Pipeline", value: <PipelineLink pipeline={pipeline} /> },
    {
      label: "Commit",
      value: pipeline?.sha ? (
        <span className="font-mono" title={pipeline.sha}>
          {shortSha(pipeline.sha, 8)}
        </span>
      ) : (
        "—"
      ),
    },
    { label: "Published by", value: pipeline?.user ? pipeline.user.name : "—" },
    {
      label: "Status",
      value: <StatusBadge tone={packageStatusTone(pkg.status)}>{packageStatusLabel(pkg.status)}</StatusBadge>,
    },
  ];

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5">
        <section className={cn(panel, "flex flex-col gap-3.5 px-5 py-5 sm:px-[22px]")}>
          <h2 className="text-base font-semibold">Install</h2>
          <SnippetTabs snippets={installSnippets} />
          {setupSnippets.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              <span className="text-[13px] text-muted-foreground">
                Configure this project&apos;s {getFormat(pkg.package_type).label} registry once (replace the placeholders
                with a personal, project or deploy token):
              </span>
              <SnippetTabs snippets={setupSnippets} />
            </div>
          )}
          {projectR.status === "rejected" && (
            <p className="text-xs text-muted-foreground">
              Project details couldn&apos;t be loaded, so some snippets use placeholders.
            </p>
          )}
        </section>

        <section className={panel}>
          <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-[22px]">
            <h2 className="text-base font-semibold">Recent versions</h2>
            {versions && versions.length > 0 && (
              <Link href={versionsHref} scroll={false} className="text-[13px] font-medium text-primary hover:underline">
                All {formatNumber(versions.length)} {versions.length === 1 ? "version" : "versions"}
              </Link>
            )}
          </div>
          {versionsR.status === "rejected" ? (
            <ErrorState error={versionsR.reason} className="m-5 mt-0" />
          ) : versions && versions.length > 0 ? (
            <VersionsTable
              compact
              projectId={projectId}
              currentId={pkg.id}
              versions={versions.slice(0, 5)}
              canDelete={canDelete}
            />
          ) : (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No versions found.</p>
          )}
        </section>
      </div>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
        <section className={cn(panel, "flex flex-col gap-3.5 px-5 py-5 sm:px-[22px]")}>
          <h2 className="text-base font-semibold">Details</h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3.5 text-[13px]">
            {details.map((d) => (
              <div key={d.label} className="flex min-w-0 flex-col gap-1">
                <dt className="text-muted-foreground">{d.label}</dt>
                <dd className="truncate font-medium">{d.value}</dd>
              </div>
            ))}
          </dl>
          {filesR.status === "rejected" && <ErrorState error={filesR.reason} title="Couldn't load files" />}
          {primaryFile?.file_sha256 && (
            <div className="flex flex-col gap-1.5 text-[13px]">
              <span className="text-muted-foreground">SHA-256</span>
              <div className="flex items-start gap-1">
                <code className="min-w-0 flex-1 rounded-lg border bg-muted/60 px-2.5 py-2 font-mono text-xs break-all">
                  {primaryFile.file_sha256}
                </code>
                <CopyButton text={primaryFile.file_sha256} label="Copy SHA-256" />
              </div>
            </div>
          )}
          {project && (
            <LinkButton external href={project.web_url} className="w-full">
              <ExternalLink />
              Open project in GitLab
            </LinkButton>
          )}
        </section>

        {distTags.length > 0 && (
          <section className={cn(panel, "flex flex-col gap-3 px-5 py-5 sm:px-[22px]")}>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Layers className="size-4 text-muted-foreground" aria-hidden />
              Tags
            </h2>
            <ul className="flex flex-col gap-2.5">
              {distTags.map((t) => (
                <li key={`${t.tag}-${t.id}`} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="font-medium">{t.tag}</span>
                  {t.id === pkg.id ? (
                    <span className="font-mono">{t.version}</span>
                  ) : (
                    <Link href={routes.package(projectId, t.id)} className="font-mono text-primary hover:underline">
                      {t.version}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
