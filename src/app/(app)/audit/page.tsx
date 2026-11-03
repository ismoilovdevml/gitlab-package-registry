import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, ScrollText, Search } from "lucide-react";
import { verifySession } from "@/lib/session";
import { PageHeader } from "@/components/ombor/page-header";
import { StatCard } from "@/components/ombor/stat-card";
import { StatusBadge } from "@/components/ombor/status-badge";
import { EmptyState, ErrorState } from "@/components/ombor/empty-state";
import { AUDIT_CATEGORIES, actionsInCategory, auditActionInfo } from "@/lib/admin/audit-actions";
import {
  AUDIT_EXPORT_MAX_ROWS,
  AUDIT_PAGE_SIZE,
  auditQueryString,
  getAuditSummary,
  listAuditEntries,
  parseAuditFilters,
  type AuditFilters,
  type AuditRow,
} from "@/lib/admin/audit-query";
import { fieldInput, initials, linkButton, nativeSelect, nowMs, utcTimestamp } from "@/lib/admin/ui";
import { formatNumber, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await verifySession();
  const filters = parseAuditFilters(await searchParams);
  const scope = { ownUserId: session.isAdmin ? null : session.userId };

  const [summary, list] = await Promise.allSettled([getAuditSummary(scope), listAuditEntries(filters, scope)]);
  const qs = auditQueryString(filters, { page: 1 });
  const hasFilters = qs !== "";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="mb-1"
        title="Audit log"
        description={
          session.isAdmin
            ? "Every publish, delete, policy change, settings change and sign-in recorded by Ombor."
            : "Your own activity in Ombor. Administrators can see events from all users."
        }
        actions={
          <a href={`/api/audit/export${qs}`} className={linkButton.primary} download>
            <Download /> Export CSV
          </a>
        }
      />

      {summary.status === "fulfilled" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Events" value={formatNumber(summary.value.last24h)} hint="Last 24 hours" />
          <StatCard
            label="Deletes"
            value={formatNumber(summary.value.deletes7d)}
            hint="Packages, files and images · 7 days"
            hintTone={summary.value.deletes7d > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Failed actions"
            value={formatNumber(summary.value.failed7d)}
            hint="Last 7 days"
            hintTone={summary.value.failed7d > 0 ? "danger" : "neutral"}
          />
          {session.isAdmin ? (
            <StatCard label="Distinct actors" value={formatNumber(summary.value.actors30d)} hint="Last 30 days" />
          ) : (
            <StatCard label="Your events" value={formatNumber(summary.value.total30d)} hint="Last 30 days" />
          )}
        </div>
      ) : (
        <ErrorState error={summary.reason} title="Couldn't load audit summary" />
      )}

      <FilterBar filters={filters} isAdmin={session.isAdmin} hasFilters={hasFilters} />

      {list.status === "rejected" ? (
        <ErrorState error={list.reason} title="Couldn't load audit events" />
      ) : list.value.total === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title={hasFilters ? "No events match these filters" : "No audit events yet"}
          description={
            hasFilters
              ? "Try widening the date range or clearing some filters."
              : "Sign-ins, publishes, deletes and settings changes will show up here."
          }
          action={
            hasFilters ? (
              <Link href={routes.audit} className={linkButton.outline}>
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <AuditTable rows={list.value.rows} total={list.value.total} filters={filters} />
      )}
    </div>
  );
}

