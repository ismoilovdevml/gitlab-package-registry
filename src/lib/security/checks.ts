// Registry hygiene checks. Pure functions over already-fetched GitLab data — no I/O, client-safe,
// and work on every GitLab edition (CE, Premium, Ultimate).

import type { GitLabPackage, GitLabPackageFile, GitLabProject } from "@/lib/gitlab/types";

export type Severity = "high" | "medium" | "low";

export const SEVERITIES: Severity[] = ["high", "medium", "low"];

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export type CheckId = "package_status" | "exposure" | "checksum" | "provenance" | "stale";

export interface CheckInfo {
  id: CheckId;
  label: string;
  /** What the check looks at, shown in the UI. */
  description: string;
}

export const CHECKS: Record<CheckId, CheckInfo> = {
  package_status: {
    id: "package_status",
    label: "Package status",
    description: "Packages in error, stuck in processing, or waiting for deletion.",
  },
  exposure: {
    id: "exposure",
    label: "Exposure",
    description: "Packages hosted in public or internal projects.",
  },
  checksum: {
    id: "checksum",
    label: "Checksums",
    description: "Package files without a SHA-256 checksum.",
  },
  provenance: {
    id: "provenance",
    label: "Provenance",
    description: "Packages published without a CI pipeline.",
  },
  stale: {
    id: "stale",
    label: "Stale",
    description: "Packages not downloaded for 90+ days.",
  },
};

export const CHECK_IDS = Object.keys(CHECKS) as CheckId[];

/** A processing package younger than this is normal; older means the upload is stuck. */
export const STUCK_PROCESSING_MS = 60 * 60 * 1000;
export const STALE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type FindingTarget =
  | {
      kind: "package";
      projectId: number;
      packageId: number;
      name: string;
      version: string;
      packageType: string;
      projectPath?: string;
    }
  | {
      kind: "project";
      projectId: number;
      path: string;
      webUrl: string;
      /** Packages of this project in the scanned sample. */
      packageCount: number;
    };

export interface Finding {
  /** Stable key (check + target). */
  id: string;
  check: CheckId;
  severity: Severity;
  title: string;
  detail: string;
  action: string;
  target: FindingTarget;
}

function packageTarget(p: GitLabPackage): FindingTarget | null {
  if (p.project_id === undefined) return null;
  return {
    kind: "package",
    projectId: p.project_id,
    packageId: p.id,
    name: p.name,
    version: p.version,
    packageType: p.package_type,
    projectPath: p.project_path,
  };
}

function ageMs(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : now - t;
}

