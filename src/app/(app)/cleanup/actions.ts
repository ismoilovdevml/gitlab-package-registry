"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedClient, type GitLabContext } from "@/lib/dal";
import { db } from "@/lib/db";
import { cleanupPolicies } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { PACKAGE_TYPES } from "@/lib/gitlab/formats";
import { accessLevelName, accessLevelOf } from "@/lib/gitlab/permissions";
import { errorMessage, PermissionDeniedError } from "@/lib/gitlab/errors";
import { AccessLevel, type GitLabProject } from "@/lib/gitlab/types";
import { executeCleanup, planCleanup, type PlannedDeletion } from "@/lib/cleanup/engine";
import { getPolicy } from "@/lib/cleanup/queries";
import { MAX_PATTERN_LENGTH, patternError, type CleanupRunResult } from "@/lib/cleanup/shared";
import { routes } from "@/lib/routes";

type Fail = { ok: false; error: string };
type Result<T extends object = object> = ({ ok: true } & T) | Fail;

const PREVIEW_LIMIT = 500;

const idSchema = z.number().int().positive();

const policySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(100, "Name is too long."),
    projectId: z.number().int().positive("Choose a project."),
    packageType: z.enum(PACKAGE_TYPES).nullable(),
    namePattern: z
      .string()
      .trim()
      .max(MAX_PATTERN_LENGTH, `Pattern must be at most ${MAX_PATTERN_LENGTH} characters.`)
      .nullable()
      .transform((v) => v || null),
    keepLatest: z.number().int().min(1, "Keep latest must be at least 1.").max(10_000).nullable(),
    olderThanDays: z.number().int().min(1, "Older than must be at least 1 day.").max(36_500).nullable(),
    enabled: z.boolean(),
    dryRun: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.keepLatest === null && v.olderThanDays === null) {
      ctx.addIssue({ code: "custom", message: "Set 'keep latest' and/or 'older than days'.", path: ["keepLatest"] });
    }
    const err = patternError(v.namePattern);
    if (err) ctx.addIssue({ code: "custom", message: err, path: ["namePattern"] });
  });

export type PolicyInput = z.input<typeof policySchema>;

function fail(e: unknown): Fail {
  return { ok: false, error: errorMessage(e) };
}

function validationError(error: z.ZodError): Fail {
  return { ok: false, error: error.issues[0]?.message ?? "Invalid input." };
}

/** Loads the project and requires Maintainer+ (GitLab permissions; admins are not exempt). */
async function requireMaintainer(ctx: GitLabContext, projectId: number): Promise<GitLabProject> {
  const project = await ctx.projects.getProject(projectId);
  const level = accessLevelOf(project);
  if (level < AccessLevel.MAINTAINER) {
    throw new PermissionDeniedError(
      `You need Maintainer access on ${project.path_with_namespace} to manage cleanup policies (you have ${accessLevelName(level)}).`,
    );
  }
  return project;
}

function revalidate() {
  revalidatePath(routes.cleanup);
}

export async function searchProjectsAction(search: string): Promise<Result<{ projects: { id: number; path: string }[] }>> {
  const q = z.string().max(100).safeParse(search);
  if (!q.success) return validationError(q.error);
  const ctx = await getAuthenticatedClient();
  try {
    const res = await ctx.projects.listProjects({
      membership: true,
      min_access_level: AccessLevel.MAINTAINER,
      search: q.data.trim() || undefined,
      simple: true,
      archived: false,
      order_by: "last_activity_at",
      per_page: 20,
    });
    return { ok: true, projects: res.data.map((p) => ({ id: p.id, path: p.path_with_namespace })) };
  } catch (e) {
    return fail(e);
  }
}

export async function createPolicyAction(input: PolicyInput): Promise<Result<{ id: number }>> {
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const v = parsed.data;
  const ctx = await getAuthenticatedClient();
  try {
    const project = await requireMaintainer(ctx, v.projectId);
    const [row] = await db
      .insert(cleanupPolicies)
      .values({ ...v, projectPath: project.path_with_namespace, createdBy: ctx.session.userId })
      .returning({ id: cleanupPolicies.id });
    await logAudit({
      action: "cleanup.policy_create",
      targetType: "policy",
      target: v.name,
      projectId: project.id,
      projectPath: project.path_with_namespace,
      metadata: { policyId: row.id, ...v },
    });
    revalidate();
    return { ok: true, id: row.id };
  } catch (e) {
    await logAudit({
      action: "cleanup.policy_create",
      targetType: "policy",
      target: v.name,
      projectId: v.projectId,
      status: "failure",
      metadata: { error: errorMessage(e) },
    });
    return fail(e);
  }
}

