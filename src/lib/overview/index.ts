import "server-only";

import { cache } from "react";
import { getAuthenticatedClient } from "@/lib/dal";
import { getPackageScopes, mapLimit, type Scope } from "@/lib/gitlab/catalog";
import type { PackageSearchParams } from "@/lib/gitlab/packages";
import type { GitLabPackage, GitLabProject, GitLabVersion, PaginatedResponse } from "@/lib/gitlab/types";
import { rangeWindow, type RangeKey } from "./range";

export * from "./range";

const PER_PAGE = 100;
/** Max pages per scope when walking back to the start of the selected range. */
const MAX_PAGES_PER_SCOPE = 5;
/** Member projects scanned for storage statistics. */
const MAX_STAT_PROJECTS = 300;
const CONCURRENCY = 6;

export interface PackageActivityData {
  /** Every package fetched, newest first: at least the newest 100 per scope, plus older pages back to the range start. */
  packages: GitLabPackage[];
  /** Sum of x-total across scopes. */
  total: number;
  /** True when GitLab omitted x-total somewhere, so `total` is a lower bound. */
  totalIsLowerBound: boolean;
  /** True when some scope has packages that were not fetched (the format breakdown is a sample). */
  truncated: boolean;
  /** True when some scope hit the page cap while still inside the range (range counts are lower bounds). */
  rangeIncomplete: boolean;
  failedScopes: string[];
  groupCount: number;
  personalProjectCount: number;
  now: number;
}

interface ScopeResult {
  items: GitLabPackage[];
  total: number;
  totalKnown: boolean;
  more: boolean;
  rangeIncomplete: boolean;
}

async function fetchScope(scope: Scope, rangeStart: number): Promise<ScopeResult> {
  const { packages } = await getAuthenticatedClient();
  const items: GitLabPackage[] = [];
  let total = 0;
  let totalKnown = true;
  let page: number | null = 1;
  let pages = 0;

  while (page && pages < MAX_PAGES_PER_SCOPE) {
    const query: PackageSearchParams = { order_by: "created_at", sort: "desc", per_page: PER_PAGE, page };
    const res: PaginatedResponse<GitLabPackage> =
      scope.kind === "group" ? await packages.listGroupPackages(scope.id, query) : await packages.listProjectPackages(scope.id, query);
    if (pages === 0) {
      total = res.totalItems;
      // requestPaginated falls back to data.length when GitLab omits x-total on huge collections.
      totalKnown = !(res.nextPage !== null && res.totalItems === res.data.length);
    }
    pages++;
    for (const p of res.data) {
      items.push({
        ...p,
        project_id: p.project_id ?? (scope.kind === "project" ? scope.id : undefined),
        project_path: p.project_path ?? (scope.kind === "project" ? scope.path : undefined),
      });
    }
    page = res.nextPage;
    const oldest = res.data.at(-1);
    if (!oldest || new Date(oldest.created_at).getTime() < rangeStart) break;
  }

  const more = page !== null;
  const oldest = items.at(-1);
  const rangeIncomplete = more && !!oldest && new Date(oldest.created_at).getTime() >= rangeStart;
  return { items, total, totalKnown, more, rangeIncomplete };
}

/**
 * Packages across every scope the user can see (top-level groups incl. subgroups + personal projects),
 * walking back far enough to cover the selected range (bounded by MAX_PAGES_PER_SCOPE).
 */
export const getPackageActivity = cache(async (range: RangeKey): Promise<PackageActivityData> => {
  const now = Date.now();
  const { start } = rangeWindow(range, now);
  const scopes = await getPackageScopes();

  const failedScopes: string[] = [];
  const results = await mapLimit(scopes, CONCURRENCY, async (scope) => {
    try {
      return await fetchScope(scope, start);
    } catch {
      failedScopes.push(scope.path);
      return null;
    }
  });

  if (scopes.length > 0 && failedScopes.length === scopes.length) {
    throw new Error(`GitLab package listing failed for all ${scopes.length} groups/projects.`);
  }

  const seen = new Set<number>();
  const merged: GitLabPackage[] = [];
  for (const r of results) {
    for (const p of r?.items ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      merged.push(p);
    }
  }
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const ok = results.filter((r): r is ScopeResult => r !== null);
  return {
    packages: merged,
    total: ok.reduce((s, r) => s + r.total, 0),
    totalIsLowerBound: ok.some((r) => !r.totalKnown),
    truncated: ok.some((r) => r.more),
    rangeIncomplete: ok.some((r) => r.rangeIncomplete),
    failedScopes,
    groupCount: scopes.filter((s) => s.kind === "group").length,
    personalProjectCount: scopes.filter((s) => s.kind === "project").length,
    now,
  };
});

export interface ProjectStorage {
  id: number;
  path: string;
  packagesSize: number;
  registrySize: number;
}

export interface StorageSummary {
  packagesBytes: number;
  registryBytes: number;
  /** Member projects reported by GitLab (x-total); may be a lower bound on huge instances. */
  projectsTotal: number;
  projectsTotalIsLowerBound: boolean;
  /** Projects actually scanned (most recently active first, capped). */
  projectsScanned: number;
  /** Scanned projects where GitLab returned statistics (needs Reporter+). */
  projectsWithStats: number;
  /** Projects with any package or container storage. */
  projectsWithPackages: number;
  largest: ProjectStorage[];
}

/** Storage from project statistics of the user's member projects (bounded to MAX_STAT_PROJECTS). */
export const getStorageSummary = cache(async (): Promise<StorageSummary> => {
  const { projects } = await getAuthenticatedClient();
  const all: GitLabProject[] = [];
  let projectsTotal = 0;
  let totalKnown = true;
  let page: number | null = 1;

  while (page && all.length < MAX_STAT_PROJECTS) {
    const res = await projects.listProjects({
      membership: true,
      statistics: true,
      order_by: "last_activity_at",
      sort: "desc",
      per_page: PER_PAGE,
      page,
    });
    if (page === 1) {
      projectsTotal = res.totalItems;
      totalKnown = !(res.nextPage !== null && res.totalItems === res.data.length);
    }
    all.push(...res.data);
    page = res.nextPage;
  }

  const scanned = all.slice(0, MAX_STAT_PROJECTS);
  const withStats = scanned.filter((p) => p.statistics);
  const rows: ProjectStorage[] = withStats.map((p) => ({
    id: p.id,
    path: p.path_with_namespace,
    packagesSize: p.statistics?.packages_size ?? 0,
    registrySize: p.statistics?.container_registry_size ?? 0,
  }));
  const nonEmpty = rows.filter((r) => r.packagesSize + r.registrySize > 0);

  return {
    packagesBytes: rows.reduce((s, r) => s + r.packagesSize, 0),
    registryBytes: rows.reduce((s, r) => s + r.registrySize, 0),
    projectsTotal: Math.max(projectsTotal, scanned.length),
    projectsTotalIsLowerBound: !totalKnown,
    projectsScanned: scanned.length,
    projectsWithStats: withStats.length,
    projectsWithPackages: nonEmpty.length,
    largest: nonEmpty.sort((a, b) => b.packagesSize + b.registrySize - (a.packagesSize + a.registrySize)).slice(0, 5),
  };
});

export const getGitLabVersion = cache(async (): Promise<GitLabVersion> => {
  const { client } = await getAuthenticatedClient();
  return client.getVersion();
});
