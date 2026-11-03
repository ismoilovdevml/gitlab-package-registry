import "server-only";

import type { GitLabClient } from "./client";
import { PermissionDeniedError } from "./errors";
import { AccessLevel, type GitLabProject } from "./types";

export function accessLevelOf(project: GitLabProject): number {
  return Math.max(
    project.permissions?.project_access?.access_level ?? 0,
    project.permissions?.group_access?.access_level ?? 0,
  );
}

export function accessLevelName(level: number): string {
  if (level >= AccessLevel.OWNER) return "Owner";
  if (level >= AccessLevel.MAINTAINER) return "Maintainer";
  if (level >= AccessLevel.DEVELOPER) return "Developer";
  if (level >= AccessLevel.REPORTER) return "Reporter";
  if (level >= AccessLevel.PLANNER) return "Planner";
  if (level >= AccessLevel.GUEST) return "Guest";
  return "No access";
}

/** Effective access level of the current user on a project (via GitLab's `permissions`). */
export async function getProjectAccessLevel(client: GitLabClient, projectId: number): Promise<number> {
  const project = await client.request<GitLabProject>(`/projects/${projectId}`);
  return accessLevelOf(project);
}

/**
 * Guard for write operations. GitLab enforces permissions itself; this gives a clear error early.
 * Deleting packages needs Maintainer; publishing needs Developer.
 */
export async function requireProjectAccess(
  client: GitLabClient,
  projectId: number,
  minLevel: number,
  action = "perform this action",
): Promise<void> {
  const level = await getProjectAccessLevel(client, projectId);
  if (level < minLevel) {
    throw new PermissionDeniedError(
      `You need ${accessLevelName(minLevel)} access to ${action} (you have ${accessLevelName(level)}).`,
    );
  }
}
