import "server-only";

import { buildQuery, type GitLabClient } from "./client";
import type { GitLabProject, PaginatedResponse } from "./types";

export interface ProjectSearchParams {
  page?: number;
  per_page?: number;
  search?: string;
  /** Match `search` against "group/project" paths too. */
  search_namespaces?: boolean;
  order_by?: "id" | "name" | "path" | "created_at" | "updated_at" | "last_activity_at" | "storage_size";
  sort?: "asc" | "desc";
  membership?: boolean;
  statistics?: boolean;
  min_access_level?: number;
  include_subgroups?: boolean;
  simple?: boolean;
  archived?: boolean;
}

function projectQuery(params: ProjectSearchParams) {
  return buildQuery({
    search: params.search,
    search_namespaces: params.search_namespaces,
    order_by: params.order_by,
    sort: params.sort,
    membership: params.membership,
    statistics: params.statistics,
    min_access_level: params.min_access_level,
    include_subgroups: params.include_subgroups,
    simple: params.simple,
    archived: params.archived,
  });
}

export function createProjectApi(client: GitLabClient) {
  return {
    listProjects(params: ProjectSearchParams = {}): Promise<PaginatedResponse<GitLabProject>> {
      return client.requestPaginated<GitLabProject>(`/projects${projectQuery(params)}`, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },

    listGroupProjects(groupId: number, params: ProjectSearchParams = {}): Promise<PaginatedResponse<GitLabProject>> {
      return client.requestPaginated<GitLabProject>(`/groups/${groupId}/projects${projectQuery(params)}`, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },

    /** Every project the user is a member of (bounded). */
    listAllMemberProjects(params: Omit<ProjectSearchParams, "page" | "per_page"> = {}, maxItems = 1000) {
      return client.requestAll<GitLabProject>(
        `/projects${projectQuery({ membership: true, archived: false, order_by: "last_activity_at", ...params })}`,
        { maxItems },
      );
    },

    /** `id` may be a numeric id or a full path ("group/sub/project"). */
    getProject(id: number | string, opts: { statistics?: boolean } = {}): Promise<GitLabProject> {
      return client.request<GitLabProject>(
        `/projects/${encodeURIComponent(String(id))}${buildQuery({ statistics: opts.statistics })}`,
      );
    },
  };
}

export type ProjectApi = ReturnType<typeof createProjectApi>;
