import Link from "next/link";
import { Clock, ExternalLink, Info, Trash2 } from "lucide-react";
import { getAuthenticatedClient } from "@/lib/dal";
import { mapLimit } from "@/lib/gitlab/catalog";
import { accessLevelOf } from "@/lib/gitlab/permissions";
import { AccessLevel, type GitLabProject } from "@/lib/gitlab/types";
import { getSetting } from "@/lib/setup";
import { listPolicies, listRunHistory } from "@/lib/cleanup/queries";
import { cleanupIntervalMinutes, SERVICE_TOKEN_SETTING } from "@/lib/cleanup/scheduler";
import { asRunResult, describePolicy, type CleanupRunResult } from "@/lib/cleanup/shared";
import type { CleanupPolicy } from "@/lib/db/schema";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ombor/page-header";
import { EmptyState, ErrorState } from "@/components/ombor/empty-state";
import { FormatBadge } from "@/components/ombor/format-badge";
import { StatusBadge } from "@/components/ombor/status-badge";
import { NewPolicyButton } from "./policy-form-dialog";
import { EnabledSwitch, PolicyActions } from "./policy-controls";
import type { PolicyView } from "./types";

export const metadata = { title: "Cleanup policies" };
export const dynamic = "force-dynamic";

interface ContainerExpirationPolicy {
  cadence?: string;
  enabled?: boolean;
  keep_n?: number | null;
  older_than?: string | null;
  name_regex?: string | null;
  name_regex_keep?: string | null;
  next_run_at?: string | null;
}

type ProjectWithPolicy = GitLabProject & { container_expiration_policy?: ContainerExpirationPolicy | null };

type ProjectLookup = { project: ProjectWithPolicy | null; error: unknown };

function toView(p: CleanupPolicy): PolicyView {
  return {
    id: p.id,
    name: p.name,
    projectId: p.projectId,
    projectPath: p.projectPath,
    packageType: p.packageType,
    namePattern: p.namePattern,
    keepLatest: p.keepLatest,
    olderThanDays: p.olderThanDays,
    enabled: p.enabled,
    dryRun: p.dryRun,
  };
}

