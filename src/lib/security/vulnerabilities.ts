// GitLab Ultimate vulnerability + dependency data: types and pure helpers. Client-safe.

export type VulnerabilitySeverity = "critical" | "high" | "medium" | "low" | "info" | "unknown";

export const VULN_SEVERITIES: VulnerabilitySeverity[] = ["critical", "high", "medium", "low", "info", "unknown"];

/** Subset of `GET /projects/:id/vulnerabilities` items that we use. */
export interface GitLabVulnerability {
  id: number;
  title: string;
  severity: string;
  state: string;
  report_type?: string | null;
  created_at?: string;
  project?: { id: number; name?: string; path_with_namespace?: string } | null;
}

/** Subset of `GET /projects/:id/dependencies` items. */
export interface GitLabDependency {
  name: string;
  version: string;
  package_manager?: string;
  dependency_file_path?: string;
  vulnerabilities?: { id?: number; name: string; severity: string; url?: string }[];
  licenses?: { name: string; url?: string | null }[];
}

export function normalizeSeverity(s: string | null | undefined): VulnerabilitySeverity {
  const v = (s ?? "").toLowerCase();
  return (VULN_SEVERITIES as string[]).includes(v) ? (v as VulnerabilitySeverity) : "unknown";
}

/** "detected" and "confirmed" need attention; "dismissed" and "resolved" don't. */
export function isOpenVulnerability(v: GitLabVulnerability): boolean {
  return v.state === "detected" || v.state === "confirmed";
}

export function sortVulnerabilities<T extends GitLabVulnerability>(list: T[]): T[] {
  const rank = (v: GitLabVulnerability) => VULN_SEVERITIES.indexOf(normalizeSeverity(v.severity));
  return [...list].sort((a, b) => rank(a) - rank(b) || b.id - a.id);
}

export function countBySeverity(list: GitLabVulnerability[]): Record<VulnerabilitySeverity, number> {
  const out = Object.fromEntries(VULN_SEVERITIES.map((s) => [s, 0])) as Record<VulnerabilitySeverity, number>;
  for (const v of list) out[normalizeSeverity(v.severity)]++;
  return out;
}

export function vulnerabilityWebUrl(projectWebUrl: string, id: number): string {
  return `${projectWebUrl}/-/security/vulnerabilities/${id}`;
}

export interface DependencySummary {
  total: number;
  vulnerable: number;
  /** License name → number of dependencies using it, most common first. */
  licenses: { name: string; count: number }[];
}

export function summarizeDependencies(deps: GitLabDependency[]): DependencySummary {
  const licenses = new Map<string, number>();
  let vulnerable = 0;
  for (const d of deps) {
    if ((d.vulnerabilities?.length ?? 0) > 0) vulnerable++;
    const names = d.licenses?.length ? d.licenses.map((l) => l.name) : ["Unknown"];
    for (const n of new Set(names)) licenses.set(n, (licenses.get(n) ?? 0) + 1);
  }
  return {
    total: deps.length,
    vulnerable,
    licenses: [...licenses.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}