export async function updatePolicyAction(id: number, input: PolicyInput): Promise<Result> {
  const pid = idSchema.safeParse(id);
  if (!pid.success) return validationError(pid.error);
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const v = parsed.data;
  const ctx = await getAuthenticatedClient();
  const existing = await getPolicy(pid.data);
  if (!existing) return { ok: false, error: "Policy not found." };
  try {
    await requireMaintainer(ctx, existing.projectId);
    const project = v.projectId === existing.projectId ? null : await requireMaintainer(ctx, v.projectId);
    await db
      .update(cleanupPolicies)
      .set({
        ...v,
        projectPath: project ? project.path_with_namespace : existing.projectPath,
        updatedAt: new Date(),
      })
      .where(eq(cleanupPolicies.id, existing.id));
    await logAudit({
      action: "cleanup.policy_update",
      targetType: "policy",
      target: v.name,
      projectId: v.projectId,
      projectPath: project ? project.path_with_namespace : existing.projectPath,
      metadata: { policyId: existing.id, ...v },
    });
    revalidate();
    return { ok: true };
  } catch (e) {
    await logAudit({
      action: "cleanup.policy_update",
      targetType: "policy",
      target: existing.name,
      projectId: existing.projectId,
      projectPath: existing.projectPath,
      status: "failure",
      metadata: { policyId: existing.id, error: errorMessage(e) },
    });
    return fail(e);
  }
}

export async function togglePolicyAction(id: number, enabled: boolean): Promise<Result> {
  const parsed = z.object({ id: idSchema, enabled: z.boolean() }).safeParse({ id, enabled });
  if (!parsed.success) return validationError(parsed.error);
  const ctx = await getAuthenticatedClient();
  const existing = await getPolicy(parsed.data.id);
  if (!existing) return { ok: false, error: "Policy not found." };
  try {
    await requireMaintainer(ctx, existing.projectId);
    await db
      .update(cleanupPolicies)
      .set({ enabled: parsed.data.enabled, updatedAt: new Date() })
      .where(eq(cleanupPolicies.id, existing.id));
    await logAudit({
      action: "cleanup.policy_update",
      targetType: "policy",
      target: existing.name,
      projectId: existing.projectId,
      projectPath: existing.projectPath,
      metadata: { policyId: existing.id, enabled: parsed.data.enabled },
    });
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePolicyAction(id: number): Promise<Result> {
  const pid = idSchema.safeParse(id);
  if (!pid.success) return validationError(pid.error);
  const ctx = await getAuthenticatedClient();
  const existing = await getPolicy(pid.data);
  if (!existing) return { ok: false, error: "Policy not found." };
  try {
    await requireMaintainer(ctx, existing.projectId);
    await db.delete(cleanupPolicies).where(eq(cleanupPolicies.id, existing.id));
    await logAudit({
      action: "cleanup.policy_delete",
      targetType: "policy",
      target: existing.name,
      projectId: existing.projectId,
      projectPath: existing.projectPath,
      metadata: { policyId: existing.id },
    });
    revalidate();
    return { ok: true };
  } catch (e) {
    await logAudit({
      action: "cleanup.policy_delete",
      targetType: "policy",
      target: existing.name,
      projectId: existing.projectId,
      projectPath: existing.projectPath,
      status: "failure",
      metadata: { policyId: existing.id, error: errorMessage(e) },
    });
    return fail(e);
  }
}

export interface PreviewData {
  toDelete: PlannedDeletion[];
  total: number;
  kept: number;
  scanned: number;
  matched: number;
  truncated: boolean;
  dryRun: boolean;
}

export async function previewPolicyAction(id: number): Promise<Result<{ preview: PreviewData }>> {
  const pid = idSchema.safeParse(id);
  if (!pid.success) return validationError(pid.error);
  const ctx = await getAuthenticatedClient();
  const policy = await getPolicy(pid.data);
  if (!policy) return { ok: false, error: "Policy not found." };
  try {
    await requireMaintainer(ctx, policy.projectId);
    const plan = await planCleanup(ctx.client, policy);
    return {
      ok: true,
      preview: {
        toDelete: plan.toDelete.slice(0, PREVIEW_LIMIT),
        total: plan.toDelete.length,
        kept: plan.kept,
        scanned: plan.scanned,
        matched: plan.matched,
        truncated: plan.truncated,
        dryRun: policy.dryRun,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function runPolicyAction(id: number): Promise<Result<{ result: CleanupRunResult }>> {
  const pid = idSchema.safeParse(id);
  if (!pid.success) return validationError(pid.error);
  const ctx = await getAuthenticatedClient();
  const policy = await getPolicy(pid.data);
  if (!policy) return { ok: false, error: "Policy not found." };
  try {
    await requireMaintainer(ctx, policy.projectId);
  } catch (e) {
    await logAudit({
      action: "cleanup.run",
      targetType: "policy",
      target: policy.name,
      projectId: policy.projectId,
      projectPath: policy.projectPath,
      status: "failure",
      metadata: { policyId: policy.id, error: errorMessage(e) },
    });
    return fail(e);
  }
  try {
    const result = await executeCleanup(ctx.client, policy, {
      actor: { userId: ctx.session.userId, username: ctx.session.username },
      trigger: "manual",
    });
    revalidate();
    if (result.error && result.deleted === 0 && result.scanned === 0) return { ok: false, error: result.error };
    return { ok: true, result };
  } catch (e) {
    return fail(e);
  }
}
