import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small line above the title, e.g. breadcrumbs. */
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow && <div className="text-sm text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
