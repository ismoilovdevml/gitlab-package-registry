import "server-only";

import { z } from "zod";
import { and, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { AUDIT_ACTION_NAMES, AUDIT_CATEGORIES, DELETE_ACTIONS, actionsInCategory, type AuditCategory } from "./audit-actions";

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_EXPORT_MAX_ROWS = 50_000;

const CATEGORY_FILTERS = AUDIT_CATEGORIES.map((c) => `${c.id}.*`);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : undefined))
  .catch(undefined);

const optionalDay = z
  .string()
  .regex(DAY)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)))
  .optional()
  .catch(undefined);

const filtersSchema = z.object({
  actor: optionalText,
  // Exact action name, or "<category>.*" for a whole category.
  action: z
    .string()
    .refine((v) => (AUDIT_ACTION_NAMES as string[]).includes(v) || CATEGORY_FILTERS.includes(v))
    .optional()
    .catch(undefined),
  project: optionalText,
  status: z.enum(["success", "failure"]).optional().catch(undefined),
  from: optionalDay,
  to: optionalDay,
  q: optionalText,
  page: z.coerce.number().int().min(1).max(1_000_000).catch(1),
});

export type AuditFilters = z.infer<typeof filtersSchema>;

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

export function parseAuditFilters(params: RawParams): AuditFilters {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  return filtersSchema.parse({
    actor: get("actor"),
    action: get("action") || undefined,
    project: get("project"),
    status: get("status") || undefined,
    from: get("from") || undefined,
    to: get("to") || undefined,
    q: get("q"),
    page: get("page") ?? 1,
  });
}

/** Query string for the given filters (page omitted unless > 1). */
export function auditQueryString(f: AuditFilters, overrides: Partial<AuditFilters> = {}): string {
  const merged = { ...f, ...overrides };
  const params = new URLSearchParams();
  for (const key of ["actor", "action", "project", "status", "from", "to", "q"] as const) {
    const v = merged[key];
    if (v) params.set(key, v);
  }
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface AuditScope {
  /** When set, only this user's own entries are visible (non-admins). */
  ownUserId: number | null;
}

export function auditWhere(f: AuditFilters, scope: AuditScope): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (scope.ownUserId !== null) {
    conds.push(eq(auditLog.userId, scope.ownUserId));
  } else if (f.actor) {
    conds.push(ilike(auditLog.username, `%${escapeLike(f.actor)}%`));
  }
  if (f.action) {
    if (f.action.endsWith(".*")) {
      conds.push(inArray(auditLog.action, actionsInCategory(f.action.slice(0, -2) as AuditCategory)));
    } else {
      conds.push(eq(auditLog.action, f.action));
    }
  }
  if (f.project) conds.push(ilike(auditLog.projectPath, `%${escapeLike(f.project)}%`));
  if (f.status) conds.push(eq(auditLog.status, f.status));
  if (f.from) conds.push(gte(auditLog.createdAt, new Date(`${f.from}T00:00:00Z`)));
  if (f.to) {
    const end = new Date(`${f.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    conds.push(lt(auditLog.createdAt, end));
  }
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    conds.push(or(ilike(auditLog.target, like), ilike(auditLog.ip, like)));
  }
  return conds.length ? and(...conds) : undefined;
}

const rowColumns = {
  id: auditLog.id,
  createdAt: auditLog.createdAt,
  userId: auditLog.userId,
  username: auditLog.username,
  actorName: users.name,
  action: auditLog.action,
  targetType: auditLog.targetType,
  target: auditLog.target,
  projectId: auditLog.projectId,
  projectPath: auditLog.projectPath,
  status: auditLog.status,
  metadata: auditLog.metadata,
  ip: auditLog.ip,
};

export type AuditRow = Awaited<ReturnType<typeof listAuditEntries>>["rows"][number];

export async function listAuditEntries(f: AuditFilters, scope: AuditScope) {
  const where = auditWhere(f, scope);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select(rowColumns)
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(where)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((f.page - 1) * AUDIT_PAGE_SIZE),
    db.select({ total: count() }).from(auditLog).where(where),
  ]);
  return { rows, total };
}

export async function getAuditSummary(scope: AuditScope) {
  const own = scope.ownUserId !== null ? eq(auditLog.userId, scope.ownUserId) : undefined;
  const d1 = sql`now() - interval '24 hours'`;
  const d7 = sql`now() - interval '7 days'`;
  const [row] = await db
    .select({
      last24h: sql<number>`count(*) filter (where ${auditLog.createdAt} >= ${d1})`.mapWith(Number),
      deletes7d: sql<number>`count(*) filter (where ${auditLog.createdAt} >= ${d7} and ${inArray(auditLog.action, DELETE_ACTIONS)})`.mapWith(Number),
      failed7d: sql<number>`count(*) filter (where ${auditLog.createdAt} >= ${d7} and ${auditLog.status} = 'failure')`.mapWith(Number),
      actors30d: sql<number>`count(distinct coalesce(${auditLog.userId}::text, ${auditLog.username}))`.mapWith(Number),
      total30d: count(),
    })
    .from(auditLog)
    .where(and(sql`${auditLog.createdAt} >= now() - interval '30 days'`, own));
  return row ?? { last24h: 0, deletes7d: 0, failed7d: 0, actors30d: 0, total30d: 0 };
}

/** Yields matching rows newest first in batches (keyset on id), capped at AUDIT_EXPORT_MAX_ROWS. */
export async function* iterateAuditEntries(f: AuditFilters, scope: AuditScope, batchSize = 1000) {
  const where = auditWhere(f, scope);
  let lastId: number | null = null;
  let emitted = 0;
  while (emitted < AUDIT_EXPORT_MAX_ROWS) {
    const limit = Math.min(batchSize, AUDIT_EXPORT_MAX_ROWS - emitted);
    const batch = await db
      .select(rowColumns)
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(where, lastId !== null ? lt(auditLog.id, lastId) : undefined))
      .orderBy(desc(auditLog.id))
      .limit(limit);
    if (batch.length === 0) return;
    yield batch;
    emitted += batch.length;
    lastId = batch[batch.length - 1].id;
    if (batch.length < limit) return;
  }
}
