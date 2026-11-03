import { Skeleton } from "@/components/ui/skeleton";

const panel = "flex min-w-0 flex-col rounded-xl border bg-card";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading overview">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-[42px] w-[150px] rounded-[10px]" />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        <div className={`${panel} flex-[2_1_520px] gap-[18px] px-[22px] py-5`}>
          <Skeleton className="h-5 w-44" />
          <div className="flex h-[200px] items-end gap-[2px] border-b pb-1 sm:gap-1.5">
            {Array.from({ length: 30 }, (_, i) => (
              <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${20 + ((i * 37) % 70)}%` }} />
            ))}
          </div>
          <Skeleton className="h-3 w-full" />
        </div>
        <div className={`${panel} flex-[1_1_300px] gap-4 px-[22px] py-5`}>
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className={`${panel} flex-[2_1_520px] gap-3 px-[22px] py-5`}>
          <Skeleton className="h-5 w-44" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <div className={`${panel} gap-3 px-[22px] py-5`}>
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          <div className={`${panel} gap-3 px-[22px] py-5`}>
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
