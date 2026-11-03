import "server-only";

import { buildQuery, type GitLabClient } from "./client";
import type { GitLabRegistryRepository, GitLabRegistryTag, PaginatedResponse } from "./types";

/** GitLab container registry API (Docker / OCI images). */
export function createRegistryApi(client: GitLabClient) {
  return {
    listProjectRepositories(projectId: number, opts: { tagsCount?: boolean; page?: number; perPage?: number } = {}) {
      return client.requestPaginated<GitLabRegistryRepository>(
        `/projects/${projectId}/registry/repositories${buildQuery({ tags_count: opts.tagsCount ?? true })}`,
        { page: opts.page || 1, per_page: opts.perPage || 50 },
      );
    },

    listGroupRepositories(groupId: number, opts: { page?: number; perPage?: number } = {}) {
      return client.requestPaginated<GitLabRegistryRepository>(`/groups/${groupId}/registry/repositories`, {
        page: opts.page || 1,
        per_page: opts.perPage || 50,
      });
    },

    /** Single repository (includes `size` when the registry supports it). */
    getRepository(repositoryId: number) {
      return client.request<GitLabRegistryRepository>(
        `/registry/repositories/${repositoryId}${buildQuery({ tags: false, tags_count: true, size: true })}`,
      );
    },

    listTags(projectId: number, repositoryId: number, opts: { page?: number; perPage?: number } = {}): Promise<PaginatedResponse<GitLabRegistryTag>> {
      return client.requestPaginated<GitLabRegistryTag>(
        `/projects/${projectId}/registry/repositories/${repositoryId}/tags`,
        { page: opts.page || 1, per_page: opts.perPage || 50 },
      );
    },

    getTag(projectId: number, repositoryId: number, tagName: string) {
      return client.request<GitLabRegistryTag>(
        `/projects/${projectId}/registry/repositories/${repositoryId}/tags/${encodeURIComponent(tagName)}`,
      );
    },

    deleteTag(projectId: number, repositoryId: number, tagName: string): Promise<void> {
      return client.request(
        `/projects/${projectId}/registry/repositories/${repositoryId}/tags/${encodeURIComponent(tagName)}`,
        { method: "DELETE" },
      );
    },

    deleteRepository(projectId: number, repositoryId: number): Promise<void> {
      return client.request(`/projects/${projectId}/registry/repositories/${repositoryId}`, { method: "DELETE" });
    },

    /** Bulk tag delete by regex (runs asynchronously in GitLab). */
    bulkDeleteTags(
      projectId: number,
      repositoryId: number,
      opts: { nameRegexDelete: string; nameRegexKeep?: string; keepN?: number; olderThan?: string },
    ): Promise<void> {
      return client.request(`/projects/${projectId}/registry/repositories/${repositoryId}/tags`, {
        method: "DELETE",
        body: JSON.stringify({
          name_regex_delete: opts.nameRegexDelete,
          name_regex_keep: opts.nameRegexKeep,
          keep_n: opts.keepN,
          older_than: opts.olderThan,
        }),
      });
    },
  };
}

export type RegistryApi = ReturnType<typeof createRegistryApi>;
