import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading repositories">
      <div className="mb-6 flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[98px] rounded-[14px]" />
        ))}
      </div>
      <div className="rounded-[14px] border bg-card">
        <div className="flex flex-wrap justify-between gap-3 border-b px-[18px] py-3.5">
          <Skeleton className="h-[38px] w-64" />
          <Skeleton className="h-[38px] w-full sm:w-[300px]" />
        </div>
        <div className="flex flex-col divide-y">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-[18px] py-4">
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="hidden h-5 w-40 sm:block" />
              <Skeleton className="hidden h-4 w-20 md:block" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