function formatInterval(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? "day" : `${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? "hour" : `${minutes / 60} h`;
  return `${minutes} min`;
}

function scheduleText(p: CleanupPolicy, tokenConfigured: boolean, interval: string): string {
  if (!p.enabled) return "Paused";
  if (p.dryRun) return "Manual dry runs only";
  if (!tokenConfigured) return "Scheduler off · no service token";
  return `Runs every ${interval}`;
}

export default async function CleanupPage({ searchParams }: { searchParams: Promise<{ policy?: string }> }) {
  const { policy: policyParam } = await searchParams;
  const ctx = await getAuthenticatedClient();
  const isAdmin = ctx.session.isAdmin;

  let policies: CleanupPolicy[];
  try {
    policies = await listPolicies();
  } catch (e) {
    return (
      <>
        <PageHeader title="Cleanup policies" />
        <ErrorState error={e} title="Couldn't load cleanup policies" />
      </>
    );
  }

  // Resolve each policy's project with the user's token: drives visibility and Maintainer rights.
  const projectIds = [...new Set(policies.map((p) => p.projectId))];
  const lookups = new Map<number, ProjectLookup>();
  await mapLimit(projectIds, 6, async (id) => {
    try {
      lookups.set(id, { project: await ctx.projects.getProject(id), error: null });
    } catch (e) {
      lookups.set(id, { project: null, error: e });
    }
  });
  const visible = isAdmin ? policies : policies.filter((p) => lookups.get(p.projectId)?.project);
  const selectedId = Number(policyParam);
  const selected = visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;

  const [tokenRes, historyRes] = await Promise.allSettled([
    getSetting(SERVICE_TOKEN_SETTING),
    listRunHistory(isAdmin ? null : [...new Set(visible.map((p) => p.projectId))]),
  ]);
  const tokenConfigured = tokenRes.status === "fulfilled" && !!tokenRes.value;
  const interval = formatInterval(cleanupIntervalMinutes());

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="mb-0"
        title="Cleanup policies"
        description="Rules that delete old package versions so storage stays inside the quota. Always previewable before they run."
        actions={<NewPolicyButton />}
      />

      {!tokenConfigured && (
        <div className="flex items-start gap-3 rounded-xl border bg-info-soft p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="text-foreground">
            Scheduled runs are off: no cleanup service token is configured, so live policies only run when someone clicks{" "}
            <strong>Run now</strong>.{" "}
            {isAdmin ? (
              <Link href={routes.settings} className="font-medium text-primary hover:underline">
                Add a service token in Settings
              </Link>
            ) : (
              "Ask a registry admin to add one in Settings."
            )}
          </p>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Trash2 />}
          title="No cleanup policies yet"
          description="Create a policy to delete old package versions in a project — for example, keep the 5 newest versions of every npm package and delete anything older than 30 days."
          action={<NewPolicyButton />}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <nav aria-label="Policies" className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
            {visible.map((p) => {
              const active = selected?.id === p.id;
              return (
                <Link
                  key={p.id}
                  href={`${routes.cleanup}?policy=${p.id}`}
                  aria-current={active ? "true" : undefined}
                  scroll={false}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl bg-card px-[18px] py-4 text-left transition-colors hover:border-primary/60",
                    active ? "border-2 border-primary" : "border",
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2.5">
                    <span className="min-w-0 truncate text-[15px] font-semibold">{p.name}</span>
                    <StatusBadge tone={p.enabled ? "success" : "neutral"}>{p.enabled ? "Active" : "Paused"}</StatusBadge>
                  </span>
                  <span className="text-[13px] break-words text-foreground/80">{describePolicy(p)}</span>
                  <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate font-mono">{p.projectPath}</span>
                    <span>{p.dryRun ? "Dry run" : "Live"}</span>
                    <span>{scheduleText(p, tokenConfigured, interval)}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          {selected && (
            <PolicyDetail
              key={selected.id}
              policy={selected}
              lookup={lookups.get(selected.projectId) ?? { project: null, error: null }}
              tokenConfigured={tokenConfigured}
              interval={interval}
            />
          )}
        </div>
      )}

      <section className="flex flex-col rounded-[14px] border bg-card">
        <h2 className="px-[22px] py-[18px] text-base font-semibold">Run history</h2>
        {historyRes.status === "rejected" ? (
          <div className="px-[22px] pb-5">
            <ErrorState error={historyRes.reason} title="Couldn't load run history" />
          </div>
        ) : historyRes.value.length === 0 ? (
          <p className="border-t px-[22px] py-8 text-center text-sm text-muted-foreground">
            No runs yet. Runs appear here after a policy is run manually or by the scheduler.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-muted/50 text-left text-muted-foreground">
                  <th className="border-y px-[22px] py-2.5 font-medium">Finished</th>
                  <th className="border-y px-3 py-2.5 font-medium">Policy</th>
                  <th className="border-y px-3 py-2.5 font-medium">Project</th>
                  <th className="border-y px-3 py-2.5 font-medium">By</th>
                  <th className="border-y px-3 py-2.5 font-medium">Removed</th>
                  <th className="border-y px-[22px] py-2.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {historyRes.value.map((r) => {
                  const m = asRunResult(r.metadata);
                  return (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="px-[22px] py-3 font-mono text-xs whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                      <td className="px-3 py-3">{r.target ?? "—"}</td>
                      <td className="max-w-[220px] truncate px-3 py-3 font-mono text-xs text-muted-foreground">
                        {r.projectPath ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{r.username ?? "—"}</td>
                      <td className="px-3 py-3 text-foreground/80">
                        {!m ? "—" : m.dryRun ? `${formatNumber(m.matched)} would be` : `${formatNumber(m.deleted)} of ${formatNumber(m.matched)}`}
                      </td>
                      <td className="px-[22px] py-3">
                        <RunResultLabel result={m} status={r.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function RunResultLabel({ result, status }: { result: CleanupRunResult | null; status: string }) {
  if (!result) return <span className={cn("font-medium", status === "failure" ? "text-destructive" : "text-success")}>{status === "failure" ? "Failed" : "Completed"}</span>;
  if (result.error && result.scanned === 0) return <span className="font-medium text-destructive" title={result.error}>Failed · {result.error}</span>;
  if (result.dryRun) return <span className="font-medium text-warning">Dry run</span>;
  if (result.error) return <span className="font-medium text-warning" title={result.error}>Stopped · {result.error}</span>;
  if (result.failed > 0) return <span className="font-medium text-warning">Completed · {formatNumber(result.failed)} failed</span>;
  return <span className="font-medium text-success">Completed</span>;
}

function PolicyDetail({
  policy,
  lookup,
  tokenConfigured,
  interval,
}: {
  policy: CleanupPolicy;
  lookup: ProjectLookup;
  tokenConfigured: boolean;
  interval: string;
}) {
  const view = toView(policy);
  const project = lookup.project;
  const canManage = !!project && accessLevelOf(project) >= AccessLevel.MAINTAINER;
  const last = asRunResult(policy.lastResult);

  return (
    <section className="flex min-w-0 flex-[2_1_520px] flex-col gap-5 rounded-[14px] border bg-card p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-lg font-semibold break-words">{policy.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <Link href={routes.repository(policy.projectId)} className="font-mono text-primary hover:underline">
              {policy.projectPath}
            </Link>
            <StatusBadge tone={policy.dryRun ? "warning" : "info"} dot>
              {policy.dryRun ? "Dry run" : "Live"}
            </StatusBadge>
          </div>
        </div>
        <EnabledSwitch key={`${policy.id}-${policy.enabled}`} policy={view} disabled={!canManage} />
      </div>

      {!project && (
        <ErrorState
          error={lookup.error ?? new Error("Project not found.")}
          title="You can't access this policy's project in GitLab"
        />
      )}
      {project && !canManage && (
        <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          Read-only: managing, previewing and running this policy requires Maintainer access on the project.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">Format</span>
          <span>{policy.packageType ? <FormatBadge type={policy.packageType} /> : <span className="text-muted-foreground">All formats</span>}</span>
        </div>
        <div className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">Schedule</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5" />
            {scheduleText(policy, tokenConfigured, interval)}
          </span>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-xl border p-4">
        <legend className="px-1.5 text-[13px] font-semibold text-success">Always keep</legend>
        <p className="text-sm">
          {policy.keepLatest ? (
            <>
              The latest <strong className="tabular">{formatNumber(policy.keepLatest)}</strong> versions of each package
            </>
          ) : (
            <span className="text-muted-foreground">No minimum — any matching version can be deleted once old enough</span>
          )}
        </p>
        <p className="text-[13px] text-muted-foreground">Versions still processing in GitLab are never deleted.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-xl border p-4">
        <legend className="px-1.5 text-[13px] font-semibold text-destructive">Delete</legend>
        <p className="text-sm">
          {policy.olderThanDays ? (
            <>
              Versions older than <strong className="tabular">{formatNumber(policy.olderThanDays)}</strong> days
            </>
          ) : (
            "Every version beyond the kept ones, regardless of age"
          )}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          Package names matching
          {policy.namePattern ? (
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs break-all text-foreground">/{policy.namePattern}/</code>
          ) : (
            <span>anything</span>
          )}
        </p>
      </fieldset>

      <LastRun policy={policy} last={last} />

      <PolicyActions policy={view} canManage={canManage} />

      {project && <ContainerPolicyPanel project={project} />}
    </section>
  );
}

function LastRun({ policy, last }: { policy: CleanupPolicy; last: CleanupRunResult | null }) {
  if (!last) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-[13px] text-muted-foreground">
        Never run. Use <strong className="text-foreground">Preview</strong> to see exactly which versions this policy would delete.
      </div>
    );
  }
  const when = policy.lastRunAt ? `${timeAgo(policy.lastRunAt)} · ${formatDateTime(policy.lastRunAt)}` : "";
  const by = last.trigger === "scheduler" ? " by the scheduler" : "";

  if (last.error && last.scanned === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-destructive/30 bg-danger-soft p-4">
        <span className="text-[15px] font-semibold text-destructive">Last run failed</span>
        <span className="text-[13px] break-words text-foreground/80">{last.error}</span>
        <span className="text-xs text-muted-foreground">{when}</span>
      </div>
    );
  }

  if (last.dryRun) {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-warning/30 bg-warning-soft p-4">
        <span className="text-[15px] font-semibold">Dry run: {formatNumber(last.matched)} versions</span>
        <span className="text-[13px] text-foreground/80">
          would have been removed (scanned {formatNumber(last.scanned)}). Nothing was deleted.
        </span>
        {last.sample && last.sample.length > 0 && (
          <span className="line-clamp-2 font-mono text-xs break-all text-muted-foreground">
            {last.sample.slice(0, 8).map((s) => `${s.name}@${s.version}`).join(", ")}
            {last.matched > 8 ? ", …" : ""}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {when}
          {by}
        </span>
      </div>
    );
  }

  const problems = last.failed > 0 || !!last.error;
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border p-4",
        problems ? "border-warning/30 bg-warning-soft" : "border-success/30 bg-success-soft",
      )}
    >
      <span className="text-[15px] font-semibold">
        Deleted {formatNumber(last.deleted)} of {formatNumber(last.matched)} versions
      </span>
      <span className="text-[13px] text-foreground/80">
        Scanned {formatNumber(last.scanned)}
        {last.failed > 0 && ` · ${formatNumber(last.failed)} failed`}
        {last.skipped ? ` · ${formatNumber(last.skipped)} left for the next run` : ""}
        {last.error ? ` · ${last.error}` : ""}
      </span>
      {last.errors.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs break-words text-muted-foreground">
          {last.errors.slice(0, 3).map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}
      <span className="text-xs text-muted-foreground">
        {when}
        {by}
      </span>
    </div>
  );
}

function ContainerPolicyPanel({ project }: { project: ProjectWithPolicy }) {
  const p = project.container_expiration_policy;
  const settingsUrl = `${project.web_url}/-/settings/packages_and_registries`;
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">GitLab container cleanup policy</h3>
        <a
          href={settingsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
        >
          Edit in GitLab <ExternalLink className="size-3.5" />
        </a>
      </div>
      {project.container_registry_enabled === false ? (
        <p className="text-[13px] text-muted-foreground">The container registry is disabled for this project.</p>
      ) : !p ? (
        <p className="text-[13px] text-muted-foreground">GitLab did not return a container cleanup policy for this project.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          <Row label="Status">
            <StatusBadge tone={p.enabled ? "success" : "neutral"}>{p.enabled ? "Enabled" : "Disabled"}</StatusBadge>
          </Row>
          <Row label="Runs every">{p.cadence ?? "—"}</Row>
          <Row label="Keep latest">{p.keep_n != null ? `${p.keep_n} tags per image` : "—"}</Row>
          <Row label="Remove older than">{p.older_than ?? "—"}</Row>
          <Row label="Remove tags matching">
            {p.name_regex ? <code className="font-mono text-xs break-all">{p.name_regex}</code> : "—"}
          </Row>
          <Row label="Keep tags matching">
            {p.name_regex_keep ? <code className="font-mono text-xs break-all">{p.name_regex_keep}</code> : "—"}
          </Row>
          {p.enabled && <Row label="Next run">{p.next_run_at ? formatDateTime(p.next_run_at) : "—"}</Row>}
        </dl>
      )}
      <p className="text-xs text-muted-foreground">Container tags are cleaned up by GitLab itself; Ombor only shows this policy.</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
