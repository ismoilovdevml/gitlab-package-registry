import "server-only";

import { getAuthenticatedClient } from "@/lib/dal";
import { getPackageScopes, listCatalogPackages, mapLimit } from "@/lib/gitlab/catalog";
import { PACKAGE_TYPES } from "@/lib/gitlab/formats";
import type { GitLabPackage, GitLabPackageFile, GitLabRegistryRepository, PackageType } from "@/lib/gitlab/types";
import { matchesVersion, type ChecksumAlgo, type ParsedQuery } from "./query";

/** Checksum search has no GitLab index behind it: only this many newest packages are scanned. */
export const CHECKSUM_SCAN_LIMIT = 150;
/** Container search lists repositories of at most this many top-level groups. */
export const CONTAINER_GROUP_LIMIT = 40;
const CONTAINER_PER_GROUP = 100;
const CONCURRENCY = 6;

export interface ChecksumMatch {
  pkg: GitLabPackage;
  file: GitLabPackageFile;
  algo: ChecksumAlgo;
  hash: string;
}

export interface ContainerHit {
  repo: GitLabRegistryRepository;
  projectPath: string;
}

export interface SearchOutcome {
  packages: GitLabPackage[];
  checksumMatches: ChecksumMatch[];
  containers: ContainerHit[];
  /** Package listings hit the per-scope cap somewhere. */
  truncated: boolean;
  failedScopes: string[];
  containerTruncated: boolean;
  containerFailedScopes: string[];
  /** Groups not searched for containers because of CONTAINER_GROUP_LIMIT. */
  containerSkippedGroups: number;
  /** Checksum mode: how many packages were actually scanned / failed. */
  scanned: number;
  scanFailed: number;
  packageError: unknown;
  containerError: unknown;
  /** Number of package/registry scopes searched. */
  scopeCount: number;
  /** Wall time of the GitLab fan-out. */
  elapsedMs: number;
}

function packageTypeFor(formats: string[]): PackageType | undefined {
  const pkgFormats = formats.filter((f) => (PACKAGE_TYPES as readonly string[]).includes(f));
  return pkgFormats.length === 1 && formats.length === 1 ? (pkgFormats[0] as PackageType) : undefined;
}

function inGroups(path: string | undefined, groups: string[]): boolean {
  if (!groups.length) return true;
  const p = (path ?? "").toLowerCase();
  return groups.some((g) => p === g || p.startsWith(`${g}/`));
}

function wantsPackages(q: ParsedQuery) {
  return !q.formats.length || q.formats.some((f) => f !== "container");
}

function wantsContainers(q: ParsedQuery) {
  if (q.mode === "checksum" || q.mode === "version") return false;
  return !q.formats.length || q.formats.includes("container");
}

function filterPackages(list: GitLabPackage[], q: ParsedQuery): GitLabPackage[] {
  return list.filter(
    (p) =>
      (!q.formats.length || q.formats.includes(p.package_type)) &&
      inGroups(p.project_path, q.groups) &&
      (!q.version || matchesVersion(p.version ?? "", q.version)),
  );
}

async function searchPackageNames(q: ParsedQuery) {
  const package_type = packageTypeFor(q.formats);
  const base = { package_type, package_name: q.name || undefined, order_by: "created_at" as const, sort: "desc" as const };
  let res = await listCatalogPackages(base, { perScope: 100 });
  let packages = filterPackages(res.packages, q);

  // Exact version that fell outside the fetched window: ask GitLab for it directly.
  if (!packages.length && res.truncated && q.version && (q.version.op === "prefix" || q.version.op === "=")) {
    res = await listCatalogPackages({ ...base, package_version: q.version.value }, { perScope: 100 });
    packages = filterPackages(res.packages, q);
  }
  return { packages, truncated: res.truncated, failedScopes: res.failedScopes };
}

