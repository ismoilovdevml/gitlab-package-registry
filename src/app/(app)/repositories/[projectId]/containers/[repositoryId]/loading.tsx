import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading container repository">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-8 w-72" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[98px] rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="mb-6 h-28 rounded-[14px]" />
      <div className="rounded-[14px] border bg-card">
        <div className="border-b px-[18px] py-3.5">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="flex flex-col divide-y">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-[18px] py-3.5">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-28 sm:block" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="hidden h-4 w-20 md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
