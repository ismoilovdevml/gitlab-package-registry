import { Skeleton } from "@/components/ui/skeleton";

export function HygieneSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Running hygiene checks">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-[18px]">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <Skeleton className="h-5 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-36" />
              <Skeleton className="h-9 w-36" />
            </div>
          </div>
          <div className="flex flex-col gap-4 p-5">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-[22px] w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden h-4 w-40 sm:block" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function VulnerabilitySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Checking GitLab vulnerability data">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-28 rounded-xl" />
    </div>
  );
}
