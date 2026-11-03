import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-destructive",
  info: "bg-info-soft text-info",
  neutral: "bg-secondary text-muted-foreground",
};

export function StatusBadge({
  tone = "neutral",
  dot = false,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Maps a GitLab package status to a badge tone. */
export function packageStatusTone(status: string): Tone {
  switch (status) {
    case "default":
      return "success";
    case "processing":
      return "info";
    case "hidden":
      return "neutral";
    case "error":
      return "danger";
    case "pending_destruction":
      return "warning";
    default:
      return "neutral";
  }
}
