import { Skeleton } from "@/components/ui/skeleton";

export default function ClientSetupLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading client setup">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-[74px] w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4 rounded-[14px] border bg-card px-5 py-5">
          <Skeleton className="size-[30px] shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
