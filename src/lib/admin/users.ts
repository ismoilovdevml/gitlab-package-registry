import "server-only";

import { z } from "zod";
import { and, count, desc, eq, gt, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

export const USERS_PAGE_SIZE = 50;

const filtersSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined)
    .catch(undefined),
  role: z.enum(["admin", "user"]).optional().catch(undefined),
  status: z.enum(["active", "blocked"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
});

export type UserFilters = z.infer<typeof filtersSchema>;

export function parseUserFilters(params: Record<string, string | string[] | undefined>): UserFilters {
  const get = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  return filtersSchema.parse({ q: get("q"), role: get("role"), status: get("status"), page: get("page") ?? 1 });
}

export function userQueryString(f: UserFilters, overrides: Partial<UserFilters> = {}): string {
  const m = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (m.q) p.set("q", m.q);
  if (m.role) p.set("role", m.role);
  if (m.status) p.set("status", m.status);
  if (m.page && m.page > 1) p.set("page", String(m.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listUsers(f: UserFilters) {
  const conds: (SQL | undefined)[] = [];
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    conds.push(or(ilike(users.username, like), ilike(users.name, like), ilike(users.email, like)));
  }
  if (f.role) conds.push(eq(users.isAdmin, f.role === "admin"));
  if (f.status) conds.push(eq(users.isBlocked, f.status === "blocked"));
  const where = conds.length ? and(...conds) : undefined;

  const activeSessions = sql<number>`count(${sessions.id}) filter (where ${gt(sessions.expiresAt, new Date())})`.mapWith(
    Number,
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        gitlabUserId: users.gitlabUserId,
        username: users.username,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        isAdmin: users.isAdmin,
        isBlocked: users.isBlocked,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        activeSessions,
      })
      .from(users)
      .leftJoin(sessions, eq(sessions.userId, users.id))
      .where(where)
      .groupBy(users.id)
      .orderBy(desc(users.isAdmin), sql`${users.lastLoginAt} desc nulls last`, users.username)
      .limit(USERS_PAGE_SIZE)
      .offset((f.page - 1) * USERS_PAGE_SIZE),
    db.select({ total: count() }).from(users).where(where),
  ]);
  return { rows, total };
}

export type UserRow = Awaited<ReturnType<typeof listUsers>>["rows"][number];

export async function getUserStats() {
  const [[u], [s]] = await Promise.all([
    db
      .select({
        total: count(),
        admins: sql<number>`count(*) filter (where ${users.isAdmin} and not ${users.isBlocked})`.mapWith(Number),
        blocked: sql<number>`count(*) filter (where ${users.isBlocked})`.mapWith(Number),
      })
      .from(users),
    db.select({ active: count() }).from(sessions).where(gt(sessions.expiresAt, new Date())),
  ]);
  return { total: u.total, admins: u.admins, blocked: u.blocked, activeSessions: s.active };
}
