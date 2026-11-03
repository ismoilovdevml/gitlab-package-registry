import { Skeleton } from "@/components/ui/skeleton";

export default function CleanupLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading cleanup policies">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[520px] min-w-0 flex-[2_1_520px] rounded-[14px]" />
      </div>
      <Skeleton className="h-56 rounded-[14px]" />
    </div>
  );
}
