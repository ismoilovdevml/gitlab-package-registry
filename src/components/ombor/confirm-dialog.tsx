"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Controlled confirmation dialog for destructive actions.
 * `onConfirm` may return `{ error }` to keep the dialog open and show the message.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  destructive = true,
  typeToConfirm,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** When set, the user must type this exact text to enable the confirm button. */
  typeToConfirm?: string;
  onConfirm: () => Promise<{ error?: string } | void> | void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (!next) {
      setError(null);
      setTyped("");
    }
    onOpenChange(next);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (result && result.error) {
        setError(result.error);
        return;
      }
      setTyped("");
      onOpenChange(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {typeToConfirm && (
          <div className="space-y-1.5 text-sm">
            <p className="text-muted-foreground">
              Type <span className="font-mono font-medium text-foreground">{typeToConfirm}</span> to confirm.
            </p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}
        {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending || (typeToConfirm !== undefined && typed !== typeToConfirm)}
            onClick={confirm}
          >
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
