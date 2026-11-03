import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, cleanupPolicies, type CleanupPolicy } from "@/lib/db/schema";

export const MAX_POLICIES = 200;

export function listPolicies(): Promise<CleanupPolicy[]> {
  return db.select().from(cleanupPolicies).orderBy(cleanupPolicies.name, cleanupPolicies.id).limit(MAX_POLICIES);
}

export async function getPolicy(id: number): Promise<CleanupPolicy | null> {
  const [row] = await db.select().from(cleanupPolicies).where(eq(cleanupPolicies.id, id)).limit(1);
  return row ?? null;
}

/** Recent `cleanup.run` audit entries, optionally limited to some projects. */
export function listRunHistory(projectIds: number[] | null, limit = 20) {
  if (projectIds && projectIds.length === 0) return Promise.resolve([]);
  const where = projectIds
    ? and(eq(auditLog.action, "cleanup.run"), inArray(auditLog.projectId, projectIds))
    : eq(auditLog.action, "cleanup.run");
  return db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      username: auditLog.username,
      target: auditLog.target,
      projectId: auditLog.projectId,
      projectPath: auditLog.projectPath,
      status: auditLog.status,
      metadata: auditLog.metadata,
    })
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
