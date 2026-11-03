import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading settings">
      <Skeleton className="h-8 w-36" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex gap-1 lg:w-52 lg:flex-col">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-36 lg:w-full" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {[260, 220, 180, 160].map((h, i) => (
            <div key={i} className="flex flex-col gap-4 rounded-xl border bg-card p-5" style={{ minHeight: h }}>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full max-w-lg" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
