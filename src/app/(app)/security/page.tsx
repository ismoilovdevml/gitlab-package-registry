import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ombor/page-header";
import { parseCheck, parseSeverity } from "@/lib/security/checks";
import { HygieneSection } from "./hygiene-section";
import { VulnerabilitySection } from "./vulnerability-section";
import { HygieneSkeleton, VulnerabilitySkeleton } from "./skeletons";

export const metadata: Metadata = { title: "Security" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SecurityPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(first(sp.page) ?? "1", 10) || 1);
  const filters = { severity: parseSeverity(first(sp.severity)), check: parseCheck(first(sp.check)), page };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        className="mb-0"
        title="Security"
        description="Registry hygiene checks that work on every GitLab edition, plus GitLab vulnerability data where your instance provides it."
      />
      <Suspense fallback={<HygieneSkeleton />}>
        <HygieneSection filters={filters} />
      </Suspense>
      <Suspense fallback={<VulnerabilitySkeleton />}>
        <VulnerabilitySection />
      </Suspense>
    </div>
  );
}
