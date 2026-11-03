import { Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading search results">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:p-8 sm:pb-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-24" />
          ))}
        </div>
      </section>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-3.5 rounded-xl border bg-card px-[18px] py-4">
              <Skeleton className="size-10 rounded-[10px]" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
