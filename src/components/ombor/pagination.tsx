import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Server-friendly pager. `hrefFor(page)` builds the URL for a page (keep other filters in it).
 * `totalPages` may be unknown (GitLab omits totals on huge collections) — then only prev/next show.
 */
export function Pagination({
  page,
  totalPages,
  hasNext,
  hrefFor,
  className,
}: {
  page: number;
  totalPages?: number | null;
  hasNext: boolean;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (page <= 1 && !hasNext) return null;
  const btn = cn(buttonVariants({ variant: "outline", size: "lg" }), "h-9");
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-between gap-3 pt-4 text-sm", className)}>
      <span className="text-muted-foreground">
        Page {page}
        {totalPages ? ` of ${totalPages}` : ""}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={btn}>
            <ChevronLeft /> Previous
          </Link>
        ) : (
          <span className={cn(btn, "pointer-events-none opacity-50")} aria-disabled>
            <ChevronLeft /> Previous
          </span>
        )}
        {hasNext ? (
          <Link href={hrefFor(page + 1)} className={btn}>
            Next <ChevronRight />
          </Link>
        ) : (
          <span className={cn(btn, "pointer-events-none opacity-50")} aria-disabled>
            Next <ChevronRight />
          </span>
        )}
      </div>
    </nav>
  );
}
