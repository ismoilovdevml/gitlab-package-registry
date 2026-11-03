"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Download, FileArchive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ombor/confirm-dialog";
import { CopyButton } from "@/components/ombor/copy-button";
import type { GitLabPackageFile } from "@/lib/gitlab/types";
import { formatBytes, formatDateTime, shortSha, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deletePackageFile } from "../actions";

function Checksum({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {value ? (
        <div className="flex items-start gap-1">
          <code className="min-w-0 flex-1 rounded-md border bg-muted/60 px-2 py-1.5 font-mono text-xs break-all">{value}</code>
          <CopyButton text={value} label={`Copy ${label}`} />
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Not provided by GitLab</span>
      )}
    </div>
  );
}

export function FilesTable({
  projectId,
  packageId,
  files,
  downloadUrls,
  canDelete,
}: {
  projectId: number;
  packageId: number;
  files: GitLabPackageFile[];
  /** file id → GitLab web download URL (needs a GitLab browser session). */
  downloadUrls: Record<number, string>;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<GitLabPackageFile | null>(null);

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const colCount = canDelete ? 6 : 5;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-muted/50 text-left text-muted-foreground">
              <th className="w-10 border-y px-3 py-2.5 font-medium">
                <span className="sr-only">Details</span>
              </th>
              <th className="border-y px-3 py-2.5 font-medium">File</th>
              <th className="border-y px-3 py-2.5 text-right font-medium">Size</th>
              <th className="border-y px-3 py-2.5 font-medium">SHA-256</th>
              <th className="border-y px-3 py-2.5 font-medium">Created</th>
              {canDelete && (
                <th className="border-y px-3 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {files.map((f) => {
              const open = expanded.has(f.id);
              const url = downloadUrls[f.id];
              return (
                <Fragment key={f.id}>
                  <tr className={cn("border-b last:border-0", open && "border-b-0 bg-muted/30")}>
                    <td className="px-3 py-2.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-expanded={open}
                        aria-label={open ? `Hide checksums for ${f.file_name}` : `Show checksums for ${f.file_name}`}
                        className="text-muted-foreground"
                        onClick={() => toggle(f.id)}
                      >
                        {open ? <ChevronDown /> : <ChevronRight />}
                      </Button>
                    </td>
                    <td className="max-w-[320px] px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileArchive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate font-mono font-medium" title={f.file_name}>
                          {f.file_name}
                        </span>
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Download ${f.file_name} via GitLab`}
                            title="Download via GitLab (uses your GitLab browser session)"
                            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Download className="size-4" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right whitespace-nowrap">{formatBytes(f.size)}</td>
                    <td className="px-3 py-2.5">
                      {f.file_sha256 ? (
                        <div className="flex items-center gap-1">
                          <code className="font-mono text-xs text-muted-foreground" title={f.file_sha256}>
                            {shortSha(f.file_sha256, 16)}…
                          </code>
                          <CopyButton text={f.file_sha256} label={`Copy SHA-256 of ${f.file_name}`} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground" title={formatDateTime(f.created_at)}>
                      {timeAgo(f.created_at)}
                    </td>
                    {canDelete && (
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete file ${f.file_name}`}
                          className="text-muted-foreground hover:bg-danger-soft hover:text-destructive"
                          onClick={() => setPendingDelete(f)}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    )}
                  </tr>
                  {open && (
                    <tr className="border-b bg-muted/30 last:border-0">
                      <td colSpan={colCount} className="px-3 pt-1 pb-4 sm:pl-[52px]">
                        <div className="grid gap-3 md:grid-cols-3">
                          <Checksum label="SHA-256" value={f.file_sha256} />
                          <Checksum label="SHA-1" value={f.file_sha1} />
                          <Checksum label="MD5" value={f.file_md5} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.file_name ?? "file"}?`}
        description="This permanently deletes the file from the GitLab package registry. Clients that download it will fail."
        confirmLabel="Delete file"
        onConfirm={async () => {
          if (!pendingDelete) return;
          const result = await deletePackageFile(projectId, packageId, pendingDelete.id);
          if (!result.ok) return { error: result.error };
          toast.success(`Deleted ${pendingDelete.file_name}`);
          router.refresh();
        }}
      />
    </>
  );
}
