import { Skeleton } from "@/components/ui/skeleton";

export default function PackagesLoading() {
  return (
    <div aria-busy="true" aria-label="Loading packages">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-full" />
        ))}
      </div>

      <div className="mt-5 flex flex-col items-start gap-4 lg:flex-row">
        <div className="flex w-full flex-col gap-4 rounded-xl border bg-card p-[18px] lg:w-[240px] lg:shrink-0">
          <Skeleton className="h-3 w-16" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
          <Skeleton className="mt-2 h-3 w-16" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>

        <div className="w-full min-w-0 flex-1 rounded-xl border bg-card">
          <div className="flex flex-wrap items-center gap-2.5 border-b px-[18px] py-3.5">
            <Skeleton className="h-[38px] min-w-0 flex-[1_1_240px]" />
            <Skeleton className="h-[38px] w-44" />
          </div>
          <div className="flex flex-col">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-border/60 px-[18px] py-3.5 last:border-0">
                <Skeleton className="size-4 shrink-0" />
                <Skeleton className="h-[22px] w-14 shrink-0" />
                <Skeleton className="h-4 w-48 max-w-[40%]" />
                <Skeleton className="ml-auto hidden h-4 w-20 md:block" />
                <Skeleton className="hidden h-4 w-36 md:block" />
                <Skeleton className="hidden h-5 w-16 rounded-full md:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
