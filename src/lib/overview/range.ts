// Time-range handling and pure aggregation for the Overview dashboard. No I/O; safe anywhere.

import type { GitLabPackage } from "@/lib/gitlab/types";

export const RANGES = ["24h", "7d", "30d"] as const;
export type RangeKey = (typeof RANGES)[number];
export const DEFAULT_RANGE: RangeKey = "30d";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface RangeSpec {
  label: string;
  /** Size of one chart bucket. */
  bucketMs: number;
  buckets: number;
}

const SPECS: Record<RangeKey, RangeSpec> = {
  "24h": { label: "last 24 hours", bucketMs: HOUR, buckets: 24 },
  "7d": { label: "last 7 days", bucketMs: 6 * HOUR, buckets: 28 },
  "30d": { label: "last 30 days", bucketMs: DAY, buckets: 30 },
};

export function parseRange(value: string | string[] | undefined): RangeKey {
  const v = Array.isArray(value) ? value[0] : value;
  return (RANGES as readonly string[]).includes(v ?? "") ? (v as RangeKey) : DEFAULT_RANGE;
}

export function rangeLabel(range: RangeKey): string {
  return SPECS[range].label;
}

/**
 * Buckets are aligned to UTC boundaries (hour / 6h / day); the last bucket is the current, partial one.
 * The range therefore starts at the first bucket's start, which is what every "in range" count uses.
 */
export function rangeWindow(range: RangeKey, now: number): { start: number; end: number; bucketMs: number; buckets: number } {
  const { bucketMs, buckets } = SPECS[range];
  const currentBucketStart = Math.floor(now / bucketMs) * bucketMs;
  return { start: currentBucketStart - (buckets - 1) * bucketMs, end: now, bucketMs, buckets };
}

/** A package counts as CI-published when GitLab links it to a pipeline (published with CI_JOB_TOKEN). */
export function isPipelinePublished(pkg: GitLabPackage): boolean {
  return Boolean(pkg.pipeline) || (pkg.pipelines?.length ?? 0) > 0;
}

export function publisherOf(pkg: GitLabPackage): { label: string; pipelineId: number | null } {
  const pipeline = pkg.pipeline ?? pkg.pipelines?.[0] ?? null;
  if (!pipeline) return { label: "—", pipelineId: null };
  return { label: pipeline.user?.username ? `@${pipeline.user.username}` : "CI", pipelineId: pipeline.id ?? null };
}

export interface ActivityBucket {
  start: number;
  ci: number;
  direct: number;
}

export interface Activity {
  buckets: ActivityBucket[];
  bucketMs: number;
  start: number;
  ci: number;
  direct: number;
  total: number;
  max: number;
}

export function buildActivity(packages: GitLabPackage[], range: RangeKey, now: number): Activity {
  const { start, bucketMs, buckets: n } = rangeWindow(range, now);
  const buckets: ActivityBucket[] = Array.from({ length: n }, (_, i) => ({ start: start + i * bucketMs, ci: 0, direct: 0 }));
  for (const pkg of packages) {
    const t = new Date(pkg.created_at).getTime();
    if (Number.isNaN(t) || t < start || t > now) continue;
    const b = buckets[Math.min(Math.floor((t - start) / bucketMs), n - 1)];
    if (isPipelinePublished(pkg)) b.ci++;
    else b.direct++;
  }
  const ci = buckets.reduce((s, b) => s + b.ci, 0);
  const direct = buckets.reduce((s, b) => s + b.direct, 0);
  return { buckets, bucketMs, start, ci, direct, total: ci + direct, max: Math.max(0, ...buckets.map((b) => b.ci + b.direct)) };
}

export interface FormatCount {
  type: string;
  count: number;
}

export function countByFormat(packages: GitLabPackage[]): FormatCount[] {
  const counts = new Map<string, number>();
  for (const p of packages) counts.set(p.package_type, (counts.get(p.package_type) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/** Short axis/tooltip label for a bucket start, in UTC. */
export function bucketLabel(ts: number, bucketMs: number): string {
  const d = new Date(ts);
  if (bucketMs < DAY) {
    const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
    return bucketMs === HOUR ? time : `${day} ${time}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Axis tick label: hourly buckets show the time, multi-hour/day buckets show the date. */
export function tickLabel(ts: number, bucketMs: number): string {
  const d = new Date(ts);
  if (bucketMs === HOUR) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
