import "server-only";

import { eq } from "drizzle-orm";
import { db, sql } from "@/lib/db";
import { cleanupPolicies, type CleanupPolicy } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { buildQuery, type GitLabClient } from "@/lib/gitlab/client";
import { mapLimit } from "@/lib/gitlab/catalog";
import { errorMessage, RateLimitError, SessionExpiredError } from "@/lib/gitlab/errors";
import type { GitLabPackage } from "@/lib/gitlab/types";
import { MAX_PATTERN_LENGTH, patternError, type CleanupRunResult } from "./shared";

/** Max package versions listed per run (newest first). */
export const MAX_SCAN = 5000;
/** Max deletions per run; the rest is picked up by the next run. */
export const MAX_DELETE_PER_RUN = 1000;
const DELETE_CONCURRENCY = 3;
const MAX_ERRORS_STORED = 20;
const SAMPLE_SIZE = 50;
/** Advisory lock namespace for per-policy runs (migrate.ts uses 727274). */
const POLICY_LOCK_NS = 727275;

/** Statuses never deleted by a policy. */
const PROTECTED_STATUSES = new Set(["processing", "pending_destruction"]);

export interface PlannedDeletion {
  id: number;
  name: string;
  version: string;
  package_type: string;
  created_at: string;
}

export interface CleanupPlan {
  toDelete: PlannedDeletion[];
  /** Versions that match type+pattern but are kept (latest N, too new, or protected status). */
  kept: number;
  /** Versions listed from GitLab. */
  scanned: number;
  /** Versions that match the policy's type + name pattern. */
  matched: number;
  /** Listing hit MAX_SCAN; older versions were not evaluated. */
  truncated: boolean;
}

type PolicyRules = Pick<CleanupPolicy, "projectId" | "packageType" | "namePattern" | "keepLatest" | "olderThanDays">;

export function compilePattern(pattern: string | null): RegExp | null {
  if (!pattern) return null;
  const err = patternError(pattern);
  if (err) throw new Error(err);
  return new RegExp(pattern.slice(0, MAX_PATTERN_LENGTH));
}

/** Computes which package versions a policy would delete. Read-only. */
export async function planCleanup(client: GitLabClient, policy: PolicyRules, now = Date.now()): Promise<CleanupPlan> {
  if (!policy.keepLatest && !policy.olderThanDays) {
    throw new Error("Policy must set 'keep latest' and/or 'older than days'.");
  }
  const regex = compilePattern(policy.namePattern);

  // Newest first across the project, so per-name ranking is correct even when the scan is truncated.
  const packages = await client.requestAll<GitLabPackage>(
    `/projects/${policy.projectId}/packages${buildQuery({
      package_type: policy.packageType,
      order_by: "created_at",
      sort: "desc",
    })}`,
    { maxItems: MAX_SCAN },
  );

  const cutoff = policy.olderThanDays ? now - policy.olderThanDays * 86_400_000 : null;
  const matching = packages.filter(
    (p) => (!policy.packageType || p.package_type === policy.packageType) && (!regex || regex.test(p.name)),
  );
  matching.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const rank = new Map<string, number>();
  const toDelete: PlannedDeletion[] = [];
  for (const p of matching) {
    if (PROTECTED_STATUSES.has(p.status)) continue;
    const key = `${p.package_type}\u0000${p.name}`;
    const position = rank.get(key) ?? 0;
    rank.set(key, position + 1);

    if (policy.keepLatest && position < policy.keepLatest) continue;
    if (cutoff !== null && !(Date.parse(p.created_at) < cutoff)) continue;
    toDelete.push({
      id: p.id,
      name: p.name,
      version: p.version,
      package_type: p.package_type,
      created_at: p.created_at,
    });
  }

  return {
    toDelete,
    kept: matching.length - toDelete.length,
    scanned: packages.length,
    matched: matching.length,
    truncated: packages.length >= MAX_SCAN,
  };
}

/**
 * Runs `fn` while holding a session-level advisory lock on a dedicated connection.
 * Returns `{ acquired: false }` when another run (any replica) holds the lock.
 */
export async function withAdvisoryLock<T>(
  ns: number,
  key: number,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const conn = await sql.reserve();
  try {
    const [row] = await conn`SELECT pg_try_advisory_lock(${ns}::int, ${key}::int) AS locked`;
    if (!row?.locked) return { acquired: false };
    try {
      return { acquired: true, value: await fn() };
    } finally {
      await conn`SELECT pg_advisory_unlock(${ns}::int, ${key}::int)`.catch(() => {});
    }
  } finally {
    conn.release();
  }
}