function days(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/** Packages whose files are expected to be downloadable (excludes broken/deleting/in-flight ones). */
export function isActivePackage(p: GitLabPackage): boolean {
  return p.status === "default" || p.status === "hidden";
}

export function checkPackageStatus(packages: GitLabPackage[], now: number): Finding[] {
  const out: Finding[] = [];
  for (const p of packages) {
    const target = packageTarget(p);
    if (!target) continue;
    const base = { check: "package_status" as const, target };
    if (p.status === "error") {
      out.push({
        ...base,
        id: `status:${p.id}`,
        severity: "high",
        title: "Package in error state",
        detail: "GitLab failed to process this upload; installs of this version fail or return incomplete files.",
        action: "Re-publish the version from CI, then delete the broken package.",
      });
    } else if (p.status === "processing") {
      const age = ageMs(p.created_at, now);
      if (age === null || age < STUCK_PROCESSING_MS) continue;
      out.push({
        ...base,
        id: `status:${p.id}`,
        severity: "medium",
        title: "Stuck in processing",
        detail: `Still processing ${days(age) >= 1 ? `${days(age)} d` : `${Math.round(age / 3_600_000)} h`} after upload — normally this takes seconds.`,
        action: "Check Sidekiq package workers on the GitLab server; re-publish if it never completes.",
      });
    } else if (p.status === "pending_destruction") {
      out.push({
        ...base,
        id: `status:${p.id}`,
        severity: "low",
        title: "Pending destruction",
        detail: "Marked for deletion but its files are still stored.",
        action: "No action if it disappears soon; if it lingers, check GitLab's package cleanup background jobs.",
      });
    }
  }
  return out;
}

/** Packages with no linked CI pipeline were uploaded by hand (personal/deploy token), so their origin can't be traced. */
export function hasPipeline(p: GitLabPackage): boolean {
  return Boolean(p.pipeline) || (p.pipelines?.length ?? 0) > 0;
}

export function checkProvenance(packages: GitLabPackage[]): Finding[] {
  const out: Finding[] = [];
  for (const p of packages) {
    if (!isActivePackage(p) || hasPipeline(p)) continue;
    const target = packageTarget(p);
    if (!target) continue;
    out.push({
      id: `provenance:${p.id}`,
      check: "provenance",
      severity: "medium",
      target,
      title: "Published without a pipeline",
      detail: "No CI pipeline is linked, so the source commit and build of this version are unknown.",
      action: "Publish from CI with CI_JOB_TOKEN so every version traces back to a commit.",
    });
  }
  return out;
}

export interface PackageFiles {
  pkg: GitLabPackage;
  files: GitLabPackageFile[];
}

export function checkChecksums(scanned: PackageFiles[]): Finding[] {
  const out: Finding[] = [];
  for (const { pkg, files } of scanned) {
    const target = packageTarget(pkg);
    if (!target || files.length === 0) continue;
    const noSha256 = files.filter((f) => !f.file_sha256);
    if (noSha256.length === 0) continue;
    const noChecksum = noSha256.filter((f) => !f.file_sha1 && !f.file_md5);
    const of = `${noSha256.length} of ${files.length} file${files.length === 1 ? "" : "s"}`;
    if (noChecksum.length > 0) {
      out.push({
        id: `checksum:${pkg.id}`,
        check: "checksum",
        severity: "medium",
        target,
        title: "Files without any checksum",
        detail: `${of} lack SHA-256; ${noChecksum.length} have no checksum at all, so tampering or corruption can't be detected.`,
        action: "Re-publish with a client that sends checksums, or verify the files manually and re-upload.",
      });
    } else {
      out.push({
        id: `checksum:${pkg.id}`,
        check: "checksum",
        severity: "low",
        target,
        title: "No SHA-256 checksum",
        detail: `${of} only have MD5/SHA-1, which are not collision-resistant.`,
        action: "Re-publish with a current client so GitLab stores SHA-256 digests.",
      });
    }
  }
  return out;
}

export function checkExposure(packages: GitLabPackage[], projects: Map<number, GitLabProject>): Finding[] {
  const counts = new Map<number, number>();
  for (const p of packages) {
    if (p.project_id === undefined) continue;
    counts.set(p.project_id, (counts.get(p.project_id) ?? 0) + 1);
  }
  const out: Finding[] = [];
  for (const [projectId, packageCount] of counts) {
    const project = projects.get(projectId);
    if (!project || (project.visibility !== "public" && project.visibility !== "internal")) continue;
    const isPublic = project.visibility === "public";
    const n = `${packageCount} package${packageCount === 1 ? "" : "s"}`;
    out.push({
      id: `exposure:${projectId}`,
      check: "exposure",
      severity: isPublic ? "high" : "medium",
      target: { kind: "project", projectId, path: project.path_with_namespace, webUrl: project.web_url, packageCount },
      title: isPublic ? "Public project" : "Internal project",
      detail: isPublic
        ? `${n} downloadable by anyone who can reach GitLab, without signing in.`
        : `${n} downloadable by every signed-in user of this GitLab instance.`,
      action: "Confirm this is intended; otherwise set the project (or its package registry) to private.",
    });
  }
  return out;
}

export function checkStale(packages: GitLabPackage[], now: number, staleDays = STALE_DAYS): Finding[] {
  const limit = staleDays * DAY_MS;
  const out: Finding[] = [];
  for (const p of packages) {
    // Older GitLab versions don't expose last_downloaded_at at all — then we can't judge.
    if (p.status !== "default" || p.last_downloaded_at === undefined) continue;
    const created = ageMs(p.created_at, now);
    if (created === null || created < limit) continue;
    const target = packageTarget(p);
    if (!target) continue;
    const downloaded = ageMs(p.last_downloaded_at, now);
    if (downloaded !== null && downloaded < limit) continue;
    out.push({
      id: `stale:${p.id}`,
      check: "stale",
      severity: "low",
      target,
      title: downloaded === null ? "Never downloaded" : "Not downloaded recently",
      detail:
        downloaded === null
          ? `Published ${days(created)} d ago and never downloaded.`
          : `Last downloaded ${days(downloaded)} d ago.`,
      action: "Delete it or cover it with a cleanup policy to shrink the attack surface and storage.",
    });
  }
  return out;
}

export interface CheckInput {
  packages: GitLabPackage[];
  projects: Map<number, GitLabProject>;
  checksumScan: PackageFiles[];
  now: number;
}

export function runChecks({ packages, projects, checksumScan, now }: CheckInput): Finding[] {
  return sortFindings([
    ...checkPackageStatus(packages, now),
    ...checkExposure(packages, projects),
    ...checkChecksums(checksumScan),
    ...checkProvenance(packages),
    ...checkStale(packages, now),
  ]);
}

export function sortFindings(findings: Finding[]): Finding[] {
  const order = CHECK_IDS;
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      order.indexOf(a.check) - order.indexOf(b.check) ||
      a.id.localeCompare(b.id),
  );
}

