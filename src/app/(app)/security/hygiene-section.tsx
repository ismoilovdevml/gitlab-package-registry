import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/ombor/empty-state";
import { FormatBadge } from "@/components/ombor/format-badge";
import { Pagination } from "@/components/ombor/pagination";
import { formatDateTime, formatNumber } from "@/lib/format";
import { routes } from "@/lib/routes";
import {
  CHECK_IDS,
  CHECKS,
  SEVERITIES,
  STALE_DAYS,
  filterFindings,
  type CheckId,
  type Finding,
  type Severity,
} from "@/lib/security/checks";
import { CHECKSUM_SCAN_LIMIT, SAMPLE_PER_SCOPE, loadHygieneReport, type HygieneReport } from "@/lib/security/data";
import { cn } from "@/lib/utils";
import { FindingsFilters } from "./findings-filters";
import { SEVERITY_LABEL, SEVERITY_STYLES, SeverityBadge } from "./severity";

const PAGE_SIZE = 25;

export interface HygieneFilters {
  severity?: Severity;
  check?: CheckId;
  page: number;
}

function plural(n: number, word: string) {
  return `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`;
}

function hrefWith(filters: HygieneFilters, patch: Partial<HygieneFilters>) {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.severity) params.set("severity", next.severity);
  if (next.check) params.set("check", next.check);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `${routes.security}?${qs}` : routes.security;
}

export async function HygieneSection({ filters }: { filters: HygieneFilters }) {
  let report: HygieneReport;
  try {
    report = await loadHygieneReport();
  } catch (e) {
    return <ErrorState error={e} title="Couldn't run registry hygiene checks" />;
  }

  const { summary } = report;
  const cleanPct = summary.sampledPackages > 0 ? Math.round((summary.cleanPackages / summary.sampledPackages) * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SEVERITIES.map((s) => {
          const c = summary.bySeverity[s];
          return (
            <Link
              key={s}
              href={hrefWith(filters, { severity: filters.severity === s ? undefined : s, page: 1 })}
              aria-label={`${SEVERITY_LABEL[s]} severity: ${c.findings} findings. Filter table`}
              className={cn(
                "flex flex-col gap-2 rounded-xl border bg-card px-5 py-[18px] transition-colors hover:border-foreground/20",
                filters.severity === s && "ring-2 ring-primary/40",
              )}
            >
              <span className={cn("flex items-center gap-2 text-[13px] font-medium", SEVERITY_STYLES[s].text)}>
                <span className={cn("size-2.5 rounded-[3px]", SEVERITY_STYLES[s].dot)} />
                {SEVERITY_LABEL[s]}
              </span>
              <span className="tabular text-[30px] leading-none font-semibold">{formatNumber(c.findings)}</span>
              <span className="text-[13px] text-muted-foreground">
                {c.findings === 0 ? "no findings" : `${plural(c.packages, "package")} · ${plural(c.projects, "project")}`}
              </span>
            </Link>
          );
        })}
        <div className="flex flex-col gap-2 rounded-xl border bg-card px-5 py-[18px]">
          <span className="flex items-center gap-2 text-[13px] font-medium text-success">
            <span className="size-2.5 rounded-[3px] bg-success" />
            Clean packages
          </span>
          <span className="tabular text-[30px] leading-none font-semibold">{cleanPct === null ? "—" : `${cleanPct}%`}</span>
          <span className="text-[13px] text-muted-foreground">
            {formatNumber(summary.cleanPackages)} of {plural(summary.sampledPackages, "sampled package")} have no findings
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <FindingsTable report={report} filters={filters} />
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <ChecksPanel report={report} filters={filters} />
          <CoveragePanel report={report} />
        </div>
      </div>
    </div>
  );
}

