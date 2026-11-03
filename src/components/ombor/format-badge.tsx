import { getFormat } from "@/lib/gitlab/formats";
import { cn } from "@/lib/utils";

export function FormatBadge({ type, className }: { type: string; className?: string }) {
  const f = getFormat(type);
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-md px-2 text-xs font-semibold whitespace-nowrap",
        f.badge,
        className,
      )}
    >
      {f.label}
    </span>
  );
}
