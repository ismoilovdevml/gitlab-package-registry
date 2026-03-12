import "server-only";

import { handleGitLabError } from "./errors";
import type {
  GitLabVersion,
  GitLabUser,
  PaginatedResponse,
  PaginationParams,
} from "./types";

interface GitLabClientOptions {
  baseUrl: string;
  pat: string;
}

export function createGitLabClient({ baseUrl, pat }: GitLabClientOptions) {
  const apiUrl = `${baseUrl.replace(/\/$/, "")}/api/v4`;

  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${apiUrl}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options.headers as Record<string, string>,
    };
    if (pat) headers["PRIVATE-TOKEN"] = pat;

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      handleGitLabError(res.status, body);
    }

    if (res.status === 204) return undefined as T;

    return res.json();
  }

  async function requestPaginated<T>(
    path: string,
    params: PaginationParams = {},
  ): Promise<PaginatedResponse<T>> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.per_page) searchParams.set("per_page", String(params.per_page));
    if (params.pagination) searchParams.set("pagination", params.pagination);
    if (params.order_by) searchParams.set("order_by", params.order_by);
    if (params.sort) searchParams.set("sort", params.sort);

    const separator = path.includes("?") ? "&" : "?";
    const url = `${apiUrl}${path}${separator}${searchParams.toString()}`;

    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "PRIVATE-TOKEN": pat,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      handleGitLabError(res.status, body);
    }

    const data = await res.json();
    const totalPages = parseInt(res.headers.get("x-total-pages") || "1", 10);
    const totalItems = parseInt(res.headers.get("x-total") || "0", 10);
    const currentPage = parseInt(res.headers.get("x-page") || "1", 10);
    const nextPage = parseInt(res.headers.get("x-next-page") || "0", 10) || null;

    return { data, totalPages, totalItems, currentPage, nextPage };
  }

  return {
    request,
    requestPaginated,

    async getVersion(): Promise<GitLabVersion> {
      return request<GitLabVersion>("/version");
    },

    async getCurrentUser() {
      return request<GitLabUser>("/user");
    },

    async testConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
      try {
        // Try /version with auth first (if PAT available)
        const url = `${apiUrl}/version`;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (pat) headers["PRIVATE-TOKEN"] = pat;

        const res = await fetch(url, { headers });

        if (res.ok) {
          const data = await res.json() as GitLabVersion;
          return { ok: true, version: data.version };
        }

        // 401 means GitLab is reachable but requires auth for /version
        // This is normal for self-hosted instances with restricted public access
        if (res.status === 401 || res.status === 403) {
          return { ok: true, version: "unknown (auth required)" };
        }

        return { ok: false, error: `GitLab responded with ${res.status}` };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Connection failed",
        };
      }
    },
  };
}

export type GitLabClient = ReturnType<typeof createGitLabClient>;
