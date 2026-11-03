import "server-only";

import { cache } from "react";
import { getAuthenticatedClient } from "@/lib/dal";
import type { PackageSearchParams } from "./packages";
import type { GitLabGroup, GitLabPackage, GitLabProject } from "./types";

/** Runs `fn` over `items` with at most `limit` in flight. Preserves order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export interface Scope {
  kind: "group" | "project";
  id: number;
  path: string;
}

/**
 * Where packages can live for this user: every top-level group (group package listing includes
 * subgroups) plus projects in the user's personal namespace. Cached per request.
 */
export const getPackageScopes = cache(async (): Promise<Scope[]> => {
  const { groups, client, session } = await getAuthenticatedClient();
  const [topGroups, personal] = await Promise.all([
    groups.listAllTopLevelGroups(200).catch((): GitLabGroup[] => []),
    client
      .requestAll<GitLabProject>(`/users/${session.gitlabUserId}/projects?simple=true&archived=false`, { maxItems: 200 })
      .catch((): GitLabProject[] => []),
  ]);
  return [
    ...topGroups.map((g): Scope => ({ kind: "group", id: g.id, path: g.full_path })),
    ...personal.map((p): Scope => ({ kind: "project", id: p.id, path: p.path_with_namespace })),
  ];
});

export interface CatalogResult {
  packages: GitLabPackage[];
  /** Sum of x-total across scopes (exact when GitLab returns totals). */
  total: number;
  /** True when some scope had more items than were fetched. */
  truncated: boolean;
  failedScopes: string[];
}

/**
 * Lists packages across all scopes, merged and sorted (newest first by default).
 * Fetches up to `perScope` items from each scope; use `truncated` to tell the user results are partial.
 */
export async function listCatalogPackages(
  params: Omit<PackageSearchParams, "page" | "per_page"> = {},
  { perScope = 100, concurrency = 6 }: { perScope?: number; concurrency?: number } = {},
): Promise<CatalogResult> {
  const { packages } = await getAuthenticatedClient();
  const scopes = await getPackageScopes();
  const query: PackageSearchParams = { order_by: "created_at", sort: "desc", ...params, per_page: Math.min(perScope, 100) };

  const failedScopes: string[] = [];
  const results = await mapLimit(scopes, concurrency, async (scope) => {
    try {
      const res =
        scope.kind === "group"
          ? await packages.listGroupPackages(scope.id, query)
          : await packages.listProjectPackages(scope.id, query);
      const items = res.data.map((p) => ({
        ...p,
        project_id: p.project_id ?? (scope.kind === "project" ? scope.id : undefined),
        project_path: p.project_path ?? (scope.kind === "project" ? scope.path : undefined),
      }));
      return { items, total: res.totalItems, more: res.nextPage !== null };
    } catch {
      failedScopes.push(scope.path);
      return { items: [] as GitLabPackage[], total: 0, more: false };
    }
  });

  // A package can appear in both a group listing and a personal project listing only if paths overlap; dedupe by id.
  const seen = new Set<number>();
  const merged: GitLabPackage[] = [];
  for (const r of results) {
    for (const p of r.items) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      merged.push(p);
    }
  }

  const dir = query.sort === "asc" ? 1 : -1;
  const key = query.order_by ?? "created_at";
  merged.sort((a, b) => {
    const av = key === "created_at" ? new Date(a.created_at).getTime() : String((a as unknown as Record<string, unknown>)[key === "type" ? "package_type" : key] ?? "");
    const bv = key === "created_at" ? new Date(b.created_at).getTime() : String((b as unknown as Record<string, unknown>)[key === "type" ? "package_type" : key] ?? "");
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  return {
    packages: merged,
    total: results.reduce((s, r) => s + r.total, 0),
    truncated: results.some((r) => r.more),
    failedScopes,
  };
}
