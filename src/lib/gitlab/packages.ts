import "server-only";

import { createGitLabClient } from "./client";
import type {
  GitLabPackage,
  GitLabPackageFile,
  PackageType,
  PaginatedResponse,
} from "./types";

export interface PackageSearchParams {
  page?: number;
  per_page?: number;
  sort?: "asc" | "desc";
  order_by?: "name" | "version" | "created_at" | "type";
  package_type?: PackageType;
  package_name?: string;
}

export function createPackageApi(client: ReturnType<typeof createGitLabClient>) {
  return {
    async listProjectPackages(
      projectId: number,
      params: PackageSearchParams = {},
    ): Promise<PaginatedResponse<GitLabPackage>> {
      const searchParams = new URLSearchParams();
      if (params.package_type) searchParams.set("package_type", params.package_type);
      if (params.package_name) searchParams.set("package_name", params.package_name);
      if (params.order_by) searchParams.set("order_by", params.order_by);
      if (params.sort) searchParams.set("sort", params.sort);

      const query = searchParams.toString();
      const path = `/projects/${projectId}/packages${query ? `?${query}` : ""}`;

      return client.requestPaginated<GitLabPackage>(path, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },

    async listGroupPackages(
      groupId: number,
      params: PackageSearchParams = {},
    ): Promise<PaginatedResponse<GitLabPackage>> {
      const searchParams = new URLSearchParams();
      if (params.package_type) searchParams.set("package_type", params.package_type);
      if (params.package_name) searchParams.set("package_name", params.package_name);
      if (params.order_by) searchParams.set("order_by", params.order_by);
      if (params.sort) searchParams.set("sort", params.sort);

      const query = searchParams.toString();
      const path = `/groups/${groupId}/packages${query ? `?${query}` : ""}`;

      return client.requestPaginated<GitLabPackage>(path, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },

    async getPackage(
      projectId: number,
      packageId: number,
    ): Promise<GitLabPackage> {
      return client.request<GitLabPackage>(
        `/projects/${projectId}/packages/${packageId}`,
      );
    },

    async getPackageFiles(
      projectId: number,
      packageId: number,
    ): Promise<GitLabPackageFile[]> {
      return client.request<GitLabPackageFile[]>(
        `/projects/${projectId}/packages/${packageId}/package_files`,
      );
    },

    async deletePackage(projectId: number, packageId: number): Promise<void> {
      return client.request(`/projects/${projectId}/packages/${packageId}`, {
        method: "DELETE",
      });
    },

    async deletePackageFile(
      projectId: number,
      packageId: number,
      fileId: number,
    ): Promise<void> {
      return client.request(
        `/projects/${projectId}/packages/${packageId}/package_files/${fileId}`,
        { method: "DELETE" },
      );
    },
  };
}
