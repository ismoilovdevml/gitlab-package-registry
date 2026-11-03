"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedClient, type GitLabContext } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mapLimit } from "@/lib/gitlab/catalog";
import { PermissionDeniedError, errorMessage } from "@/lib/gitlab/errors";
import { accessLevelName, accessLevelOf } from "@/lib/gitlab/permissions";
import { AccessLevel, type GitLabProject } from "@/lib/gitlab/types";
import { routes } from "@/lib/routes";
import { TAGS_PER_PAGE } from "@/lib/repositories/params";

export type ActionResult = { ok: true; deleted?: number } | { ok: false; error: string; deleted?: number };

const id = z.number().int().positive();
// Docker tag grammar: [A-Za-z0-9_][A-Za-z0-9_.-]{0,127}
const tagName = z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/, "Invalid tag name");

const deleteTagsSchema = z.object({
  projectId: id,
  repositoryId: id,
  tagNames: z.array(tagName).min(1).max(TAGS_PER_PAGE),
});

const deleteRepositorySchema = z.object({ projectId: id, repositoryId: id });

/** Loads the project and requires Maintainer (same check as `requireProjectAccess`, but keeps the project for audit). */
async function requireMaintainer(ctx: GitLabContext, projectId: number, action: string): Promise<GitLabProject> {
  const project = await ctx.projects.getProject(projectId);
  const level = accessLevelOf(project);
  if (level < AccessLevel.MAINTAINER) {
    throw new PermissionDeniedError(
      `You need ${accessLevelName(AccessLevel.MAINTAINER)} access to ${action} (you have ${accessLevelName(level)}).`,
    );
  }
  return project;
}

/** Repository must belong to the project; returns its path for audit/messages. */
async function repositoryPath(ctx: GitLabContext, projectId: number, repositoryId: number): Promise<string> {
  const repo = await ctx.registry.getRepository(repositoryId);
  if (repo.project_id !== projectId) throw new Error("Container repository does not belong to this project.");
  return repo.path;
}

function revalidate(projectId: number, repositoryId: number) {
  revalidatePath(routes.containerRepository(projectId, repositoryId));
  revalidatePath(routes.repository(projectId));
  revalidatePath(routes.repositories);
}

export async function deleteContainerTags(
  projectId: number,
  repositoryId: number,
  tagNames: string[],
): Promise<ActionResult> {
  const parsed = deleteTagsSchema.safeParse({ projectId, repositoryId, tagNames });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const input = { ...parsed.data, tagNames: Array.from(new Set(parsed.data.tagNames)) };

  // Outside try: redirects to /login when the session is gone.
  const ctx = await getAuthenticatedClient();
  let project: GitLabProject;
  let repoPath: string;
  try {
    project = await requireMaintainer(ctx, input.projectId, "delete container tags");
    repoPath = await repositoryPath(ctx, input.projectId, input.repositoryId);
  } catch (e) {
    await logAudit({
      action: "container.tag_delete",
      targetType: "container_tag",
      target: `repository ${input.repositoryId}: ${input.tagNames.join(", ")}`.slice(0, 500),
      projectId: input.projectId,
      status: "failure",
      metadata: { repositoryId: input.repositoryId, tags: input.tagNames, error: errorMessage(e) },
    });
    return { ok: false, error: errorMessage(e) };
  }

  const results = await mapLimit(input.tagNames, 4, async (tag) => {
    try {
      await ctx.registry.deleteTag(input.projectId, input.repositoryId, tag);
      return { tag, error: null as string | null };
    } catch (e) {
      return { tag, error: errorMessage(e) };
    }
  });

  await Promise.all(
    results.map((r) =>
      logAudit({
        action: "container.tag_delete",
        targetType: "container_tag",
        target: `${repoPath}:${r.tag}`,
        projectId: project.id,
        projectPath: project.path_with_namespace,
        status: r.error ? "failure" : "success",
        metadata: { repositoryId: input.repositoryId, tag: r.tag, ...(r.error ? { error: r.error } : {}) },
      }),
    ),
  );

  const failed = results.filter((r) => r.error);
  const deleted = results.length - failed.length;
  if (deleted > 0) revalidate(input.projectId, input.repositoryId);

  if (failed.length) {
    const detail = failed
      .slice(0, 3)
      .map((f) => `${f.tag}: ${f.error}`)
      .join("; ");
    return {
      ok: false,
      deleted,
      error: `${failed.length} of ${results.length} tag${results.length === 1 ? "" : "s"} could not be deleted. ${detail}${failed.length > 3 ? "; …" : ""}`,
    };
  }
  return { ok: true, deleted };
}

export async function deleteContainerRepository(projectId: number, repositoryId: number): Promise<ActionResult> {
  const parsed = deleteRepositorySchema.safeParse({ projectId, repositoryId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const input = parsed.data;

  const ctx = await getAuthenticatedClient();
  let project: GitLabProject | null = null;
  let repoPath: string | null = null;
  try {
    project = await requireMaintainer(ctx, input.projectId, "delete container repositories");
    repoPath = await repositoryPath(ctx, input.projectId, input.repositoryId);
    // GitLab schedules the deletion (202) and removes tags in the background.
    await ctx.registry.deleteRepository(input.projectId, input.repositoryId);
  } catch (e) {
    await logAudit({
      action: "container.repository_delete",
      targetType: "container_repository",
      target: repoPath ?? `repository ${input.repositoryId}`,
      projectId: input.projectId,
      projectPath: project?.path_with_namespace,
      status: "failure",
      metadata: { repositoryId: input.repositoryId, error: errorMessage(e) },
    });
    return { ok: false, error: errorMessage(e) };
  }

  await logAudit({
    action: "container.repository_delete",
    targetType: "container_repository",
    target: repoPath,
    projectId: project.id,
    projectPath: project.path_with_namespace,
    status: "success",
    metadata: { repositoryId: input.repositoryId },
  });
  revalidate(input.projectId, input.repositoryId);
  return { ok: true };
}
