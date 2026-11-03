import { Skeleton } from "@/components/ui/skeleton";
import { HygieneSkeleton, VulnerabilitySkeleton } from "./skeletons";

export default function SecurityLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <HygieneSkeleton />
      <VulnerabilitySkeleton />
    </div>
  );
}
