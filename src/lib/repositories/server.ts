import "server-only";

import { cache } from "react";
import { getAuthenticatedClient, type GitLabContext } from "@/lib/dal";
import { mapLimit } from "@/lib/gitlab/catalog";
import { GitLabApiError } from "@/lib/gitlab/errors";
import { accessLevelName, accessLevelOf } from "@/lib/gitlab/permissions";
import type { GitLabGroup, GitLabProject, GitLabRegistryTag, PaginatedResponse } from "@/lib/gitlab/types";
import { AccessLevel } from "@/lib/gitlab/types";
import type { Snippet } from "@/lib/gitlab/install-commands";
import { REPOSITORIES_PER_PAGE, REPOSITORY_SORTS, TAGS_PER_PAGE, type RepositoryListParams } from "./params";

export function isStatus(e: unknown, ...statuses: number[]): boolean {
  return e instanceof GitLabApiError && statuses.includes(e.status);
}

/** Role label, or null when GitLab didn't include `permissions` (e.g. group project listings). */
export function roleOf(project: GitLabProject): { level: number; name: string } | null {
  if (!project.permissions) return null;
  const level = accessLevelOf(project);
  return { level, name: accessLevelName(level) };
}

export function canMaintain(project: GitLabProject): boolean {
  return accessLevelOf(project) >= AccessLevel.MAINTAINER;
}

export interface RepositoryListResult {
  page: PaginatedResponse<GitLabProject>;
  /** Set when the requested sort was rejected by GitLab and we fell back to last activity. */
  sortFallback: boolean;
}

/**
 * One page of projects the user is a member of (or of a group, including subgroups).
 * Sorting by storage is admin-only in GitLab; a 400 falls back to last activity.
 */
export async function listRepositoryProjects(
  ctx: Pick<GitLabContext, "projects">,
  params: RepositoryListParams,
): Promise<RepositoryListResult> {
  const fetchPage = (sortValue: RepositoryListParams["sort"]) => {
    const s = REPOSITORY_SORTS.find((x) => x.value === sortValue) ?? REPOSITORY_SORTS[0];
    const common = {
      search: params.q || undefined,
      order_by: s.orderBy,
      sort: s.sort,
      statistics: true,
      page: params.page,
      per_page: REPOSITORIES_PER_PAGE,
    } as const;
    return params.group
      ? ctx.projects.listGroupProjects(params.group, { ...common, include_subgroups: true, min_access_level: AccessLevel.GUEST })
      : ctx.projects.listProjects({ ...common, membership: true });
  };

  try {
    return { page: await fetchPage(params.sort), sortFallback: false };
  } catch (e) {
    if (params.sort === "storage" && isStatus(e, 400, 403)) {
      return { page: await fetchPage("activity"), sortFallback: true };
    }
    throw e;
  }
}

/** Groups for the filter dropdown (bounded to one page of 100). */
export async function listFilterGroups(ctx: Pick<GitLabContext, "groups">): Promise<GitLabGroup[]> {
  const res = await ctx.groups.listGroups({ min_access_level: AccessLevel.GUEST, order_by: "path", sort: "asc", per_page: 100 });
  return res.data.sort((a, b) => a.full_path.localeCompare(b.full_path));
}

/** Tags page with per-tag details (digest, size, created_at). Fan-out bounded to 6 concurrent calls. */
export async function listTagsWithDetails(
  ctx: Pick<GitLabContext, "registry">,
  projectId: number,
  repositoryId: number,
  page: number,
): Promise<{ page: PaginatedResponse<GitLabRegistryTag>; detailFailures: number }> {
  const res = await ctx.registry.listTags(projectId, repositoryId, { page, perPage: TAGS_PER_PAGE });
  let detailFailures = 0;
  const data = await mapLimit(res.data.slice(0, TAGS_PER_PAGE), 6, async (tag) => {
    try {
      return { ...tag, ...(await ctx.registry.getTag(projectId, repositoryId, tag.name)) };
    } catch {
      detailFailures++;
      return tag;
    }
  });
  return { page: { ...res, data }, detailFailures };
}

/** Registry host derived from the project's image prefix ("registry.example.com/group/project"). */
export function registryHostOf(project: GitLabProject): string | null {
  const prefix = project.container_registry_image_prefix;
  if (!prefix) return null;
  return prefix.split("/")[0] || null;
}

export function containerSetupSnippets(project: GitLabProject): Snippet[] {
  const prefix = project.container_registry_image_prefix;
  const host = registryHostOf(project);
  if (!prefix || !host) return [];
  return [
    {
      label: "Login",
      language: "bash",
      code: `echo "$GITLAB_TOKEN" | docker login ${host} -u <username> --password-stdin`,
    },
    {
      label: "Build & push",
      language: "bash",
      code: `docker build -t ${prefix}/<image>:<tag> .\ndocker push ${prefix}/<image>:<tag>`,
    },
  ];
}

/** Project with statistics, deduplicated per request (used by generateMetadata and the page). */
export const getRepositoryProject = cache(async (projectId: number) => {
  const { projects } = await getAuthenticatedClient();
  return projects.getProject(projectId, { statistics: true });
});

/** Container repository, deduplicated per request. */
export const getContainerRepository = cache(async (repositoryId: number) => {
  const { registry } = await getAuthenticatedClient();
  return registry.getRepository(repositoryId);
});
