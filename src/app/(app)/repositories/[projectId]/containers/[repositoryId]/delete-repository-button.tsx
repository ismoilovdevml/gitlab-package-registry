"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ombor/confirm-dialog";
import { routes } from "@/lib/routes";
import { deleteContainerRepository } from "./actions";

export function DeleteRepositoryButton({
  projectId,
  repositoryId,
  path,
  tagsCount,
}: {
  projectId: number;
  repositoryId: number;
  path: string;
  tagsCount: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function confirm() {
    const res = await deleteContainerRepository(projectId, repositoryId);
    if (!res.ok) return { error: res.error };
    toast.success(`Deletion of ${path} scheduled`, {
      description:
        "GitLab removes the tags in the background. Disk space is reclaimed after the registry garbage collection runs.",
    });
    router.push(routes.repository(projectId));
    router.refresh();
  }

  return (
    <>
      <Button variant="destructive" size="lg" onClick={() => setOpen(true)}>
        <Trash2 /> Delete repository
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete container repository?"
        description={
          <>
            This deletes <span className="font-mono">{path}</span>
            {tagsCount ? ` and all ${tagsCount} of its tags` : " and all of its tags"}. GitLab schedules the deletion and
            runs it in the background; disk space is reclaimed only after garbage collection. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete repository"
        typeToConfirm={path}
        onConfirm={confirm}
      />
    </>
  );
}
