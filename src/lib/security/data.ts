import "server-only";

import { cache } from "react";
import { getAuthenticatedClient } from "@/lib/dal";
import { listCatalogPackages, mapLimit } from "@/lib/gitlab/catalog";
import { GitLabApiError } from "@/lib/gitlab/errors";
import { accessLevelOf } from "@/lib/gitlab/permissions";
import { AccessLevel, type GitLabPackage, type GitLabPackageFile, type GitLabProject } from "@/lib/gitlab/types";
import { isActivePackage, runChecks, summarize, type Finding, type FindingSummary, type PackageFiles } from "./checks";
import type { GitLabDependency, GitLabVulnerability } from "./vulnerabilities";

/** Newest packages fetched per group/personal-project scope (default + error statuses). */
export const SAMPLE_PER_SCOPE = 100;
/** Extra per-scope sweep for statuses GitLab hides from the default listing. */
const STATUS_PER_SCOPE = 20;
/** Projects whose visibility/permissions are looked up (most packages first). */
export const PROJECT_LOOKUP_LIMIT = 50;
/** Newest active packages whose files are checked for checksums. */
export const CHECKSUM_SCAN_LIMIT = 60;
/** Projects queried for GitLab vulnerability/dependency data. */
export const VULN_PROJECT_LIMIT = 5;

export interface HygieneReport {
  packages: GitLabPackage[];
  /** Sum of package totals GitLab reported across scopes (default listing). */
  catalogTotal: number;
  truncated: boolean;
  failedScopes: string[];
  /** Projects with packages in the sample, most packages first. */
  projectIds: number[];
  projects: Map<number, GitLabProject>;
  projectLookups: { attempted: number; failed: number; skipped: number };
  checksumScan: { attempted: number; failed: number };
  findings: Finding[];
  summary: FindingSummary;
  generatedAt: number;
}

function packageCountsByProject(packages: GitLabPackage[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const p of packages) {
    if (p.project_id !== undefined) counts.set(p.project_id, (counts.get(p.project_id) ?? 0) + 1);
  }
  return counts;
}

export const loadHygieneReport = cache(async (): Promise<HygieneReport> => {
  const { client, projects } = await getAuthenticatedClient();
  const now = Date.now();

  const main = await listCatalogPackages({}, { perScope: SAMPLE_PER_SCOPE, concurrency: 6 });
  // GitLab's default listing returns only "default" and "error" packages, so sweep the rest explicitly.
  const extra = await Promise.all(
    (["processing", "pending_destruction"] as const).map((status) =>
      listCatalogPackages({ status }, { perScope: STATUS_PER_SCOPE, concurrency: 3 }).catch(() => null),
    ),
  );

  const seen = new Set<number>();
  const packages: GitLabPackage[] = [];
  for (const p of [...main.packages, ...extra.flatMap((r) => r?.packages ?? [])]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    packages.push(p);
  }
  const failedScopes = [...new Set([...main.failedScopes, ...extra.flatMap((r) => r?.failedScopes ?? [])])];

  const counts = packageCountsByProject(packages);
  const projectIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const lookupIds = projectIds.slice(0, PROJECT_LOOKUP_LIMIT);

  const scanTargets = packages
    .filter((p) => isActivePackage(p) && p.project_id !== undefined)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, CHECKSUM_SCAN_LIMIT);

  let projectFailures = 0;
  let checksumFailures = 0;
  const [projectList, scanned] = await Promise.all([
    mapLimit(lookupIds, 3, async (id) => {
      try {
        return await projects.getProject(id);
      } catch {
        projectFailures++;
        return null;
      }
    }),
    mapLimit(scanTargets, 3, async (pkg): Promise<PackageFiles | null> => {
      try {
        // One page (100 files) is plenty for a hygiene signal and keeps the scan bounded.
        const res = await client.requestPaginated<GitLabPackageFile>(
          `/projects/${pkg.project_id}/packages/${pkg.id}/package_files`,
          { page: 1, per_page: 100 },
        );
        return { pkg, files: res.data };
      } catch {
        checksumFailures++;
        return null;
      }
    }),
  ]);

  const projectMap = new Map<number, GitLabProject>();
  for (const p of projectList) if (p) projectMap.set(p.id, p);
  const checksumScan = scanned.filter((s): s is PackageFiles => s !== null);

  const findings = runChecks({ packages, projects: projectMap, checksumScan, now });
  return {
    packages,
    catalogTotal: main.total,
    truncated: main.truncated || extra.some((r) => r?.truncated),
    failedScopes,
    projectIds,
    projects: projectMap,
    projectLookups: {
      attempted: lookupIds.length,
      failed: projectFailures,
      skipped: projectIds.length - lookupIds.length,
    },
    checksumScan: { attempted: scanTargets.length, failed: checksumFailures },
    findings,
    summary: summarize(findings, packages),
    generatedAt: now,
  };
});

