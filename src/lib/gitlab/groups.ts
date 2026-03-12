import "server-only";

import { createGitLabClient } from "./client";
import type { GitLabGroup, PaginatedResponse } from "./types";

export interface GroupSearchParams {
  page?: number;
  per_page?: number;
  search?: string;
  order_by?: "name" | "path" | "id";
  sort?: "asc" | "desc";
  top_level_only?: boolean;
}

export function createGroupApi(client: ReturnType<typeof createGitLabClient>) {
  return {
    async listGroups(
      params: GroupSearchParams = {},
    ): Promise<PaginatedResponse<GitLabGroup>> {
      const searchParams = new URLSearchParams();
      if (params.search) searchParams.set("search", params.search);
      if (params.order_by) searchParams.set("order_by", params.order_by);
      if (params.sort) searchParams.set("sort", params.sort);
      if (params.top_level_only) searchParams.set("top_level_only", "true");

      const query = searchParams.toString();
      const path = `/groups${query ? `?${query}` : ""}`;

      return client.requestPaginated<GitLabGroup>(path, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },

    async getGroup(groupId: number): Promise<GitLabGroup> {
      return client.request<GitLabGroup>(`/groups/${groupId}`);
    },

    async listSubgroups(
      groupId: number,
      params: GroupSearchParams = {},
    ): Promise<PaginatedResponse<GitLabGroup>> {
      const searchParams = new URLSearchParams();
      if (params.search) searchParams.set("search", params.search);
      if (params.order_by) searchParams.set("order_by", params.order_by);
      if (params.sort) searchParams.set("sort", params.sort);

      const query = searchParams.toString();
      const path = `/groups/${groupId}/subgroups${query ? `?${query}` : ""}`;

      return client.requestPaginated<GitLabGroup>(path, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },
  };
}
