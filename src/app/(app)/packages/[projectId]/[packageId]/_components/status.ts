import type { Tone } from "@/components/ombor/status-badge";

const PACKAGE_STATUS_LABELS: Record<string, string> = {
  default: "Published",
  hidden: "Hidden",
  processing: "Processing",
  error: "Error",
  pending_destruction: "Pending deletion",
};

export function packageStatusLabel(status: string): string {
  return PACKAGE_STATUS_LABELS[status] ?? status;
}

export function pipelineStatusTone(status: string | null | undefined): Tone {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "danger";
    case "running":
    case "pending":
    case "created":
    case "preparing":
    case "waiting_for_resource":
    case "scheduled":
      return "info";
    case "manual":
      return "warning";
    default:
      return "neutral";
  }
}

export const TONE_DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};
