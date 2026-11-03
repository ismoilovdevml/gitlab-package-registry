import "server-only";

import { buildQuery, type GitLabClient } from "./client";
import type { GitLabGroup, PaginatedResponse } from "./types";

export interface GroupSearchParams {
  page?: number;
  per_page?: number;
  search?: string;
  order_by?: "name" | "path" | "id";
  sort?: "asc" | "desc";
  top_level_only?: boolean;
  min_access_level?: number;
}

function groupQuery(params: GroupSearchParams) {
  return buildQuery({
    search: params.search,
    order_by: params.order_by,
    sort: params.sort,
    top_level_only: params.top_level_only,
    min_access_level: params.min_access_level,
  });
}

export function createGroupApi(client: GitLabClient) {
  return {
    listGroups(params: GroupSearchParams = {}): Promise<PaginatedResponse<GitLabGroup>> {
      return client.requestPaginated<GitLabGroup>(`/groups${groupQuery(params)}`, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },

    /** All top-level groups the user can see (bounded). */
    listAllTopLevelGroups(maxItems = 500): Promise<GitLabGroup[]> {
      return client.requestAll<GitLabGroup>(
        `/groups${groupQuery({ top_level_only: true, min_access_level: 10, order_by: "name", sort: "asc" })}`,
        { maxItems },
      );
    },

    getGroup(groupId: number | string): Promise<GitLabGroup> {
      return client.request<GitLabGroup>(`/groups/${encodeURIComponent(String(groupId))}?with_projects=false`);
    },

    listSubgroups(groupId: number, params: GroupSearchParams = {}): Promise<PaginatedResponse<GitLabGroup>> {
      return client.requestPaginated<GitLabGroup>(`/groups/${groupId}/subgroups${groupQuery(params)}`, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },
  };
}

export type GroupApi = ReturnType<typeof createGroupApi>;
