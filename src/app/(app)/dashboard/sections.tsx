import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { FormatBadge } from "@/components/ombor/format-badge";
import { StatusBadge } from "@/components/ombor/status-badge";
import { getFormat } from "@/lib/gitlab/formats";
import type { GitLabPackage, GitLabVersion } from "@/lib/gitlab/types";
import { formatBytes, formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  bucketLabel,
  publisherOf,
  RANGES,
  rangeLabel,
  tickLabel,
  type Activity,
  type FormatCount,
  type RangeKey,
} from "@/lib/overview/range";
import type { ProjectStorage } from "@/lib/overview";

export const panel = "flex min-w-0 flex-col rounded-xl border bg-card";

export function RangeToggle({ range }: { range: RangeKey }) {
  return (
    <div role="group" aria-label="Time range" className="flex rounded-[10px] border bg-card p-[3px]">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/dashboard?range=${r}`}
          scroll={false}
          aria-current={r === range ? "true" : undefined}
          className={cn(
            "inline-flex h-[34px] items-center rounded-[7px] px-3.5 text-[13px] transition-colors",
            r === range ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {r}
        </Link>
      ))}
    </div>
  );
}

function Note({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-xs leading-relaxed", tone === "warning" ? "text-warning" : "text-muted-foreground")}>
      {tone === "warning" && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

export function ActivityChart({ activity, range, rangeIncomplete }: { activity: Activity; range: RangeKey; rangeIncomplete: boolean }) {
  const { buckets, bucketMs, max } = activity;
  const n = buckets.length;
  const tickIdx = [...new Set([0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round((3 * (n - 1)) / 4), n - 1])];
  const pct = (v: number) => (max > 0 ? (v / max) * 100 : 0);
  const summary = `${formatNumber(activity.total)} packages published in the ${rangeLabel(range)}: ${formatNumber(activity.ci)} from CI pipelines, ${formatNumber(activity.direct)} direct uploads.`;

  return (
    <>
      <div className="relative">
        <div role="img" aria-label={summary} className="flex h-[200px] items-end gap-[2px] border-b pb-1 sm:gap-1.5">
          {buckets.map((b) => (
            <div
              key={b.start}
              title={`${bucketLabel(b.start, bucketMs)} UTC — ${b.ci} CI pipeline, ${b.direct} direct`}
              className="flex h-full min-w-0 flex-1 flex-col justify-end gap-[2px]"
            >
              {b.direct > 0 && <div className="min-h-[3px] rounded-t-[3px] bg-primary/35" style={{ height: `${pct(b.direct)}%` }} />}
              {b.ci > 0 && (
                <div
                  className={cn("min-h-[3px] rounded-b-[2px] bg-primary", b.direct === 0 && "rounded-t-[3px]")}
                  style={{ height: `${pct(b.ci)}%` }}
                />
              )}
            </div>
          ))}
        </div>
        {activity.total === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No packages published in the {rangeLabel(range)}.
          </p>
        )}
      </div>
      <div aria-hidden className="flex justify-between font-mono text-xs text-muted-foreground">
        {tickIdx.map((i) => (
          <span key={i}>{tickLabel(buckets[i].start, bucketMs)}</span>
        ))}
      </div>

      <table className="sr-only">
        <caption>Packages published per period (UTC)</caption>
        <thead>
          <tr>
            <th scope="col">Period start</th>
            <th scope="col">CI pipeline</th>
            <th scope="col">Direct upload</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.start}>
              <th scope="row">{bucketLabel(b.start, bucketMs)}</th>
              <td>{b.ci}</td>
              <td>{b.direct}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-1">
        <Note>
          Times in UTC. <span className="font-medium text-foreground">CI pipeline</span> = GitLab linked the package to a pipeline (published
          with <code className="font-mono">CI_JOB_TOKEN</code>). <span className="font-medium text-foreground">Direct upload</span> = published
          with a personal, deploy or group token.
        </Note>
        {rangeIncomplete && (
          <Note tone="warning">
            Some groups published more than 500 packages in this period; only the newest 500 per group were scanned, so counts are lower bounds.
          </Note>
        )}
      </div>
    </>
  );
}

export function ChartLegend() {
  return (
    <div className="flex gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-primary" />
        CI pipeline
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-primary/35" />
        Direct upload
      </span>
    </div>
  );
}

export function FormatBreakdown({ formats, sampleSize }: { formats: FormatCount[]; sampleSize: number }) {
  if (formats.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No packages found in your groups and projects.</p>;
  }
  const max = formats[0].count;
  return (
    <ul className="flex flex-col gap-3.5">
      {formats.map((f) => {
        const info = getFormat(f.type);
        const share = sampleSize > 0 ? Math.round((f.count / sampleSize) * 100) : 0;
        return (
          <li key={f.type} className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-2 text-[13px]">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <span className="size-2 shrink-0 rounded-full" style={{ background: info.color }} />
                <span className="truncate">{info.label}</span>
              </span>
              <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">
                {formatNumber(f.count)} · {share}%
              </span>
            </div>
            <div className="h-1.5 rounded-[3px] bg-muted">
              <div className="h-1.5 rounded-[3px]" style={{ width: `${Math.max(2, (f.count / max) * 100)}%`, background: info.color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RecentTable({ packages, now }: { packages: GitLabPackage[]; now: number }) {
  if (packages.length === 0) {
    return <p className="px-[22px] pb-6 text-sm text-muted-foreground">Nothing has been published to the registries you can access yet.</p>;
  }
  const th = "border-y px-3 py-2.5 font-medium";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-muted/50 text-left text-muted-foreground">
            <th scope="col" className={cn(th, "pl-[22px]")}>
              Package
            </th>
            <th scope="col" className={th}>
              Version
            </th>
            <th scope="col" className={th}>
              Project
            </th>
            <th scope="col" className={th}>
              Published by
            </th>
            <th scope="col" className={cn(th, "pr-[22px] text-right")}>
              When
            </th>
          </tr>
        </thead>
        <tbody>
          {packages.map((p) => {
            const by = publisherOf(p);
            const nameCell = (
              <>
                <FormatBadge type={p.package_type} />
                <span className="truncate">{p.name}</span>
              </>
            );
            return (
              <tr key={p.id} className="border-b border-border/60 last:border-b-0">
                <td className="max-w-[320px] py-3 pr-3 pl-[22px]">
                  {p.project_id ? (
                    <Link href={routes.package(p.project_id, p.id)} className="flex items-center gap-2.5 font-medium text-foreground hover:text-primary">
                      {nameCell}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2.5 font-medium">{nameCell}</span>
                  )}
                </td>
                <td className="max-w-[160px] truncate px-3 py-3 font-mono text-xs" title={p.version}>
                  {p.version || "—"}
                </td>
                <td className="max-w-[220px] truncate px-3 py-3 text-muted-foreground" title={p.project_path}>
                  {p.project_path ?? "—"}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                  {by.label}
                  {by.pipelineId !== null && <span className="text-muted-foreground/80"> · pipeline #{by.pipelineId}</span>}
                </td>
                <td className="py-3 pr-[22px] pl-3 text-right whitespace-nowrap text-muted-foreground">
                  <time dateTime={p.created_at} title={formatDateTime(p.created_at)}>
                    {timeAgo(p.created_at, now)}
                  </time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[13px]">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

export function HealthPanel({
  version,
  versionError,
  username,
  isAdmin,
  scopes,
}: {
  version: GitLabVersion | null;
  versionError: string | null;
  username: string;
  isAdmin: boolean;
  scopes: { total: number; failed: string[]; truncated: boolean } | null;
}) {
  return (
    <section aria-labelledby="health-heading" className={cn(panel, "gap-3.5 px-[22px] py-5")}>
      <h2 id="health-heading" className="text-base font-semibold">
        Registry health
      </h2>
      <dl className="flex flex-col gap-2.5">
        <Row label="GitLab API">
          {version ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              <span className="font-medium">Reachable</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full bg-destructive" aria-hidden />
              <span className="font-medium text-destructive">Unreachable</span>
            </span>
          )}
        </Row>
        {version ? (
          <Row label="GitLab version">
            <span className="font-mono text-xs">
              {version.version}
              {version.enterprise !== undefined && <span className="text-muted-foreground"> · {version.enterprise ? "EE" : "CE"}</span>}
            </span>
          </Row>
        ) : (
          versionError && <p className="text-xs break-words text-muted-foreground">{versionError}</p>
        )}
        <Row label="Signed in as">
          <span className="inline-flex items-center gap-2">
            <span className="font-medium">@{username}</span>
            {isAdmin && <StatusBadge tone="info">Admin</StatusBadge>}
          </span>
        </Row>
        {scopes && (
          <Row label="Package scopes">
            <span className="tabular">
              {formatNumber(scopes.total - scopes.failed.length)} of {formatNumber(scopes.total)} loaded
            </span>
          </Row>
        )}
      </dl>
      {scopes && scopes.failed.length > 0 && (
        <Note tone="warning">
          {scopes.failed.length} {scopes.failed.length === 1 ? "group/project" : "groups/projects"} failed to load:{" "}
          <span className="font-mono">{scopes.failed.slice(0, 3).join(", ")}</span>
          {scopes.failed.length > 3 && ` and ${scopes.failed.length - 3} more`}.
        </Note>
      )}
      {scopes?.truncated && <Note>Large groups were sampled (newest packages first), so format shares are based on a sample.</Note>}
    </section>
  );
}

export function LargestProjects({
  rows,
  packagesBytes,
  registryBytes,
  projectsWithStats,
  projectsScanned,
}: {
  rows: ProjectStorage[];
  packagesBytes: number;
  registryBytes: number;
  projectsWithStats: number;
  projectsScanned: number;
}) {
  return (
    <section aria-labelledby="largest-heading" className={cn(panel, "gap-3.5 px-[22px] py-5")}>
      <div className="flex flex-col gap-1">
        <h2 id="largest-heading" className="text-base font-semibold">
          Largest projects
        </h2>
        <span className="text-[13px] text-muted-foreground">
          Packages {formatBytes(packagesBytes)} · Containers {formatBytes(registryBytes)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No package or container storage reported for your projects.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 text-[13px]">
              <Link href={routes.repository(r.id)} className="min-w-0 truncate font-medium text-foreground hover:text-primary" title={r.path}>
                {r.path}
              </Link>
              <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">{formatBytes(r.packagesSize + r.registrySize)}</span>
            </li>
          ))}
        </ul>
      )}
      <Note>
        From GitLab project statistics of {formatNumber(projectsWithStats)} of {formatNumber(projectsScanned)} scanned projects (statistics need
        Reporter access). Container sizes appear only when the registry metadata database is enabled.
      </Note>
    </section>
  );
}
