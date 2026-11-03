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
  /** OAuth access token (sent as Bearer). Empty for unauthenticated calls. */
  token: string;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function buildQuery(query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function createGitLabClient({ baseUrl, token }: GitLabClientOptions) {
  const webUrl = baseUrl.replace(/\/+$/, "");
  const apiUrl = `${webUrl}/api/v4`;

  function authHeaders(): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /** Low-level fetch against /api/v4. Throws typed GitLabApiError on non-2xx. */
  async function raw(path: string, options: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${apiUrl}${path}`, {
      cache: "no-store",
      ...options,
      headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      handleGitLabError(res.status, body, res.headers.get("retry-after"));
    }
    return res;
  }

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const isJsonBody = options.body !== undefined && typeof options.body === "string";
    const res = await raw(path, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(options.headers as Record<string, string>),
      },
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async function requestPaginated<T>(
    path: string,
    params: PaginationParams = {},
  ): Promise<PaginatedResponse<T>> {
    const separator = path.includes("?") ? "&" : "?";
    const qs = buildQuery({
      page: params.page,
      per_page: params.per_page,
      pagination: params.pagination,
      order_by: params.order_by,
      sort: params.sort,
    }).slice(1);
    const res = await raw(`${path}${qs ? separator + qs : ""}`, {
      headers: { Accept: "application/json" },
    });

    const data = (await res.json()) as T[];
    // GitLab omits x-total / x-total-pages for large collections (>10k), so fall back gracefully.
    const totalHeader = res.headers.get("x-total");
    const totalPagesHeader = res.headers.get("x-total-pages");
    const currentPage = parseInt(res.headers.get("x-page") || String(params.page || 1), 10);
    const nextPage = parseInt(res.headers.get("x-next-page") || "0", 10) || null;
    const totalItems = totalHeader ? parseInt(totalHeader, 10) : data.length;
    const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : nextPage ? currentPage + 1 : currentPage;

    return { data, totalPages, totalItems, currentPage, nextPage };
  }

  /** Follows x-next-page until exhausted or maxItems reached. */
  async function requestAll<T>(path: string, { perPage = 100, maxItems = 1000 } = {}): Promise<T[]> {
    const out: T[] = [];
    let page: number | null = 1;
    while (page && out.length < maxItems) {
      const res: PaginatedResponse<T> = await requestPaginated<T>(path, { page, per_page: perPage });
      out.push(...res.data);
      page = res.nextPage;
    }
    return out.slice(0, maxItems);
  }

  return {
    webUrl,
    apiUrl,
    raw,
    request,
    requestPaginated,
    requestAll,

    getVersion(): Promise<GitLabVersion> {
      return request<GitLabVersion>("/version");
    },

    getCurrentUser() {
      return request<GitLabUser>("/user");
    },

    async testConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
      try {
        const res = await fetch(`${apiUrl}/version`, { headers: authHeaders(), cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as GitLabVersion;
          return { ok: true, version: data.version };
        }
        // 401/403: reachable, but /version needs auth on this instance.
        if (res.status === 401 || res.status === 403) {
          return { ok: true, version: "unknown (auth required)" };
        }
        return { ok: false, error: `GitLab responded with HTTP ${res.status}` };
      } catch (e) {
        const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
        const code = cause?.code || "";
        if (code.includes("CERT") || code === "SELF_SIGNED_CERT_IN_CHAIN" || code === "DEPTH_ZERO_SELF_SIGNED_CERT") {
          return {
            ok: false,
            error: `TLS certificate is not trusted (${code}). Mount your CA and set NODE_EXTRA_CA_CERTS.`,
          };
        }
        return {
          ok: false,
          error: cause?.message || (e instanceof Error ? e.message : "Connection failed"),
        };
      }
    },
  };
}

export type GitLabClient = ReturnType<typeof createGitLabClient>;
