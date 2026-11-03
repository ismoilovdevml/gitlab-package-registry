"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Trash2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ombor/confirm-dialog";
import { FormatBadge } from "@/components/ombor/format-badge";
import { StatusBadge, packageStatusTone } from "@/components/ombor/status-badge";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { bulkDeletePackages, type BulkDeleteItemResult } from "../actions";
import type { PackageRow } from "./filters";
import { PendingRegion } from "./package-filters";

const rowKey = (r: { projectId: number; id: number }) => `${r.projectId}:${r.id}`;
const STATUS_LABEL: Record<string, string> = { pending_destruction: "pending deletion" };

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function canSelect(r: PackageRow) {
  return r.status !== "pending_destruction";
}

export function PackagesTable({ rows }: { rows: PackageRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<{ deleted: number; failures: BulkDeleteItemResult[] } | null>(null);

  // Only rows visible on this page count — selections never leak across pages or refreshes.
  const selectable = rows.filter(canSelect);
  const selectedRows = selectable.filter((r) => selected.has(rowKey(r)));
  const allOnPage = selectable.length > 0 && selectedRows.length === selectable.length;
  const someOnPage = selectedRows.length > 0 && !allOnPage;

  function toggle(r: PackageRow, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(rowKey(r));
      else next.delete(rowKey(r));
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(selectable.map(rowKey)) : new Set());
  }

  async function confirmDelete(): Promise<{ error?: string } | void> {
    const items = selectedRows.map((r) => ({
      projectId: r.projectId,
      packageId: r.id,
      name: r.name,
      version: r.version,
      projectPath: r.projectPath ?? undefined,
    }));
    const res = await bulkDeletePackages(items);
    if (!res.ok) return { error: res.error };

    const failures = res.results.filter((r) => !r.ok);
    setSummary({ deleted: res.deleted, failures });
    // Keep failed items selected so the user can retry or inspect them.
    setSelected(new Set(failures.map((f) => `${f.projectId}:${f.packageId}`)));

    if (res.failed === 0) toast.success(`Deleted ${plural(res.deleted, "package")}`);
    else if (res.deleted === 0) toast.error(`Couldn't delete ${plural(res.failed, "package")}`);
    else toast.warning(`Deleted ${res.deleted}, ${res.failed} failed`);
  }

  const count = selectedRows.length;
  const preview = selectedRows.slice(0, 5);

  return (
    <>
      {summary && <ResultSummary summary={summary} onDismiss={() => setSummary(null)} />}

      <PendingRegion>
        {/* md+ : table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[960px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-muted/50 text-left text-muted-foreground">
                <th scope="col" className="w-10 border-b py-2.5 pr-1 pl-[18px]">
                  <Checkbox
                    aria-label="Select all packages on this page"
                    checked={allOnPage}
                    indeterminate={someOnPage}
                    disabled={selectable.length === 0}
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                  />
                </th>
                <th scope="col" className="border-b px-3 py-2.5 font-medium">Package</th>
                <th scope="col" className="border-b px-3 py-2.5 font-medium">Version</th>
                <th scope="col" className="border-b px-3 py-2.5 font-medium">Project</th>
                <th scope="col" className="border-b px-3 py-2.5 font-medium">Status</th>
                <th scope="col" className="border-b px-3 py-2.5 font-medium">Source</th>
                <th scope="col" className="border-b px-3 py-2.5 font-medium">Created</th>
                <th scope="col" className="border-b py-2.5 pr-[18px] pl-3 text-right font-medium">Last downloaded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isSel = selected.has(rowKey(r)) && canSelect(r);
                return (
                  <tr key={rowKey(r)} className={cn("border-b border-border/60 last:border-0", isSel && "bg-accent/40")}>
                    <td className="py-3 pr-1 pl-[18px]">
                      <Checkbox
                        aria-label={`Select ${r.name} ${r.version}`}
                        checked={isSel}
                        disabled={!canSelect(r)}
                        onCheckedChange={(v) => toggle(r, Boolean(v))}
                      />
                    </td>
                    <td className="max-w-[320px] px-3 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FormatBadge type={r.type} />
                        <Link
                          href={routes.package(r.projectId, r.id)}
                          className="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                          title={r.name}
                        >
                          {r.name}
                        </Link>
                      </div>
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-3 font-mono text-xs" title={r.version}>
                      {r.version || "—"}
                    </td>
                    <td className="max-w-[220px] px-3 py-3">
                      <ProjectLink row={r} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={packageStatusTone(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <PipelineCell row={r} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                      <time title={r.createdFull}>{r.createdAgo}</time>
                    </td>
                    <td className="py-3 pr-[18px] pl-3 text-right whitespace-nowrap text-muted-foreground">
                      {r.lastDownloaded ? <time title={r.lastDownloadedFull ?? undefined}>{r.lastDownloaded}</time> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* mobile : stacked cards */}
        <div className="md:hidden">
          <label className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2.5 text-[13px] text-muted-foreground">
            <Checkbox
              checked={allOnPage}
              indeterminate={someOnPage}
              disabled={selectable.length === 0}
              onCheckedChange={(v) => toggleAll(Boolean(v))}
            />
            Select all on this page
          </label>
          <ul>
            {rows.map((r) => {
              const isSel = selected.has(rowKey(r)) && canSelect(r);
              return (
                <li key={rowKey(r)} className={cn("flex gap-3 border-b border-border/60 px-4 py-3.5 last:border-0", isSel && "bg-accent/40")}>
                  <Checkbox
                    className="mt-1"
                    aria-label={`Select ${r.name} ${r.version}`}
                    checked={isSel}
                    disabled={!canSelect(r)}
                    onCheckedChange={(v) => toggle(r, Boolean(v))}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <FormatBadge type={r.type} />
                      <Link
                        href={routes.package(r.projectId, r.id)}
                        className="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary"
                      >
                        {r.name}
                      </Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="max-w-full truncate font-mono text-foreground">{r.version || "—"}</span>
                      <StatusBadge tone={packageStatusTone(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
                      <time title={r.createdFull}>{r.createdAgo}</time>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <ProjectLink row={r} />
                      <PipelineCell row={r} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last downloaded: {r.lastDownloaded ? <time title={r.lastDownloadedFull ?? undefined}>{r.lastDownloaded}</time> : "—"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </PendingRegion>

      {count > 0 && (
        <div className="sticky bottom-4 z-20 mx-3 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-foreground px-4 py-2.5 text-background shadow-lg">
          <span className="text-sm font-medium">
            {count} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-background hover:bg-background/15 hover:text-background"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
            <Button
              size="sm"
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 /> Delete
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${plural(count, "package")}?`}
        description={
          <>
            This permanently deletes the selected package versions and their files from GitLab. Builds that depend on
            them will break. You need the Maintainer role in each project.
            <span className="mt-2 block font-mono text-xs text-foreground">
              {preview.map((r) => (
                <span key={rowKey(r)} className="block truncate">
                  {r.name}@{r.version || "—"}
                </span>
              ))}
              {count > preview.length && <span className="block text-muted-foreground">+{count - preview.length} more</span>}
            </span>
          </>
        }
        confirmLabel={`Delete ${plural(count, "package")}`}
        typeToConfirm={count > 5 ? `delete ${count} packages` : undefined}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function ProjectLink({ row }: { row: PackageRow }) {
  return (
    <Link
      href={routes.repository(row.projectId)}
      className="block min-w-0 truncate text-muted-foreground hover:text-primary hover:underline"
      title={row.projectPath ?? undefined}
    >
      {row.projectPath ?? `Project #${row.projectId}`}
    </Link>
  );
}

function PipelineCell({ row }: { row: PackageRow }) {
  if (!row.pipelineId) return <span className="text-muted-foreground">Manual</span>;
  const label = <span className="font-mono text-xs">CI #{row.pipelineId}</span>;
  return row.pipelineUrl ? (
    <a href={row.pipelineUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {label}
    </a>
  ) : (
    label
  );
}

function ResultSummary({
  summary,
  onDismiss,
}: {
  summary: { deleted: number; failures: BulkDeleteItemResult[] };
  onDismiss: () => void;
}) {
  const failed = summary.failures.length;
  return (
    <div
      role="status"
      className={cn(
        "mx-[18px] mt-3.5 rounded-lg border p-3 text-sm",
        failed ? "border-destructive/30 bg-danger-soft" : "border-success/30 bg-success-soft",
      )}
    >
      <div className="flex items-start gap-2">
        {failed ? (
          <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
        )}
        <p className="flex-1 font-medium">
          {plural(summary.deleted, "package")} deleted
          {failed > 0 && `, ${failed} failed`}
          {summary.deleted > 0 && (
            <span className="font-normal text-muted-foreground"> · GitLab removes files in the background.</span>
          )}
        </p>
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      {failed > 0 && (
        <ul className="mt-2 space-y-1 pl-6 text-[13px]">
          {summary.failures.map((f) => (
            <li key={`${f.projectId}:${f.packageId}`} className="break-words">
              <span className="font-mono">
                {f.name}@{f.version || "—"}
              </span>
              <span className="text-muted-foreground"> — {f.error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
