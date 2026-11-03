import { cn } from "@/lib/utils";

const TONES = {
  blue: "bg-info-soft text-info",
  violet: "bg-accent text-accent-foreground",
  teal: "bg-success-soft text-success",
  neutral: "bg-secondary text-muted-foreground",
} as const;

/** Summary card from the Repositories design: icon, title, value on the right, short description. */
export function SummaryCard({
  icon,
  title,
  value,
  description,
  tone = "blue",
  className,
}: {
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-[14px] border bg-card px-5 py-[18px]", className)}>
      <div className="flex items-center gap-2.5">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[10px] [&_svg]:size-[18px]", TONES[tone])}>
          {icon}
        </span>
        <span className="min-w-0 font-semibold">{title}</span>
        <span className="tabular ml-auto text-2xl font-semibold whitespace-nowrap">{value}</span>
      </div>
      {description && <p className="text-[13px] leading-normal text-muted-foreground">{description}</p>}
    </div>
  );
}
