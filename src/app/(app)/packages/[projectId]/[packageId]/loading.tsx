import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading package">
      <Skeleton className="h-4 w-64 max-w-full" />
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-4">
          <Skeleton className="hidden size-14 rounded-[14px] sm:block" />
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-8 w-72 max-w-[80vw]" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <div className="flex gap-4 border-b pb-3">
        {[80, 96, 72, 96].map((w, i) => (
          <Skeleton key={i} className="h-5" style={{ width: w }} />
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <div className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