function FindingsTable({ report, filters }: { report: HygieneReport; filters: HygieneFilters }) {
  const filtered = filterFindings(report.findings, filters);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isFiltered = Boolean(filters.severity || filters.check);

  return (
    <section className="flex min-w-0 flex-[2_1_560px] flex-col rounded-xl border bg-card" aria-labelledby="findings-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="findings-heading" className="text-base font-semibold">
            Registry hygiene findings
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {isFiltered
              ? `${formatNumber(filtered.length)} of ${plural(report.findings.length, "finding")}`
              : plural(report.findings.length, "finding")}
          </p>
        </div>
        <FindingsFilters
          severity={filters.severity}
          check={filters.check}
          severityOptions={SEVERITIES.map((s) => ({
            value: s,
            label: `${SEVERITY_LABEL[s]} (${report.summary.bySeverity[s].findings})`,
          }))}
          checkOptions={CHECK_IDS.map((c) => ({ value: c, label: `${CHECKS[c].label} (${report.summary.byCheck[c]})` }))}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="m-5 border-dashed"
          icon={<ShieldCheck />}
          title={isFiltered ? "No findings match these filters" : "No hygiene issues found"}
          description={
            isFiltered ? (
              <Link href={routes.security} className="text-primary hover:underline">
                Clear filters
              </Link>
            ) : (
              "Every sampled package passed all checks."
            )
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-muted/40 text-left text-muted-foreground">
                <th scope="col" className="border-b px-5 py-2.5 font-medium">Severity</th>
                <th scope="col" className="border-b px-3 py-2.5 font-medium">Check</th>
                <th scope="col" className="border-b px-3 py-2.5 font-medium">Package / project</th>
                <th scope="col" className="border-b px-3 py-2.5 font-medium">Finding</th>
                <th scope="col" className="border-b px-5 py-2.5 font-medium">Recommended action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <FindingRow key={f.id} finding={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        className="border-t px-5 pb-4"
        page={page}
        totalPages={totalPages}
        hasNext={page < totalPages}
        hrefFor={(p) => hrefWith(filters, { page: p })}
      />
    </section>
  );
}

function FindingRow({ finding: f }: { finding: Finding }) {
  return (
    <tr className="align-top">
      <td className="border-b px-5 py-3.5">
        <SeverityBadge severity={f.severity} />
      </td>
      <td className="border-b px-3 py-3.5 whitespace-nowrap text-muted-foreground">{CHECKS[f.check].label}</td>
      <td className="max-w-[240px] border-b px-3 py-3.5">
        {f.target.kind === "package" ? (
          <span className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5">
              <FormatBadge type={f.target.packageType} />
              <Link
                href={routes.package(f.target.projectId, f.target.packageId)}
                className="truncate font-mono text-xs font-medium text-primary hover:underline"
              >
                {f.target.name}
              </Link>
            </span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {f.target.version}
              {f.target.projectPath ? ` · ${f.target.projectPath}` : ""}
            </span>
          </span>
        ) : (
          <span className="flex flex-col gap-1">
            <Link
              href={routes.repository(f.target.projectId)}
              className="truncate font-mono text-xs font-medium text-primary hover:underline"
            >
              {f.target.path}
            </Link>
            <a
              href={f.target.webUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Open in GitLab <ExternalLink className="size-3" />
            </a>
          </span>
        )}
      </td>
      <td className="border-b px-3 py-3.5">
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{f.title}</span>
          <span className="text-xs text-muted-foreground">{f.detail}</span>
        </span>
      </td>
      <td className="max-w-[260px] border-b px-5 py-3.5 text-xs text-muted-foreground">{f.action}</td>
    </tr>
  );
}

const SEVERITY_RULES: Record<Severity, string> = {
  high: "Broken or exposed right now — packages in error state, packages in public projects.",
  medium: `Weakens trust — no CI provenance, files with no checksum at all, uploads stuck over 1 h, internal projects.`,
  low: `Hygiene — MD5/SHA-1 only, not downloaded in ${STALE_DAYS}+ days, pending deletion.`,
};

function ChecksPanel({ report, filters }: { report: HygieneReport; filters: HygieneFilters }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" aria-labelledby="severity-heading">
      <div className="flex flex-col gap-3">
        <h2 id="severity-heading" className="text-base font-semibold">
          How severity is assigned
        </h2>
        <ul className="flex flex-col gap-2.5">
          {SEVERITIES.map((s) => (
            <li key={s} className="flex items-start gap-2.5 text-[13px]">
              <SeverityBadge severity={s} className="w-16 justify-center" />
              <span className="text-muted-foreground">{SEVERITY_RULES[s]}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1 border-t pt-4">
        <h3 className="pb-1 text-sm font-semibold">Checks</h3>
        {CHECK_IDS.map((c) => {
          const active = filters.check === c;
          return (
            <Link
              key={c}
              href={hrefWith(filters, { check: active ? undefined : c, page: 1 })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted",
                active && "bg-accent text-accent-foreground hover:bg-accent",
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-medium">{CHECKS[c].label}</span>
                <span className="text-xs text-muted-foreground">{CHECKS[c].description}</span>
              </span>
              <span className="tabular pt-0.5 text-[13px] font-medium">{formatNumber(report.summary.byCheck[c])}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function CoveragePanel({ report }: { report: HygieneReport }) {
  const { projectLookups, checksumScan } = report;
  const rows: [string, string][] = [
    ["Packages sampled", formatNumber(report.summary.sampledPackages)],
    ["Packages listed by GitLab", formatNumber(report.catalogTotal)],
    [
      "Projects checked for visibility",
      `${formatNumber(projectLookups.attempted - projectLookups.failed)} of ${formatNumber(report.projectIds.length)}`,
    ],
    ["Packages scanned for checksums", `${formatNumber(checksumScan.attempted - checksumScan.failed)} newest`],
    ["Checked at", formatDateTime(new Date(report.generatedAt))],
  ];
  const notes: string[] = [];
  if (report.truncated) {
    notes.push(`Only the newest ${SAMPLE_PER_SCOPE} packages per group or personal project were sampled.`);
  }
  if (projectLookups.skipped > 0) {
    notes.push(`${plural(projectLookups.skipped, "project")} with fewer packages were not checked for visibility.`);
  }
  if (projectLookups.failed > 0) notes.push(`${plural(projectLookups.failed, "project")} could not be read.`);
  if (checksumScan.failed > 0) notes.push(`File lists of ${plural(checksumScan.failed, "package")} could not be read.`);
  if (checksumScan.attempted >= CHECKSUM_SCAN_LIMIT) {
    notes.push(`Checksums are checked on the ${CHECKSUM_SCAN_LIMIT} newest packages only.`);
  }
  if (report.failedScopes.length > 0) {
    notes.push(`Couldn't list packages in: ${report.failedScopes.slice(0, 5).join(", ")}${report.failedScopes.length > 5 ? "…" : ""}.`);
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5" aria-labelledby="coverage-heading">
      <h2 id="coverage-heading" className="text-base font-semibold">
        Scan coverage
      </h2>
      <dl className="flex flex-col gap-2 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {notes.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 border-t pt-3 pl-4 text-xs text-muted-foreground">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