function FilterBar({ filters, isAdmin, hasFilters }: { filters: AuditFilters; isAdmin: boolean; hasFilters: boolean }) {
  return (
    <form
      method="get"
      action={routes.audit}
      className="flex flex-wrap items-end gap-2.5 rounded-xl border bg-card p-3.5"
      aria-label="Filter audit events"
    >
      <label className="flex min-w-0 flex-[1_1_240px] flex-col gap-1 text-xs font-medium text-muted-foreground">
        Target or IP
        <span className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
          <input name="q" defaultValue={filters.q} placeholder="Search target or IP" className={cn(fieldInput, "pl-8 text-foreground")} />
        </span>
      </label>
      {isAdmin && (
        <label className="flex min-w-0 flex-[1_1_150px] flex-col gap-1 text-xs font-medium text-muted-foreground">
          Actor
          <input name="actor" defaultValue={filters.actor} placeholder="username" className={cn(fieldInput, "text-foreground")} />
        </label>
      )}
      <label className="flex min-w-0 flex-[1_1_180px] flex-col gap-1 text-xs font-medium text-muted-foreground">
        Action
        <select name="action" defaultValue={filters.action ?? ""} className={cn(nativeSelect, "text-foreground")}>
          <option value="">All actions</option>
          {AUDIT_CATEGORIES.map((c) => (
            <optgroup key={c.id} label={c.label}>
              <option value={`${c.id}.*`}>All {c.label.toLowerCase()} events</option>
              {actionsInCategory(c.id).map((a) => (
                <option key={a} value={a}>
                  {auditActionInfo(a).label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-[1_1_160px] flex-col gap-1 text-xs font-medium text-muted-foreground">
        Project
        <input name="project" defaultValue={filters.project} placeholder="group/project" className={cn(fieldInput, "text-foreground")} />
      </label>
      <label className="flex min-w-0 flex-[0_1_130px] flex-col gap-1 text-xs font-medium text-muted-foreground">
        Status
        <select name="status" defaultValue={filters.status ?? ""} className={cn(nativeSelect, "text-foreground")}>
          <option value="">Any status</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-[1_1_140px] flex-col gap-1 text-xs font-medium text-muted-foreground">
        From (UTC)
        <input type="date" name="from" defaultValue={filters.from} className={cn(fieldInput, "text-foreground")} />
      </label>
      <label className="flex min-w-0 flex-[1_1_140px] flex-col gap-1 text-xs font-medium text-muted-foreground">
        To (UTC)
        <input type="date" name="to" defaultValue={filters.to} className={cn(fieldInput, "text-foreground")} />
      </label>
      <div className="flex gap-2">
        <button type="submit" className={linkButton.primary}>
          Apply
        </button>
        {hasFilters && (
          <Link href={routes.audit} className={linkButton.ghost}>
            Reset
          </Link>
        )}
      </div>
    </form>
  );
}

function AuditTable({ rows, total, filters }: { rows: AuditRow[]; total: number; filters: AuditFilters }) {
  const now = nowMs();
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const first = (page - 1) * AUDIT_PAGE_SIZE + 1;
  const last = first + rows.length - 1;
  const th = "px-3 py-3 font-medium whitespace-nowrap border-b";
  const td = "px-3 py-3 border-b border-border/60 align-top";

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-muted/50 text-left text-muted-foreground">
              <th className={cn(th, "pl-5")}>Time (UTC)</th>
              <th className={th}>Actor</th>
              <th className={th}>Action</th>
              <th className={th}>Target</th>
              <th className={th}>Project</th>
              <th className={th}>Status</th>
              <th className={cn(th, "pr-5")}>IP address</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const info = auditActionInfo(r.action);
              const actor = r.username ?? "system";
              return (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className={cn(td, "pl-5 whitespace-nowrap")}>
                    <div className="font-mono text-xs">{utcTimestamp(r.createdAt)}</div>
                    <div className="text-xs text-muted-foreground">{timeAgo(r.createdAt, now)}</div>
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground"
                      >
                        {initials(r.actorName ?? r.username)}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{r.actorName ?? actor}</span>
                        {r.actorName && <span className="truncate text-xs text-muted-foreground">@{actor}</span>}
                      </span>
                    </div>
                  </td>
                  <td className={td}>
                    <div className="font-medium">{info.label}</div>
                    <StatusBadge tone={info.tone} className="mt-1 rounded-md font-mono text-[11px]">
                      {r.action}
                    </StatusBadge>
                  </td>
                  <td className={cn(td, "max-w-[320px]")}>
                    {r.target ? (
                      <span className="font-mono text-xs break-all">{r.target}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {r.targetType && <div className="text-xs text-muted-foreground">{r.targetType.replace(/_/g, " ")}</div>}
                    {r.metadata !== null && r.metadata !== undefined && (
                      <details className="mt-1 group">
                        <summary className="cursor-pointer text-xs text-primary select-none">Details</summary>
                        <pre className="mt-1.5 max-h-64 max-w-[300px] overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed whitespace-pre">
                          {JSON.stringify(r.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td className={cn(td, "max-w-[220px]")}>
                    {r.projectPath ? (
                      r.projectId ? (
                        <Link href={routes.repository(r.projectId)} className="break-all hover:underline">
                          {r.projectPath}
                        </Link>
                      ) : (
                        <span className="break-all">{r.projectPath}</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={td}>
                    <StatusBadge tone={r.status === "failure" ? "danger" : "success"} dot>
                      {r.status === "failure" ? "Failure" : "Success"}
                    </StatusBadge>
                  </td>
                  <td className={cn(td, "pr-5 font-mono text-xs whitespace-nowrap text-muted-foreground")}>{r.ip ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
        <span className="text-muted-foreground">
          {rows.length > 0 ? (
            <>
              Showing <span className="tabular text-foreground">{formatNumber(first)}</span>–
              <span className="tabular text-foreground">{formatNumber(last)}</span> of{" "}
              <span className="tabular text-foreground">{formatNumber(total)}</span> events
            </>
          ) : (
            <>No events on this page</>
          )}
          {total > AUDIT_EXPORT_MAX_ROWS && (
            <span className="block text-xs">CSV export is limited to the newest {formatNumber(AUDIT_EXPORT_MAX_ROWS)} matching rows.</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            Page {formatNumber(page)} of {formatNumber(totalPages)}
          </span>
          <PageLink filters={filters} page={page - 1} disabled={page <= 1} label="Previous">
            <ChevronLeft /> Previous
          </PageLink>
          <PageLink filters={filters} page={page + 1} disabled={page >= totalPages} label="Next">
            Next <ChevronRight />
          </PageLink>
        </div>
      </nav>
    </section>
  );
}

function PageLink({
  filters,
  page,
  disabled,
  label,
  children,
}: {
  filters: AuditFilters;
  page: number;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className={cn(linkButton.outline, linkButton.disabled)} aria-disabled aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={`${routes.audit}${auditQueryString(filters, { page })}`} className={linkButton.outline} aria-label={label}>
      {children}
    </Link>
  );
}
