"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ombor/confirm-dialog";
import { deletePackage } from "../actions";

export function DeletePackageButton({
  projectId,
  packageId,
  name,
  version,
  isCurrent,
  compact = false,
}: {
  projectId: number;
  packageId: number;
  name: string;
  version: string;
  /** True when this is the version the page is showing — navigate away after deleting. */
  isCurrent: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = `${name}@${version}`;

  return (
    <>
      {compact ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete version ${version}`}
          className="text-muted-foreground hover:bg-danger-soft hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2 />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="lg"
          className="border-destructive/30 text-destructive hover:bg-danger-soft hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2 />
          Delete version
        </Button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${ref}?`}
        description="This permanently deletes this package version and all of its files from GitLab. Builds that depend on it will fail to resolve it."
        confirmLabel="Delete version"
        typeToConfirm={ref}
        onConfirm={async () => {
          const result = await deletePackage(projectId, packageId);
          if (!result.ok) return { error: result.error };
          toast.success(`Deleted ${ref}`);
          if (isCurrent) router.replace(result.redirectTo);
          else router.refresh();
        }}
      />
    </>
  );
}
