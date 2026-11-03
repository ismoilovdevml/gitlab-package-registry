export interface GitLabVersion {
  version: string;
  revision: string;
  enterprise?: boolean;
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  email: string;
  avatar_url: string;
  web_url: string;
  is_admin?: boolean;
  state: string;
}

export interface GitLabGroup {
  id: number;
  name: string;
  full_name: string;
  full_path: string;
  description: string;
  avatar_url: string | null;
  web_url: string;
  parent_id: number | null;
}

export interface GitLabProjectStatistics {
  commit_count?: number;
  storage_size: number;
  repository_size: number;
  lfs_objects_size: number;
  job_artifacts_size: number;
  packages_size: number;
  container_registry_size?: number;
  wiki_size?: number;
  snippets_size?: number;
  uploads_size?: number;
  pipeline_artifacts_size?: number;
}

export interface GitLabProject {
  id: number;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  description: string | null;
  avatar_url: string | null;
  web_url: string;
  visibility?: "private" | "internal" | "public";
  last_activity_at?: string;
  packages_enabled?: boolean;
  container_registry_enabled?: boolean;
  container_registry_image_prefix?: string;
  namespace: {
    id: number;
    name: string;
    path?: string;
    kind?: "group" | "user";
    full_path: string;
  };
  statistics?: GitLabProjectStatistics;
  permissions?: {
    project_access: { access_level: number } | null;
    group_access: { access_level: number } | null;
  };
}

export type PackageType =
  | "npm"
  | "maven"
  | "pypi"
  | "nuget"
  | "golang"
  | "composer"
  | "conan"
  | "helm"
  | "generic"
  | "debian"
  | "rubygems"
  | "terraform_module"
  | "ml_model";

export interface GitLabPipelineRef {
  id: number;
  iid?: number;
  project_id?: number;
  ref: string;
  sha: string;
  status: string;
  source?: string;
  created_at?: string;
  web_url?: string;
  user?: { id: number; username: string; name: string; avatar_url: string } | null;
}

export interface GitLabPackage {
  id: number;
  name: string;
  version: string;
  package_type: PackageType;
  status: "default" | "hidden" | "processing" | "error" | "pending_destruction" | string;
  created_at: string;
  last_downloaded_at?: string | null;
  conan_package_name?: string;
  project_id?: number;
  project_path?: string; // present on group-level listings
  _links: {
    web_path: string;
    delete_api_path?: string;
  };
  tags?: { id?: number; name: string }[];
  pipeline?: GitLabPipelineRef | null;
  pipelines?: GitLabPipelineRef[];
  versions?: GitLabPackageVersion[];
}

export interface GitLabPackageVersion {
  id: number;
  version: string;
  created_at: string;
  tags?: { name: string }[];
  pipeline?: GitLabPipelineRef | null;
}

export interface GitLabPackageFile {
  id: number;
  package_id: number;
  file_name: string;
  size: number;
  file_md5: string | null;
  file_sha1: string | null;
  file_sha256: string | null;
  created_at: string;
  pipelines?: GitLabPipelineRef[];
}

export interface GitLabRegistryRepository {
  id: number;
  name: string;
  path: string;
  project_id: number;
  location: string;
  created_at: string;
  cleanup_policy_started_at?: string | null;
  tags_count?: number;
  size?: number | null;
  status?: string | null;
  tags?: GitLabRegistryTag[];
}

export interface GitLabRegistryTag {
  name: string;
  path: string;
  location: string;
  revision?: string;
  short_revision?: string;
  digest?: string;
  created_at?: string;
  total_size?: number;
}

export interface GitLabOAuthToken {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in?: number;
  scope: string;
  created_at: number;
}

export interface PaginationParams {
  page?: number;
  per_page?: number;
  pagination?: "keyset";
  order_by?: string;
  sort?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  totalPages: number;
  totalItems: number;
  currentPage: number;
  nextPage: number | null;
}

/** GitLab access levels. */
export const AccessLevel = {
  NONE: 0,
  MINIMAL: 5,
  GUEST: 10,
  PLANNER: 15,
  REPORTER: 20,
  DEVELOPER: 30,
  MAINTAINER: 40,
  OWNER: 50,
} as const;
