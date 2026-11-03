// Cleanup policy helpers shared by server and client code (no server-only imports).

import { getFormat } from "@/lib/gitlab/formats";

export const MAX_PATTERN_LENGTH = 200;

/** Shape of `cleanup_policies.last_result` (jsonb). */
export interface CleanupRunResult {
  scanned: number;
  matched: number;
  deleted: number;
  failed: number;
  /** Not attempted because the run was aborted (rate limit, expired token) or the per-run cap was hit. */
  skipped?: number;
  errors: string[];
  dryRun: boolean;
  finishedAt: string;
  /** Listing hit the scan cap; older versions were not evaluated this run. */
  truncated?: boolean;
  /** Dry runs: first few versions that would be deleted. */
  sample?: { name: string; version: string }[];
  trigger?: "manual" | "scheduler";
  /** Set when the run failed before deleting anything (e.g. listing failed). */
  error?: string;
}

export interface PolicyRuleInput {
  packageType: string | null;
  namePattern: string | null;
  keepLatest: number | null;
  olderThanDays: number | null;
}

/** Returns an error message for an invalid pattern, or null when it is valid (or empty). */
export function patternError(pattern: string | null | undefined): string | null {
  if (!pattern) return null;
  if (pattern.length > MAX_PATTERN_LENGTH) return `Pattern must be at most ${MAX_PATTERN_LENGTH} characters.`;
  try {
    new RegExp(pattern);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid regular expression.";
  }
}

/** Human summary, e.g. "Keep latest 5 · delete older than 30d · npm · /^@acme\//". */
export function describePolicy(p: PolicyRuleInput): string {
  const parts: string[] = [];
  if (p.keepLatest) parts.push(`Keep latest ${p.keepLatest}`);
  if (p.olderThanDays) parts.push(`${parts.length ? "delete" : "Delete"} older than ${p.olderThanDays}d`);
  else if (p.keepLatest) parts.push("delete the rest");
  parts.push(p.packageType ? getFormat(p.packageType).label : "all formats");
  parts.push(p.namePattern ? `/${p.namePattern.replace(/\//g, "\\/")}/` : "all names");
  return parts.join(" · ");
}

export function asRunResult(value: unknown): CleanupRunResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<CleanupRunResult>;
  if (typeof v.finishedAt !== "string") return null;
  return {
    scanned: v.scanned ?? 0,
    matched: v.matched ?? 0,
    deleted: v.deleted ?? 0,
    failed: v.failed ?? 0,
    skipped: v.skipped ?? 0,
    errors: Array.isArray(v.errors) ? v.errors : [],
    dryRun: !!v.dryRun,
    finishedAt: v.finishedAt,
    truncated: !!v.truncated,
    sample: Array.isArray(v.sample) ? v.sample : undefined,
    trigger: v.trigger,
    error: v.error,
  };
}