export interface ExecuteOptions {
  actor: { userId: number | null; username: string | null };
  trigger?: "manual" | "scheduler";
}

/**
 * Plans and executes a policy. Dry-run policies only record what would be deleted.
 * Stores lastRunAt/lastResult and writes audit entries. Throws only if the policy is already running.
 */
export async function executeCleanup(
  client: GitLabClient,
  policy: CleanupPolicy,
  { actor, trigger = "manual" }: ExecuteOptions,
): Promise<CleanupRunResult> {
  const locked = await withAdvisoryLock(POLICY_LOCK_NS, policy.id, () => runLocked(client, policy, actor, trigger));
  if (!locked.acquired) throw new Error("This policy is already running. Try again in a moment.");
  return locked.value;
}

async function runLocked(
  client: GitLabClient,
  policy: CleanupPolicy,
  actor: ExecuteOptions["actor"],
  trigger: "manual" | "scheduler",
): Promise<CleanupRunResult> {
  const auditBase = {
    targetType: "policy" as const,
    target: policy.name,
    projectId: policy.projectId,
    projectPath: policy.projectPath,
    actor,
  };

  let plan: CleanupPlan;
  try {
    plan = await planCleanup(client, policy);
  } catch (e) {
    const result: CleanupRunResult = {
      scanned: 0,
      matched: 0,
      deleted: 0,
      failed: 0,
      errors: [errorMessage(e)],
      dryRun: policy.dryRun,
      finishedAt: new Date().toISOString(),
      trigger,
      error: errorMessage(e),
    };
    await saveResult(policy.id, result);
    await logAudit({
      ...auditBase,
      action: "cleanup.run",
      status: "failure",
      metadata: { policyId: policy.id, ...result },
    });
    return result;
  }

  const base = {
    scanned: plan.scanned,
    matched: plan.toDelete.length,
    dryRun: policy.dryRun,
    truncated: plan.truncated,
    trigger,
  };

  if (policy.dryRun) {
    const result: CleanupRunResult = {
      ...base,
      deleted: 0,
      failed: 0,
      errors: [],
      finishedAt: new Date().toISOString(),
      sample: plan.toDelete.slice(0, SAMPLE_SIZE).map((p) => ({ name: p.name, version: p.version })),
    };
    await saveResult(policy.id, result);
    await logAudit({
      ...auditBase,
      action: "cleanup.run",
      metadata: { policyId: policy.id, ...result, sample: undefined },
    });
    return result;
  }

  const batch = plan.toDelete.slice(0, MAX_DELETE_PER_RUN);
  let deleted = 0;
  let failed = 0;
  let skipped = plan.toDelete.length - batch.length;
  const errors: string[] = [];
  let abortReason: string | null = null;

  await mapLimit(batch, DELETE_CONCURRENCY, async (pkg) => {
    if (abortReason) {
      skipped++;
      return;
    }
    const label = `${pkg.name}@${pkg.version}`;
    try {
      await client.request(`/projects/${policy.projectId}/packages/${pkg.id}`, { method: "DELETE" });
      deleted++;
      await logAudit({
        ...auditBase,
        action: "package.delete",
        targetType: "package",
        target: label,
        metadata: { policyId: policy.id, packageId: pkg.id, packageType: pkg.package_type, trigger },
      });
    } catch (e) {
      failed++;
      if (errors.length < MAX_ERRORS_STORED) errors.push(`${label}: ${errorMessage(e)}`);
      // Further calls would fail the same way; stop and leave the rest for the next run.
      if (e instanceof RateLimitError || e instanceof SessionExpiredError) abortReason = errorMessage(e);
      await logAudit({
        ...auditBase,
        action: "package.delete",
        targetType: "package",
        target: label,
        status: "failure",
        metadata: { policyId: policy.id, packageId: pkg.id, error: errorMessage(e), trigger },
      });
    }
  });

  const result: CleanupRunResult = {
    ...base,
    deleted,
    failed,
    skipped,
    errors,
    finishedAt: new Date().toISOString(),
    ...(abortReason ? { error: `Stopped early: ${abortReason}` } : {}),
  };
  await saveResult(policy.id, result);
  await logAudit({
    ...auditBase,
    action: "cleanup.run",
    status: failed > 0 || abortReason ? "failure" : "success",
    metadata: { policyId: policy.id, ...result },
  });
  return result;
}

async function saveResult(policyId: number, result: CleanupRunResult) {
  await db
    .update(cleanupPolicies)
    .set({ lastRunAt: new Date(result.finishedAt), lastResult: result })
    .where(eq(cleanupPolicies.id, policyId));
}
