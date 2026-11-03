import "server-only";

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { cleanupPolicies } from "@/lib/db/schema";
import { createGitLabClient } from "@/lib/gitlab/client";
import { errorMessage } from "@/lib/gitlab/errors";
import { getSetting, getSettings } from "@/lib/setup";
import { executeCleanup, withAdvisoryLock } from "./engine";

export const SERVICE_TOKEN_SETTING = "cleanup_service_token";
/** Advisory lock namespace for the scheduler tick (one replica at a time). */
const SCHEDULER_LOCK_NS = 727276;
const FIRST_TICK_DELAY_MS = 60_000;
const SCHEDULER_ACTOR = { userId: null, username: "scheduler" };

export function cleanupIntervalMinutes(): number {
  const n = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || "", 10);
  return Number.isFinite(n) && n >= 5 ? n : 1440;
}

interface SchedulerState {
  timer?: NodeJS.Timeout;
  running: boolean;
  warnedNoToken: boolean;
}

const state = globalThis as unknown as { omborCleanupScheduler?: SchedulerState };

/**
 * Starts the background cleanup scheduler (idempotent). Every tick runs each enabled, live
 * (non-dry-run) policy whose last run is older than CLEANUP_INTERVAL_MINUTES, using the admin-configured
 * service token. Ticks are frequent so restarts don't postpone runs; a pg advisory lock keeps it single-replica.
 */
export function startCleanupScheduler(): void {
  if (state.omborCleanupScheduler) return;
  const intervalMin = cleanupIntervalMinutes();
  const tickMs = Math.min(intervalMin, 15) * 60_000;

  const s: SchedulerState = { running: false, warnedNoToken: false };
  const tick = async () => {
    if (s.running) return;
    s.running = true;
    try {
      await runDuePolicies(intervalMin, s);
    } catch (e) {
      console.error("[ombor] cleanup scheduler tick failed:", errorMessage(e));
    } finally {
      s.running = false;
    }
  };

  const first = setTimeout(() => {
    void tick();
    const timer = setInterval(() => void tick(), tickMs);
    timer.unref?.();
    s.timer = timer;
  }, FIRST_TICK_DELAY_MS);
  first.unref?.();
  s.timer = first;
  state.omborCleanupScheduler = s;
  console.log(`[ombor] cleanup scheduler started (interval ${intervalMin} min)`);
}

async function runDuePolicies(intervalMin: number, s: SchedulerState) {
  const settings = await getSettings();
  if (!settings?.gitlabUrl) return;

  const token = await getSetting(SERVICE_TOKEN_SETTING);
  if (!token) {
    if (!s.warnedNoToken) {
      console.warn("[ombor] cleanup scheduler: no service token configured (Settings → cleanup service token); skipping scheduled runs");
      s.warnedNoToken = true;
    }
    return;
  }
  s.warnedNoToken = false;

  await withAdvisoryLock(SCHEDULER_LOCK_NS, 0, async () => {
    const dueBefore = new Date(Date.now() - intervalMin * 60_000);
    const due = await db
      .select()
      .from(cleanupPolicies)
      .where(
        and(
          eq(cleanupPolicies.enabled, true),
          eq(cleanupPolicies.dryRun, false),
          or(isNull(cleanupPolicies.lastRunAt), lt(cleanupPolicies.lastRunAt, dueBefore)),
        ),
      );
    if (due.length === 0) return;

    const client = createGitLabClient({ baseUrl: settings.gitlabUrl, token });
    for (const policy of due) {
      try {
        const r = await executeCleanup(client, policy, { actor: SCHEDULER_ACTOR, trigger: "scheduler" });
        console.log(
          `[ombor] cleanup policy #${policy.id} (${policy.projectPath}): deleted ${r.deleted}, failed ${r.failed}${r.error ? ` — ${r.error}` : ""}`,
        );
      } catch (e) {
        // Already running elsewhere (manual run) — next tick will pick it up if still due.
        console.warn(`[ombor] cleanup policy #${policy.id} skipped: ${errorMessage(e)}`);
      }
    }
  });
}
