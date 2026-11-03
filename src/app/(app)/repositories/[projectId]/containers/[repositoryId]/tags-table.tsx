"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ombor/confirm-dialog";
import { CopyButton } from "@/components/ombor/copy-button";
import { EmptyState } from "@/components/ombor/empty-state";
import { formatBytes, formatDateTime, shortSha, timeAgo } from "@/lib/format";
import { deleteContainerTags } from "./actions";

export interface TagRow {
  name: string;
  digest: string | null;
  revision: string | null;
  totalSize: number | null;
  createdAt: string | null;
}

const GC_NOTE =
  "Tags are removed from the registry immediately, but disk space is reclaimed only after GitLab's container registry garbage collection runs.";

export function TagsTable({
  projectId,
  repositoryId,
  location,
  tags,
  canDelete,
}: {
  projectId: number;
  repositoryId: number;
  location: string;
  tags: TagRow[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [gcPending, setGcPending] = useState(0);

  // Drop selections for tags that disappeared after a refresh.
  const visible = new Set(tags.map((t) => t.name));
  const selectedOnPage = [...selected].filter((n) => visible.has(n));
  const allSelected = tags.length > 0 && selectedOnPage.length === tags.length;

  function toggle(name: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  async function confirmDelete() {
    const names = pendingDelete ?? [];
    const res = await deleteContainerTags(projectId, repositoryId, names);
    if (res.deleted) {
      setGcPending((n) => n + (res.deleted ?? 0));
      setSelected((prev) => new Set([...prev].filter((n) => !names.includes(n))));
      router.refresh();
    }
    if (!res.ok) {
      // Partial success still refreshes; keep the dialog open with the error.
      return { error: res.error };
    }
    toast.success(`Deleted ${res.deleted} tag${res.deleted === 1 ? "" : "s"}`, { description: GC_NOTE });
  }

  if (tags.length === 0) {
    return (
      <EmptyState
        className="m-4"
        icon={<Tag />}
        title="No tags"
        description="This repository has no tags. Push an image tag to see it here."
      />
    );
  }

  return (
    <>
      {gcPending > 0 && (
        <div role="status" className="mx-[18px] mt-4 flex items-start gap-3 rounded-xl border bg-warning-soft p-3.5 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-warning">
              {gcPending} tag{gcPending === 1 ? "" : "s"} deleted · storage pending GC
            </p>
            <p className="mt-0.5 text-muted-foreground">{GC_NOTE}</p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setGcPending(0)}>
            <X />
          </Button>
        </div>
      )}

      {canDelete && selectedOnPage.length > 0 && (
        <div className="mx-[18px] mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm text-accent-foreground">
          <span>
            {selectedOnPage.length} tag{selectedOnPage.length === 1 ? "" : "s"} selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setPendingDelete(selectedOnPage)}>
              <Trash2 /> Delete selected
            </Button>
          </div>
        </div>
      )}

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-muted/40 text-left text-muted-foreground">
              {canDelete && (
                <th className="w-10 border-b py-2.5 pl-[18px]">
                  <Checkbox
                    aria-label="Select all tags on this page"
                    checked={allSelected}
                    indeterminate={!allSelected && selectedOnPage.length > 0}
                    onCheckedChange={(on) => setSelected(on ? new Set(tags.map((t) => t.name)) : new Set())}
                  />
                </th>
              )}
              <th className={`border-b py-2.5 font-medium ${canDelete ? "px-3" : "px-[18px]"}`}>Tag</th>
              <th className="border-b px-3 py-2.5 font-medium">Digest</th>
              <th className="border-b px-3 py-2.5 text-right font-medium">Size</th>
              <th className="border-b px-3 py-2.5 font-medium">Created</th>
              <th className="border-b px-[18px] py-2.5 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => {
              const isSelected = selected.has(t.name);
              return (
                <tr
                  key={t.name}
                  data-state={isSelected ? "selected" : undefined}
                  className="border-b last:border-b-0 hover:bg-muted/30 data-[state=selected]:bg-accent/50"
                >
                  {canDelete && (
                    <td className="py-3 pl-[18px]">
                      <Checkbox
                        aria-label={`Select tag ${t.name}`}
                        checked={isSelected}
                        onCheckedChange={(on) => toggle(t.name, on)}
                      />
                    </td>
                  )}
                  <td className={`max-w-[280px] py-3 ${canDelete ? "px-3" : "px-[18px]"}`}>
                    <span className="block truncate font-mono text-[13px] font-medium" title={t.name}>
                      {t.name}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {t.digest || t.revision ? (
                      <code className="font-mono text-xs text-muted-foreground" title={t.digest ?? t.revision ?? ""}>
                        {shortSha(t.digest ?? t.revision)}
                      </code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="tabular px-3 py-3 text-right whitespace-nowrap">{formatBytes(t.totalSize)}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground" title={formatDateTime(t.createdAt)}>
                    {timeAgo(t.createdAt)}
                  </td>
                  <td className="px-[18px] py-3">
                    <div className="flex items-center justify-end gap-1">
                      <CopyButton text={`docker pull ${location}:${t.name}`} label={`Copy pull command for ${t.name}`} />
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete tag ${t.name}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setPendingDelete([t.name])}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={
          pendingDelete && pendingDelete.length === 1
            ? `Delete tag ${pendingDelete[0]}?`
            : `Delete ${pendingDelete?.length ?? 0} tags?`
        }
        description={
          <>
            Pulls of {pendingDelete && pendingDelete.length === 1 ? "this tag" : "these tags"} will stop working. This can&apos;t
            be undone. {GC_NOTE}
          </>
        }
        confirmLabel={pendingDelete && pendingDelete.length > 1 ? `Delete ${pendingDelete.length} tags` : "Delete tag"}
        onConfirm={confirmDelete}
      />
    </>
  );
}
