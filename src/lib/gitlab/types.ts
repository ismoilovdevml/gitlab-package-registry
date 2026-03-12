export interface GitLabVersion {
  version: string;
  revision: string;
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

export interface GitLabProject {
  id: number;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  description: string;
  avatar_url: string | null;
  web_url: string;
  namespace: {
    id: number;
    name: string;
    full_path: string;
  };
}

export type PackageType =
  | "npm"
  | "maven"
  | "pypi"
  | "docker"
  | "nuget"
  | "golang"
  | "composer"
  | "conan"
  | "helm"
  | "generic";

export interface GitLabPackage {
  id: number;
  name: string;
  version: string;
  package_type: PackageType;
  status: string;
  created_at: string;
  project_id?: number;
  _links: {
    web_path: string;
    delete_api_path?: string;
  };
  tags?: { name: string }[];
  pipeline?: {
    id: number;
    ref: string;
    sha: string;
    status: string;
  } | null;
}

export interface GitLabPackageVersion {
  id: number;
  version: string;
  created_at: string;
  pipeline?: {
    id: number;
    ref: string;
    sha: string;
  } | null;
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
}

export interface GitLabPATResponse {
  id: number;
  name: string;
  token: string;
  scopes: string[];
  expires_at: string;
  active: boolean;
}

export interface GitLabOAuthToken {
  access_token: string;
  token_type: string;
  refresh_token?: string;
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
