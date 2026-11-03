import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Check, ExternalLink, FolderGit2, Info, Workflow } from "lucide-react";
import { PageHeader } from "@/components/ombor/page-header";
import { EmptyState, ErrorState } from "@/components/ombor/empty-state";
import { SnippetTabs } from "@/components/ombor/code-block";
import { getAuthenticatedClient, type GitLabContext } from "@/lib/dal";
import { mapLimit } from "@/lib/gitlab/catalog";
import { getFormat } from "@/lib/gitlab/formats";
import type { GitLabProject } from "@/lib/gitlab/types";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { ProjectOption } from "./actions";
import { ProjectPicker } from "./project-picker";
import { getSetupGuide, parseSetupFormat, SETUP_FORMATS, type SetupFormat } from "./snippets";

export const metadata: Metadata = { title: "Client setup" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toOption(p: GitLabProject): ProjectOption {
  return { id: p.id, name: p.name, pathWithNamespace: p.path_with_namespace };
}

/** Most recently active project that has at least one package (checked in batches, max 18 projects). */
async function pickDefaultProject(ctx: GitLabContext, recent: GitLabProject[]): Promise<number | null> {
  const candidates = recent.slice(0, 18);
  for (let i = 0; i < candidates.length; i += 6) {
    const batch = candidates.slice(i, i + 6);
    const hasPackages = await mapLimit(batch, 6, (p) =>
      ctx.packages
        .listProjectPackages(p.id, { per_page: 1 })
        .then((r) => r.data.length > 0)
        .catch(() => false),
    );
    const hit = hasPackages.findIndex(Boolean);
    if (hit >= 0) return batch[hit].id;
  }
  return recent[0]?.id ?? null;
}

function hrefFor(format: SetupFormat, projectId: number | null) {
  const params = new URLSearchParams({ format });
  if (projectId) params.set("project", String(projectId));
  return `${routes.clientSetup}?${params}`;
}

function tokenUrl(gitlabUrl: string, format: SetupFormat, scopes: string) {
  return `${gitlabUrl}/-/user_settings/personal_access_tokens?name=${encodeURIComponent(`ombor-${format}`)}&scopes=${scopes}`;
}

export default async function ClientSetupPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const format = parseSetupFormat(first(sp.format));
  const projectParam = Number(first(sp.project));
  const requestedId = Number.isInteger(projectParam) && projectParam > 0 ? projectParam : null;

  const ctx = await getAuthenticatedClient();
  const { gitlabUrl } = ctx;

  let recent: GitLabProject[] = [];
  let recentError: unknown = null;
  try {
    const res = await ctx.projects.listProjects({
      membership: true,
      simple: true,
      archived: false,
      order_by: "last_activity_at",
      sort: "desc",
      per_page: 20,
    });
    recent = res.data;
  } catch (e) {
    recentError = e;
  }

  const projectId = requestedId ?? (await pickDefaultProject(ctx, recent));

  let project: GitLabProject | null = null;
  let projectError: unknown = null;
  if (projectId) {
    try {
      project = await ctx.projects.getProject(projectId);
    } catch (e) {
      projectError = e;
    }
  }

  const recentMatch = recent.find((p) => p.id === projectId);
  const selected: ProjectOption | null = project ? toOption(project) : recentMatch ? toOption(recentMatch) : null;

  const isContainer = format === "container";
  const guide = project
    ? getSetupGuide(format, {
        gitlabUrl,
        projectId: project.id,
        projectPath: project.path_with_namespace,
        groupId: project.namespace.kind === "group" ? project.namespace.id : undefined,
        imagePrefix: project.container_registry_image_prefix,
      })
    : null;
  const label = getFormat(format).label;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        title="Set up your client"
        description="Pick a package manager and a project. Snippets are filled in with your GitLab instance and that project's registry."
      />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">Project</span>
          <span className="text-[13px] text-muted-foreground">
            {requestedId ? "Snippets target this project's registry." : "Defaulted to your most recently active project with packages."}
          </span>
        </div>
        <ProjectPicker selected={selected} initialOptions={recent.map(toOption)} format={format} />
      </div>

      <nav aria-label="Package manager" className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
        {SETUP_FORMATS.map((f) => {
          const info = getFormat(f.key);
          const active = f.key === format;
          return (
            <Link
              key={f.key}
              href={hrefFor(f.key, project?.id ?? projectId)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border bg-card p-3.5 transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                active && "border-primary bg-accent/40 ring-1 ring-primary",
              )}
            >
              <span
                className={cn(
                  "flex size-[34px] items-center justify-center rounded-[9px] text-[10px] font-bold uppercase",
                  info.badge,
                )}
              >
                {f.short}
              </span>
              <span className="text-sm font-semibold">{info.label}</span>
            </Link>
          );
        })}
      </nav>

      {recentError != null && !project && <ErrorState error={recentError} title="Couldn't load your projects" />}

      {!projectId && recentError == null && (
        <EmptyState
          icon={<FolderGit2 />}
          title="No projects yet"
          description="You aren't a member of any GitLab project, so there's no registry to configure. Ask to be added to a project, or create one in GitLab."
          action={
            <a href={`${gitlabUrl}/projects/new`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
              Create a project in GitLab
            </a>
          }
        />
      )}

      {projectError != null && <ErrorState error={projectError} title="Couldn't load the selected project" />}

      {project && guide && (
        <>
          {!isContainer && project.packages_enabled === false && (
            <Warning>
              The package registry is turned off for <span className="font-medium">{project.path_with_namespace}</span>. A maintainer can
              enable it in GitLab under Settings → General → Visibility, project features, permissions.
            </Warning>
          )}
          {isContainer && (!project.container_registry_image_prefix || project.container_registry_enabled === false) && (
            <Warning>
              The container registry is disabled for this project or not configured on this GitLab instance, so the image path below is a
              placeholder.
            </Warning>
          )}

          <ol className="flex flex-col gap-4">
            <Step n={1} title="Create a token">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {isContainer ? (
                  <>
                    A personal access token with <Code>read_registry</Code> to pull, plus <Code>write_registry</Code> to push.
                  </>
                ) : (
                  <>
                    A personal access token with <Code>read_api</Code> to install, or <Code>api</Code> to publish.
                  </>
                )}{" "}
                In GitLab CI/CD, use <Code>CI_JOB_TOKEN</Code> instead. For shared build machines, prefer a{" "}
                <a
                  href={`${project.web_url}/-/settings/repository#js-deploy-tokens`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  project deploy token
                </a>{" "}
                ({isContainer ? <Code>read_registry</Code> : <Code>read_package_registry</Code>} /{" "}
                {isContainer ? <Code>write_registry</Code> : <Code>write_package_registry</Code>}).
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={tokenUrl(gitlabUrl, format, isContainer ? "read_registry,write_registry" : "api")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {isContainer ? "Generate token" : "Generate publish token"}
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
                <a
                  href={tokenUrl(gitlabUrl, format, isContainer ? "read_registry" : "read_api")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-[9px] border bg-card px-3.5 text-sm font-medium hover:bg-muted"
                >
                  {isContainer ? "Pull-only token" : "Install-only token"}
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
                <span className="inline-flex h-10 max-w-full items-center truncate rounded-[9px] border bg-background px-3.5 font-mono text-[13px] text-muted-foreground">
                  export GITLAB_TOKEN=glpat-…
                </span>
              </div>
            </Step>

            <Step
              n={2}
              title="Configure"
              aside={<code className="truncate font-mono text-xs text-muted-foreground">{guide.configureHint}</code>}
            >
              <SnippetTabs key={`cfg-${format}-${project.id}`} snippets={guide.configure} />
              <p className="text-xs text-muted-foreground">
                Replace <Code>&lt;your_token&gt;</Code> and other <Code>&lt;placeholders&gt;</Code> with your own values.
              </p>
              {guide.notes.map((note) => (
                <p key={note} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
                  {note}
                </p>
              ))}
            </Step>

            <Step n={3} title={isContainer ? "Pull and push" : "Install and publish"}>
              <SnippetTabs key={`use-${format}-${project.id}`} snippets={guide.usage} />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span className="flex items-center gap-2 text-success">
                  <Check className="size-4" aria-hidden="true" />
                  Ombor reads GitLab directly, so new {label} {isContainer ? "images" : "packages"} show up as soon as GitLab has processed them.
                </span>
                <Link href={routes.repository(project.id)} className="text-primary hover:underline">
                  View {project.name} in Ombor
                </Link>
              </div>
            </Step>
          </ol>

          <section aria-labelledby="ci-heading" className="flex flex-col gap-3 rounded-[14px] border bg-card px-5 py-5 sm:px-[22px]">
            <div className="flex items-start gap-3">
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Workflow className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="ci-heading" className="text-base font-semibold">
                  Automate with GitLab CI/CD
                </h2>
                <p className="text-sm text-muted-foreground">
                  Jobs authenticate with the built-in <Code>CI_JOB_TOKEN</Code>, so no personal token is stored in CI variables.
                </p>
              </div>
            </div>
            <SnippetTabs key={`ci-${format}-${project.id}`} snippets={guide.ci} />
          </section>
        </>
      )}
    </div>
  );
}

function Step({ n, title, aside, children }: { n: number; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-[14px] border bg-card px-4 py-5 sm:gap-4 sm:px-[22px]">
      <span
        aria-hidden="true"
        className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-h-[30px] items-center justify-between gap-2.5">
          <h2 className="text-base font-semibold">
            <span className="sr-only">Step {n}: </span>
            {title}
          </h2>
          {aside}
        </div>
        {children}
      </div>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</code>;
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="text-foreground">{children}</p>
    </div>
  );
}
