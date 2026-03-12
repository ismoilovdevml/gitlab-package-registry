import "server-only";

import { createGitLabClient } from "./client";
import type { GitLabProject, PaginatedResponse } from "./types";

export interface ProjectSearchParams {
  page?: number;
  per_page?: number;
  search?: string;
  order_by?: "id" | "name" | "path" | "created_at" | "updated_at" | "last_activity_at";
  sort?: "asc" | "desc";
  with_packages_enabled?: boolean;
}

export function createProjectApi(client: ReturnType<typeof createGitLabClient>) {
  return {
    async listProjects(
      params: ProjectSearchParams = {},
    ): Promise<PaginatedResponse<GitLabProject>> {
      const searchParams = new URLSearchParams();
      if (params.search) searchParams.set("search", params.search);
      if (params.order_by) searchParams.set("order_by", params.order_by);
      if (params.sort) searchParams.set("sort", params.sort);

      const query = searchParams.toString();
      const path = `/projects${query ? `?${query}` : ""}`;

      return client.requestPaginated<GitLabProject>(path, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },

    async listGroupProjects(
      groupId: number,
      params: ProjectSearchParams = {},
    ): Promise<PaginatedResponse<GitLabProject>> {
      const searchParams = new URLSearchParams();
      if (params.search) searchParams.set("search", params.search);
      if (params.order_by) searchParams.set("order_by", params.order_by);
      if (params.sort) searchParams.set("sort", params.sort);

      const query = searchParams.toString();
      const path = `/groups/${groupId}/projects${query ? `?${query}` : ""}`;

      return client.requestPaginated<GitLabProject>(path, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },

    async getProject(projectId: number): Promise<GitLabProject> {
      return client.request<GitLabProject>(`/projects/${projectId}`);
    },
  };
}