async function searchChecksum(q: ParsedQuery) {
  const { packages: api } = await getAuthenticatedClient();
  const check = q.checksum!;
  const res = await listCatalogPackages(
    { package_type: packageTypeFor(q.formats), order_by: "created_at", sort: "desc" },
    { perScope: 50 },
  );
  const candidates = filterPackages(res.packages, q)
    .filter((p) => p.project_id)
    .slice(0, CHECKSUM_SCAN_LIMIT);

  let scanFailed = 0;
  const algos: ChecksumAlgo[] = check.algo ? [check.algo] : ["sha256", "sha1", "md5"];
  const exact = check.value.length === 32 || check.value.length === 40 || check.value.length === 64;
  const perPackage = await mapLimit(candidates, CONCURRENCY, async (pkg) => {
    try {
      const files = await api.getPackageFiles(pkg.project_id!, pkg.id);
      const hits: ChecksumMatch[] = [];
      for (const file of files) {
        for (const algo of algos) {
          const h = (algo === "sha256" ? file.file_sha256 : algo === "sha1" ? file.file_sha1 : file.file_md5)?.toLowerCase();
          if (h && (exact ? h === check.value : h.startsWith(check.value))) {
            hits.push({ pkg, file, algo, hash: h });
            break;
          }
        }
      }
      return hits;
    } catch {
      scanFailed++;
      return [];
    }
  });

  return {
    matches: perPackage.flat(),
    scanned: candidates.length,
    scanFailed,
    // The window is partial whenever more packages existed than were scanned.
    truncated: res.truncated || filterPackages(res.packages, q).filter((p) => p.project_id).length > candidates.length,
    failedScopes: res.failedScopes,
  };
}

async function searchContainers(q: ParsedQuery) {
  const { registry } = await getAuthenticatedClient();
  const scopes = (await getPackageScopes()).filter((s) => s.kind === "group" && inGroups(s.path, q.groups.map((g) => g.split("/")[0])));
  const groups = scopes.slice(0, CONTAINER_GROUP_LIMIT);
  const needle = q.name.toLowerCase();
  const failed: string[] = [];
  let truncated = false;

  const lists = await mapLimit(groups, CONCURRENCY, async (g) => {
    try {
      const res = await registry.listGroupRepositories(g.id, { perPage: CONTAINER_PER_GROUP });
      if (res.nextPage !== null) truncated = true;
      return res.data;
    } catch {
      failed.push(g.path);
      return [] as GitLabRegistryRepository[];
    }
  });

  const seen = new Set<number>();
  const hits: ContainerHit[] = [];
  for (const repo of lists.flat()) {
    if (seen.has(repo.id)) continue;
    seen.add(repo.id);
    const projectPath = repo.name && repo.path.endsWith(`/${repo.name}`) ? repo.path.slice(0, -repo.name.length - 1) : repo.path;
    if (needle && !repo.path.toLowerCase().includes(needle)) continue;
    if (!inGroups(projectPath, q.groups)) continue;
    hits.push({ repo, projectPath });
  }
  hits.sort((a, b) => new Date(b.repo.created_at).getTime() - new Date(a.repo.created_at).getTime());

  return { hits, truncated, failed, skipped: scopes.length - groups.length };
}

export async function runSearch(q: ParsedQuery): Promise<SearchOutcome> {
  const out: SearchOutcome = {
    packages: [],
    checksumMatches: [],
    containers: [],
    truncated: false,
    failedScopes: [],
    containerTruncated: false,
    containerFailedScopes: [],
    containerSkippedGroups: 0,
    scanned: 0,
    scanFailed: 0,
    packageError: null,
    containerError: null,
    scopeCount: 0,
    elapsedMs: 0,
  };
  if (q.mode === "empty") return out;
  const started = Date.now();

  const [scopes, pkgRes, ctrRes] = await Promise.allSettled([
    getPackageScopes(),
    !wantsPackages(q) ? Promise.resolve(null) : q.mode === "checksum" ? searchChecksum(q) : searchPackageNames(q),
    wantsContainers(q) ? searchContainers(q) : Promise.resolve(null),
  ]);

  if (scopes.status === "fulfilled") out.scopeCount = scopes.value.length;

  if (pkgRes.status === "rejected") out.packageError = pkgRes.reason;
  else if (pkgRes.value) {
    const v = pkgRes.value;
    out.truncated = v.truncated;
    out.failedScopes = v.failedScopes;
    if ("matches" in v) {
      out.checksumMatches = v.matches;
      out.scanned = v.scanned;
      out.scanFailed = v.scanFailed;
    } else {
      out.packages = v.packages;
    }
  }

  if (ctrRes.status === "rejected") out.containerError = ctrRes.reason;
  else if (ctrRes.value) {
    out.containers = ctrRes.value.hits;
    out.containerTruncated = ctrRes.value.truncated;
    out.containerFailedScopes = ctrRes.value.failed;
    out.containerSkippedGroups = ctrRes.value.skipped;
  }
  out.elapsedMs = Date.now() - started;
  return out;
}

/** Newest packages across all scopes, for the empty-query state. */
export async function recentPackages(limit = 8): Promise<GitLabPackage[]> {
  const res = await listCatalogPackages({ order_by: "created_at", sort: "desc" }, { perScope: 5 });
  return res.packages.slice(0, limit);
}
