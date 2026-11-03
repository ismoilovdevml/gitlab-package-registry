// Pure helpers that shape raw search hits into grouped, faceted, sorted results.

import type { GitLabPackage } from "@/lib/gitlab/types";
import { compareVersions, type SortKey } from "./query";

export interface PackageGroup {
  key: string;
  name: string;
  packageType: string;
  projectId: number | undefined;
  projectPath: string;
  /** Newest matching version. */
  latest: GitLabPackage;
  /** All matching versions, newest first. */
  versions: GitLabPackage[];
}

export interface FacetItem {
  value: string;
  count: number;
}

export const UNKNOWN_PROJECT = "(unknown project)";

export function projectOf(p: GitLabPackage): string {
  return p.project_path ?? UNKNOWN_PROJECT;
}

const time = (s: string) => new Date(s).getTime() || 0;

export function groupPackages(list: GitLabPackage[]): PackageGroup[] {
  const map = new Map<string, PackageGroup>();
  for (const p of list) {
    const key = `${p.project_id ?? projectOf(p)}:${p.package_type}:${p.name}`;
    const g = map.get(key);
    if (g) {
      g.versions.push(p);
      if (time(p.created_at) > time(g.latest.created_at)) g.latest = p;
    } else {
      map.set(key, {
        key,
        name: p.name,
        packageType: p.package_type,
        projectId: p.project_id,
        projectPath: projectOf(p),
        latest: p,
        versions: [p],
      });
    }
  }
  const groups = [...map.values()];
  for (const g of groups) g.versions.sort((a, b) => time(b.created_at) - time(a.created_at) || compareVersions(b.version, a.version));
  return groups;
}

/** Lower is better: exact name, then prefix, then last path segment, then substring. */
function relevance(name: string, needle: string): number {
  if (!needle) return 0;
  const n = name.toLowerCase();
  if (n === needle) return 0;
  const last = n.split(/[/:]/).pop() ?? n;
  if (last === needle) return 1;
  if (n.startsWith(needle) || last.startsWith(needle)) return 2;
  if (n.includes(needle)) return 3;
  return 4;
}

export function sortGroups(groups: PackageGroup[], sort: SortKey, needle: string): PackageGroup[] {
  const n = needle.trim().toLowerCase();
  const byNewest = (a: PackageGroup, b: PackageGroup) => time(b.latest.created_at) - time(a.latest.created_at);
  return [...groups].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name) || a.projectPath.localeCompare(b.projectPath);
    if (sort === "relevance") {
      const d = relevance(a.name, n) - relevance(b.name, n);
      if (d) return d;
    }
    return byNewest(a, b);
  });
}

export function countBy<T>(items: T[], keyOf: (item: T) => string): FacetItem[] {
  const m = new Map<string, number>();
  for (const it of items) m.set(keyOf(it), (m.get(keyOf(it)) ?? 0) + 1);
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