export interface SeverityCount {
  findings: number;
  packages: number;
  projects: number;
}

export interface FindingSummary {
  bySeverity: Record<Severity, SeverityCount>;
  byCheck: Record<CheckId, number>;
  total: number;
  /** Packages in the sample with at least one finding (directly or via their project). */
  affectedPackages: number;
  cleanPackages: number;
  sampledPackages: number;
}

export function summarize(findings: Finding[], packages: GitLabPackage[]): FindingSummary {
  const bySeverity = Object.fromEntries(
    SEVERITIES.map((s) => [s, { findings: 0, packages: 0, projects: 0 }]),
  ) as Record<Severity, SeverityCount>;
  const byCheck = Object.fromEntries(CHECK_IDS.map((c) => [c, 0])) as Record<CheckId, number>;

  const packagesByProject = new Map<number, number[]>();
  for (const p of packages) {
    if (p.project_id === undefined) continue;
    const list = packagesByProject.get(p.project_id) ?? [];
    list.push(p.id);
    packagesByProject.set(p.project_id, list);
  }

  const affected = new Set<number>();
  const sevPackages: Record<Severity, Set<number>> = { high: new Set(), medium: new Set(), low: new Set() };
  const sevProjects: Record<Severity, Set<number>> = { high: new Set(), medium: new Set(), low: new Set() };

  for (const f of findings) {
    bySeverity[f.severity].findings++;
    byCheck[f.check]++;
    sevProjects[f.severity].add(f.target.projectId);
    const ids = f.target.kind === "package" ? [f.target.packageId] : (packagesByProject.get(f.target.projectId) ?? []);
    for (const id of ids) {
      affected.add(id);
      sevPackages[f.severity].add(id);
    }
  }
  for (const s of SEVERITIES) {
    bySeverity[s].packages = sevPackages[s].size;
    bySeverity[s].projects = sevProjects[s].size;
  }

  const sampled = new Set(packages.map((p) => p.id)).size;
  return {
    bySeverity,
    byCheck,
    total: findings.length,
    affectedPackages: affected.size,
    cleanPackages: Math.max(0, sampled - affected.size),
    sampledPackages: sampled,
  };
}

export function parseSeverity(value: unknown): Severity | undefined {
  return typeof value === "string" && (SEVERITIES as string[]).includes(value) ? (value as Severity) : undefined;
}

export function parseCheck(value: unknown): CheckId | undefined {
  return typeof value === "string" && (CHECK_IDS as string[]).includes(value) ? (value as CheckId) : undefined;
}

export function filterFindings(findings: Finding[], { severity, check }: { severity?: Severity; check?: CheckId }): Finding[] {
  return findings.filter((f) => (!severity || f.severity === severity) && (!check || f.check === check));
}
