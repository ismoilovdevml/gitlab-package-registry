import { Skeleton } from "@/components/ui/skeleton";

export default function PublishLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading publish page">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="flex gap-4 border-b pb-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-6 rounded-xl border bg-card p-5 sm:p-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ))}
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
