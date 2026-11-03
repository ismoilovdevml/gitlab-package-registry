"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { ActionError, actionErrorMessage, getAdminSession, type ActionResult } from "@/lib/admin/guard";
import { routes } from "@/lib/routes";

const userIdSchema = z.number().int().positive();
const roleSchema = z.object({ userId: userIdSchema, admin: z.boolean() });
const blockSchema = z.object({ userId: userIdSchema, blocked: z.boolean() });

const NOT_ADMIN = "Only Ombor administrators can manage users.";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function activeAdminCount(tx: Tx): Promise<number> {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.isAdmin, true), eq(users.isBlocked, false)));
  return n;
}

async function findUser(tx: Tx, userId: number) {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ActionError("User not found.");
  return user;
}

export async function setUserRole(input: { userId: number; admin: boolean }): Promise<ActionResult> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { userId, admin } = parsed.data;

  const session = await getAdminSession();
  if (!session) return { ok: false, error: NOT_ADMIN };
  if (userId === session.userId && !admin) {
    return { ok: false, error: "You can't remove your own admin role. Ask another admin to do it." };
  }

  let username: string | undefined;
  try {
    await db.transaction(async (tx) => {
      const user = await findUser(tx, userId);
      username = user.username;
      if (user.isAdmin === admin) return;
      await tx.update(users).set({ isAdmin: admin }).where(eq(users.id, userId));
      if (!admin && (await activeAdminCount(tx)) === 0) {
        throw new ActionError("Ombor needs at least one active admin. Promote someone else first.");
      }
    });
  } catch (e) {
    const error = actionErrorMessage(e, "Failed to change the user's role.");
    await logAudit({
      action: "user.role_change",
      targetType: "user",
      target: username ?? String(userId),
      status: "failure",
      metadata: { userId, isAdmin: admin, error },
    });
    return { ok: false, error };
  }

  await logAudit({
    action: "user.role_change",
    targetType: "user",
    target: username,
    metadata: { userId, role: admin ? "admin" : "user" },
  });
  revalidatePath(routes.users);
  return { ok: true };
}

export async function setUserBlocked(input: { userId: number; blocked: boolean }): Promise<ActionResult<{ sessionsRevoked: number }>> {
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { userId, blocked } = parsed.data;

  const session = await getAdminSession();
  if (!session) return { ok: false, error: NOT_ADMIN };
  if (userId === session.userId && blocked) return { ok: false, error: "You can't block yourself." };

  const action = blocked ? "user.block" : "user.unblock";
  let username: string | undefined;
  let sessionsRevoked = 0;
  try {
    await db.transaction(async (tx) => {
      const user = await findUser(tx, userId);
      username = user.username;
      if (user.isBlocked !== blocked) {
        await tx.update(users).set({ isBlocked: blocked }).where(eq(users.id, userId));
        if (blocked && user.isAdmin && (await activeAdminCount(tx)) === 0) {
          throw new ActionError("Ombor needs at least one active admin.");
        }
      }
      if (blocked) {
        const deleted = await tx.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id });
        sessionsRevoked = deleted.length;
      }
    });
  } catch (e) {
    const error = actionErrorMessage(e, `Failed to ${blocked ? "block" : "unblock"} the user.`);
    await logAudit({
      action,
      targetType: "user",
      target: username ?? String(userId),
      status: "failure",
      metadata: { userId, error },
    });
    return { ok: false, error };
  }

  await logAudit({
    action,
    targetType: "user",
    target: username,
    metadata: blocked ? { userId, sessionsRevoked } : { userId },
  });
  revalidatePath(routes.users);
  return { ok: true, sessionsRevoked };
}

export async function revokeUserSessions(input: { userId: number }): Promise<ActionResult<{ sessionsRevoked: number }>> {
  const parsed = z.object({ userId: userIdSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { userId } = parsed.data;

  const session = await getAdminSession();
  if (!session) return { ok: false, error: NOT_ADMIN };

  let username: string | undefined;
  try {
    const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return { ok: false, error: "User not found." };
    username = user.username;
    // Keep the admin's own current session when revoking their own sessions.
    const where =
      userId === session.userId
        ? and(eq(sessions.userId, userId), ne(sessions.id, session.sessionId))
        : eq(sessions.userId, userId);
    const deleted = await db.delete(sessions).where(where).returning({ id: sessions.id });

    await logAudit({
      action: "user.sessions_revoke",
      targetType: "user",
      target: username,
      metadata: { userId, sessionsRevoked: deleted.length, keptCurrentSession: userId === session.userId },
    });
    revalidatePath(routes.users);
    return { ok: true, sessionsRevoked: deleted.length };
  } catch (e) {
    const error = actionErrorMessage(e, "Failed to revoke sessions.");
    await logAudit({
      action: "user.sessions_revoke",
      targetType: "user",
      target: username ?? String(userId),
      status: "failure",
      metadata: { userId, error },
    });
    return { ok: false, error };
  }
}
