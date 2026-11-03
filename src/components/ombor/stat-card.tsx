import { cn } from "@/lib/utils";
import type { Tone } from "./status-badge";

const HINT_TONES: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  neutral: "text-muted-foreground",
};

export function StatCard({
  label,
  value,
  hint,
  hintTone = "neutral",
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  hintTone?: Tone;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border bg-card p-5", className)}>
      <div className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
        {label}
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <div className="tabular text-[28px] font-semibold leading-none tracking-[-0.02em]">{value}</div>
      {hint && <div className={cn("text-xs", HINT_TONES[hintTone])}>{hint}</div>}
    </div>
  );
}
