import "server-only";

import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { getClientMeta, getSession } from "@/lib/session";

/** Canonical audit action names. Use these, don't invent new strings ad hoc. */
export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.login_failed"
  | "package.publish"
  | "package.delete"
  | "package.file_delete"
  | "package.bulk_delete"
  | "container.tag_delete"
  | "container.repository_delete"
  | "cleanup.policy_create"
  | "cleanup.policy_update"
  | "cleanup.policy_delete"
  | "cleanup.run"
  | "settings.update"
  | "user.role_change"
  | "user.block"
  | "user.unblock"
  | "user.sessions_revoke";

export interface AuditInput {
  action: AuditAction;
  targetType?: "package" | "package_file" | "container_tag" | "container_repository" | "policy" | "settings" | "user" | "session";
  target?: string;
  projectId?: number;
  projectPath?: string;
  status?: "success" | "failure";
  metadata?: Record<string, unknown>;
  /** Override actor (e.g. during login before a session exists). */
  actor?: { userId: number | null; username: string | null };
}

/** Records an audit entry. Never throws — auditing must not break the user action. */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const session = input.actor ? null : await getSession();
    const meta = await getClientMeta().catch(() => ({ ip: null }));
    await db.insert(auditLog).values({
      userId: input.actor ? input.actor.userId : (session?.userId ?? null),
      username: input.actor ? input.actor.username : (session?.username ?? null),
      action: input.action,
      targetType: input.targetType ?? null,
      target: input.target ?? null,
      projectId: input.projectId ?? null,
      projectPath: input.projectPath ?? null,
      status: input.status ?? "success",
      metadata: input.metadata ?? null,
      ip: meta.ip,
    });
  } catch (e) {
    console.error("[ombor] failed to write audit entry", e);
  }
}