export interface ProjectVulnerabilities {
  project: GitLabProject;
  packageCount: number;
  vulnerabilities: GitLabVulnerability[];
  vulnerabilitiesTotal: number;
  vulnerabilitiesError: string | null;
  dependencies: GitLabDependency[];
  dependenciesTotal: number;
  dependenciesError: string | null;
}

export type VulnerabilityReport =
  | { status: "no-projects"; edition: string | null }
  | {
      status: "unavailable";
      edition: string | null;
      /** HTTP status of the probe (403 = not licensed or role too low, 404 = endpoint absent, i.e. CE). */
      probeStatus: number;
      probeProject: GitLabProject;
    }
  | { status: "available"; edition: string | null; projects: ProjectVulnerabilities[]; projectsWithPackages: number };

function apiErrorText(e: unknown): string {
  if (e instanceof GitLabApiError) return `${e.status}: ${e.message}`;
  return e instanceof Error ? e.message : "Request failed";
}

export const loadVulnerabilityReport = cache(async (): Promise<VulnerabilityReport> => {
  const { client } = await getAuthenticatedClient();
  const report = await loadHygieneReport();

  const edition = await client
    .getVersion()
    .then((v) => `GitLab ${v.version} ${v.enterprise ? "Enterprise Edition" : "Community Edition"}`)
    .catch(() => null);

  const counts = packageCountsByProject(report.packages);
  const candidates = report.projectIds
    .map((id) => report.projects.get(id))
    .filter((p): p is GitLabProject => Boolean(p));
  if (candidates.length === 0) return { status: "no-projects", edition };

  // Probe where the user's role is highest: the vulnerability report needs Developer+.
  const probeProject = [...candidates].sort((a, b) => accessLevelOf(b) - accessLevelOf(a))[0];
  try {
    await client.requestPaginated<GitLabVulnerability>(`/projects/${probeProject.id}/vulnerabilities`, { page: 1, per_page: 1 });
  } catch (e) {
    if (e instanceof GitLabApiError && (e.status === 403 || e.status === 404)) {
      return { status: "unavailable", edition, probeStatus: e.status, probeProject };
    }
    throw e;
  }

  // Prefer projects where the user is Developer+ (others usually 403); keep package-count order within each group.
  const canRead = (p: GitLabProject) => accessLevelOf(p) >= AccessLevel.DEVELOPER || p.id === probeProject.id;
  const targets = [...candidates.filter(canRead), ...candidates.filter((p) => !canRead(p))].slice(0, VULN_PROJECT_LIMIT);

  const projects = await mapLimit(targets, 3, async (project): Promise<ProjectVulnerabilities> => {
    const [vulns, deps] = await Promise.allSettled([
      client.requestPaginated<GitLabVulnerability>(`/projects/${project.id}/vulnerabilities`, { page: 1, per_page: 100 }),
      client.requestPaginated<GitLabDependency>(`/projects/${project.id}/dependencies`, { page: 1, per_page: 100 }),
    ]);
    return {
      project,
      packageCount: counts.get(project.id) ?? 0,
      vulnerabilities: vulns.status === "fulfilled" ? vulns.value.data : [],
      vulnerabilitiesTotal: vulns.status === "fulfilled" ? vulns.value.totalItems : 0,
      vulnerabilitiesError: vulns.status === "rejected" ? apiErrorText(vulns.reason) : null,
      dependencies: deps.status === "fulfilled" ? deps.value.data : [],
      dependenciesTotal: deps.status === "fulfilled" ? deps.value.totalItems : 0,
      dependenciesError: deps.status === "rejected" ? apiErrorText(deps.reason) : null,
    };
  });

  return { status: "available", edition, projects, projectsWithPackages: candidates.length };
});
