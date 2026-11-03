import "server-only";

import { buildQuery, type GitLabClient } from "./client";
import type {
  GitLabPackage,
  GitLabPackageFile,
  GitLabPipelineRef,
  PackageType,
  PaginatedResponse,
} from "./types";

export interface PackageSearchParams {
  page?: number;
  per_page?: number;
  sort?: "asc" | "desc";
  order_by?: "name" | "version" | "created_at" | "type" | "project_path";
  package_type?: PackageType;
  package_name?: string;
  package_version?: string;
  include_versionless?: boolean;
  status?: "default" | "hidden" | "processing" | "error" | "pending_destruction";
}

function packageQuery(params: PackageSearchParams) {
  return buildQuery({
    package_type: params.package_type,
    package_name: params.package_name,
    package_version: params.package_version,
    include_versionless: params.include_versionless,
    status: params.status,
    order_by: params.order_by,
    sort: params.sort,
  });
}

export function createPackageApi(client: GitLabClient) {
  return {
    listProjectPackages(projectId: number, params: PackageSearchParams = {}): Promise<PaginatedResponse<GitLabPackage>> {
      return client.requestPaginated<GitLabPackage>(`/projects/${projectId}/packages${packageQuery(params)}`, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },

    /** Includes subgroups. Items carry project_id and project_path. */
    listGroupPackages(groupId: number, params: PackageSearchParams = {}): Promise<PaginatedResponse<GitLabPackage>> {
      return client.requestPaginated<GitLabPackage>(`/groups/${groupId}/packages${packageQuery(params)}`, {
        page: params.page || 1,
        per_page: params.per_page || 20,
      });
    },

    /** All versions with the given exact name (and type) in a project, newest first. */
    async listPackageVersions(projectId: number, name: string, packageType?: PackageType): Promise<GitLabPackage[]> {
      const all = await client.requestAll<GitLabPackage>(
        `/projects/${projectId}/packages${packageQuery({
          package_name: name,
          package_type: packageType,
          order_by: "created_at",
          sort: "desc",
        })}`,
        { maxItems: 500 },
      );
      // package_name is a fuzzy match; keep exact names only.
      return all.filter((p) => p.name === name);
    },

    getPackage(projectId: number, packageId: number): Promise<GitLabPackage> {
      return client.request<GitLabPackage>(`/projects/${projectId}/packages/${packageId}`);
    },

    getPackageFiles(projectId: number, packageId: number): Promise<GitLabPackageFile[]> {
      return client.requestAll<GitLabPackageFile>(`/projects/${projectId}/packages/${packageId}/package_files`, {
        maxItems: 500,
      });
    },

    getPackagePipelines(projectId: number, packageId: number): Promise<GitLabPipelineRef[]> {
      // This endpoint is keyset-paginated and rejects per_page > 20.
      return client.requestAll<GitLabPipelineRef>(`/projects/${projectId}/packages/${packageId}/pipelines`, {
        perPage: 20,
        maxItems: 100,
      });
    },

    deletePackage(projectId: number, packageId: number): Promise<void> {
      return client.request(`/projects/${projectId}/packages/${packageId}`, { method: "DELETE" });
    },

    deletePackageFile(projectId: number, packageId: number, fileId: number): Promise<void> {
      return client.request(`/projects/${projectId}/packages/${packageId}/package_files/${fileId}`, {
        method: "DELETE",
      });
    },

    /** Direct download URL of a package file through the GitLab web UI (requires a GitLab browser session). */
    fileWebUrl(projectPath: string, fileId: number): string {
      return `${client.webUrl}/${projectPath}/-/package_files/${fileId}/download`;
    },
  };
}

export type PackageApi = ReturnType<typeof createPackageApi>;
