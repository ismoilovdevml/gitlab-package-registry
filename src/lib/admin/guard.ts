import "server-only";

import { getSession } from "@/lib/session";
import type { SessionPayload } from "@/types/session";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** For Server Actions: returns the admin session, or null (never redirects). */
export async function getAdminSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  return session?.isAdmin ? session : null;
}

/** Thrown inside a transaction to roll it back with a user-facing message. */
export class ActionError extends Error {}

export function actionErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ActionError) return e.message;
  console.error("[ombor]", fallback, e);
  return fallback;
}
