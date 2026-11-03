import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { GitLabApiError } from "@/lib/gitlab/errors";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-14 text-center", className)}>
      {icon && <div className="text-muted-foreground/60 [&_svg]:size-10">{icon}</div>}
      <div className="space-y-1">
        <p className="text-base font-semibold">{title}</p>
        {description && <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Inline error panel for a failed GitLab call. Server- and client-safe. */
export function ErrorState({ error, title = "Couldn't load data from GitLab", className }: { error: unknown; title?: string; className?: string }) {
  let message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  if (error instanceof GitLabApiError && error.status === 403) {
    message = `You don't have permission to view this in GitLab. ${message}`;
  }
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-xl border border-destructive/30 bg-danger-soft p-4 text-sm", className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0">
        <p className="font-medium text-destructive">{title}</p>
        <p className="mt-0.5 break-words text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
