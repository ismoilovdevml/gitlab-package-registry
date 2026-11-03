"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ombor/confirm-dialog";
import { FormatBadge } from "@/components/ombor/format-badge";
import { formatDate, formatNumber, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import {
  deletePolicyAction,
  previewPolicyAction,
  runPolicyAction,
  togglePolicyAction,
  type PreviewData,
} from "./actions";
import { PolicyFormDialog } from "./policy-form-dialog";
import type { PolicyView } from "./types";

export function EnabledSwitch({ policy, disabled }: { policy: PolicyView; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(policy.enabled);

  function toggle(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const res = await togglePolicyAction(policy.id, next);
      if (!res.ok) {
        setChecked(!next);
        toast.error(res.error);
      } else {
        toast.success(next ? "Policy enabled" : "Policy paused");
      }
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      Enabled
      <Switch checked={checked} onCheckedChange={toggle} disabled={disabled || pending} aria-label="Policy enabled" />
    </label>
  );
}

type Busy = "preview" | "run" | null;

export function PolicyActions({ policy, canManage }: { policy: PolicyView; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function loadPreview(): Promise<PreviewData | null> {
    const res = await previewPolicyAction(policy.id);
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    setPreview(res.preview);
    return res.preview;
  }

  async function openPreview() {
    setBusy("preview");
    const p = await loadPreview();
    setBusy(null);
    if (p) setPreviewOpen(true);
  }

  async function startRun() {
    setBusy("run");
    const p = await loadPreview();
    setBusy(null);
    if (!p) return;
    if (p.total === 0) {
      toast.info("Nothing to delete — no versions match this policy right now.");
      return;
    }
    setPreviewOpen(false);
    setConfirmRun(true);
  }

  async function run(): Promise<{ error?: string } | void> {
    const res = await runPolicyAction(policy.id);
    if (!res.ok) return { error: res.error };
    const r = res.result;
    if (r.dryRun) {
      toast.success(`Dry run recorded: ${formatNumber(r.matched)} versions would be deleted.`);
    } else if (r.failed > 0 || r.error) {
      toast.warning(`Deleted ${formatNumber(r.deleted)}, failed ${formatNumber(r.failed)}${r.error ? ` — ${r.error}` : ""}`);
    } else {
      toast.success(`Deleted ${formatNumber(r.deleted)} versions.`);
    }
  }

  async function remove(): Promise<{ error?: string } | void> {
    const res = await deletePolicyAction(policy.id);
    if (!res.ok) return { error: res.error };
    toast.success("Policy deleted");
    router.push(routes.cleanup);
  }

  const total = preview?.total ?? 0;
  const noRights = canManage ? undefined : "Requires Maintainer access on this project";

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="h-10" onClick={openPreview} disabled={!canManage || busy !== null} title={noRights}>
          {busy === "preview" ? <Loader2 className="animate-spin" /> : <Eye />}
          Preview
        </Button>
        <Button variant="outline" className="h-10" onClick={startRun} disabled={!canManage || busy !== null} title={noRights}>
          {busy === "run" ? <Loader2 className="animate-spin" /> : <Play />}
          Run now
        </Button>
        <Button variant="outline" className="h-10" onClick={() => setEditOpen(true)} disabled={!canManage} title={noRights}>
          <Pencil />
          Edit
        </Button>
        <Button variant="destructive" className="h-10" onClick={() => setDeleteOpen(true)} disabled={!canManage} title={noRights}>
          <Trash2 />
          Delete
        </Button>
      </div>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        preview={preview}
        policy={policy}
        onRun={
          canManage && total > 0
            ? () => {
                setPreviewOpen(false);
                setConfirmRun(true);
              }
            : undefined
        }
      />

      <ConfirmDialog
        open={confirmRun}
        onOpenChange={setConfirmRun}
        title={policy.dryRun ? "Record a dry run?" : `Delete ${formatNumber(total)} package versions?`}
        description={
          policy.dryRun ? (
            <>
              This policy is in dry-run mode. Nothing will be deleted; Ombor records that{" "}
              <strong>{formatNumber(total)}</strong> versions in <span className="font-mono">{policy.projectPath}</span> would be
              deleted.
            </>
          ) : (
            <>
              <strong>{formatNumber(total)}</strong> versions in <span className="font-mono">{policy.projectPath}</span> will be
              permanently deleted from GitLab using your account. This cannot be undone.
              {total > 1000 && " At most 1,000 are deleted per run; the rest are picked up by the next run."}
            </>
          )
        }
        confirmLabel={policy.dryRun ? "Record dry run" : `Delete ${formatNumber(total)} versions`}
        destructive={!policy.dryRun}
        typeToConfirm={!policy.dryRun && total >= 50 ? policy.name : undefined}
        onConfirm={run}
      />

      <PolicyFormDialog open={editOpen} onOpenChange={setEditOpen} policy={policy} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete policy "${policy.name}"?`}
        description="Only the policy is removed. No packages are deleted."
        confirmLabel="Delete policy"
        onConfirm={remove}
      />
    </>
  );
}

function PreviewDialog({
  open,
  onOpenChange,
  preview,
  policy,
  onRun,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: PreviewData | null;
  policy: PolicyView;
  onRun?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview · {policy.name}</DialogTitle>
          <DialogDescription>
            Versions that would be deleted right now in <span className="font-mono">{policy.projectPath}</span>. Nothing has been
            deleted.
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Would delete" value={preview.total} tone="text-destructive" />
              <Stat label="Kept" value={preview.kept} tone="text-success" />
              <Stat label="Matched" value={preview.matched} />
              <Stat label="Scanned" value={preview.scanned} />
            </div>
            <div className="min-h-0 overflow-auto rounded-lg border">
              {preview.toDelete.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">No versions match this policy right now.</p>
              ) : (
                <Table className="min-w-[520px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.toDelete.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="max-w-[240px] truncate font-medium">
                          <Link href={routes.package(policy.projectId, p.id)} className="hover:underline">
                            {p.name}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{p.version}</TableCell>
                        <TableCell>
                          <FormatBadge type={p.package_type} />
                        </TableCell>
                        <TableCell className="text-muted-foreground" title={formatDate(p.created_at)}>
                          {timeAgo(p.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            {(preview.total > preview.toDelete.length || preview.truncated) && (
              <p className="text-xs text-muted-foreground">
                {preview.total > preview.toDelete.length &&
                  `Showing the first ${formatNumber(preview.toDelete.length)} of ${formatNumber(preview.total)}. `}
                {preview.truncated && "Only the newest 5,000 versions in the project were scanned; older ones are evaluated on later runs."}
              </p>
            )}
          </>
        )}
        <DialogFooter showCloseButton>
          {onRun && (
            <Button variant={policy.dryRun ? "default" : "destructive"} onClick={onRun}>
              <Play />
              {policy.dryRun ? "Record dry run" : "Run now"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular text-lg font-semibold ${tone ?? ""}`}>{formatNumber(value)}</p>
    </div>
  );
}
