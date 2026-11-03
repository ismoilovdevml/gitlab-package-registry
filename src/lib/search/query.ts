// Search query parsing, version matching, highlighting and URL helpers. Safe for client and server.

import { PACKAGE_TYPES } from "@/lib/gitlab/formats";

export type SearchMode = "empty" | "browse" | "name" | "version" | "checksum";
export type ChecksumAlgo = "sha256" | "sha1" | "md5";
export type SortKey = "relevance" | "newest" | "name";

export interface VersionFilter {
  op: "prefix" | ">=" | "<=" | ">" | "<" | "=";
  value: string;
}

export interface ParsedQuery {
  raw: string;
  mode: SearchMode;
  /** Free-text name fragment (GitLab fuzzy-matches it). */
  name: string;
  version: VersionFilter | null;
  checksum: { algo: ChecksumAlgo | null; value: string } | null;
  /** Formats from `format:` / `type:` qualifiers (packages API types plus "container"). */
  formats: string[];
  /** Namespace / project path prefixes from `group:` / `project:` qualifiers. */
  groups: string[];
  /** Qualifiers we recognise but cannot evaluate against GitLab (shown as ignored). */
  ignored: string[];
}

const KNOWN_FORMATS = new Set<string>([...PACKAGE_TYPES, "container", "docker", "go", "terraform", "gem"]);
const FORMAT_ALIASES: Record<string, string> = { docker: "container", go: "golang", terraform: "terraform_module", gem: "rubygems" };
const IGNORED_KEYS = new Set(["cve", "published", "downloads", "license", "vuln", "severity"]);
const HASH_LEN: Record<number, ChecksumAlgo> = { 32: "md5", 40: "sha1", 64: "sha256" };
const VERSION_RE = /^v?\d+(?:[.\-+~][0-9A-Za-z.\-+~]*)?$/;

export const SORT_KEYS: SortKey[] = ["relevance", "newest", "name"];

export function parseQuery(input: string): ParsedQuery {
  const raw = input.trim();
  const parsed: ParsedQuery = { raw, mode: "empty", name: "", version: null, checksum: null, formats: [], groups: [], ignored: [] };
  if (!raw) return parsed;

  const free: string[] = [];
  for (const token of raw.split(/\s+/)) {
    const m = /^([a-z0-9]+):(.*)$/i.exec(token);
    const key = m?.[1].toLowerCase();
    const value = m?.[2] ?? "";
    if (!m || !key) {
      free.push(token);
      continue;
    }
    if (key === "format" || key === "type") {
      for (const v of value.toLowerCase().split(",").filter(Boolean)) {
        const f = FORMAT_ALIASES[v] ?? v;
        if (KNOWN_FORMATS.has(f) && !parsed.formats.includes(f)) parsed.formats.push(f);
        else if (!KNOWN_FORMATS.has(f)) parsed.ignored.push(token);
      }
    } else if (key === "group" || key === "project" || key === "namespace") {
      if (value) parsed.groups.push(value.replace(/^\/+|\/+$/g, "").toLowerCase());
    } else if (key === "version" || key === "v") {
      if (value) parsed.version = parseVersionFilter(value);
    } else if (key === "sha256" || key === "sha1" || key === "md5" || key === "checksum" || key === "sha") {
      const hex = value.toLowerCase().replace(/…|\.\.\.$/g, "");
      if (/^[0-9a-f]{6,64}$/.test(hex)) {
        const algo = key === "checksum" || key === "sha" ? (HASH_LEN[hex.length] ?? null) : (key as ChecksumAlgo);
        parsed.checksum = { algo, value: hex };
      } else {
        parsed.ignored.push(token);
      }
    } else if (IGNORED_KEYS.has(key)) {
      parsed.ignored.push(token);
    } else {
      // Not a qualifier (e.g. a name that contains a colon).
      free.push(token);
    }
  }

  // A bare 32/40/64-char hex string is a checksum.
  if (!parsed.checksum && free.length === 1 && /^[0-9a-f]+$/i.test(free[0]) && HASH_LEN[free[0].length]) {
    parsed.checksum = { algo: HASH_LEN[free[0].length], value: free[0].toLowerCase() };
    free.length = 0;
  }

  if (parsed.checksum) {
    parsed.mode = "checksum";
    return parsed;
  }

  // name@version (the "@" must not be the first char: npm scopes start with "@").
  if (free.length === 1) {
    const at = free[0].lastIndexOf("@");
    if (at > 0 && at < free[0].length - 1) {
      parsed.name = free[0].slice(0, at);
      parsed.version ??= parseVersionFilter(free[0].slice(at + 1));
      free.length = 0;
    }
  }
  // name <version>
  if (free.length >= 2 && VERSION_RE.test(free[free.length - 1])) {
    parsed.version ??= parseVersionFilter(free.pop() as string);
  }
  if (free.length) parsed.name = free.join(" ");

  parsed.mode = parsed.version ? "version" : parsed.name ? "name" : "browse";
  return parsed;
}

function parseVersionFilter(value: string): VersionFilter {
  const m = /^(>=|<=|>|<|=)(.+)$/.exec(value);
  if (m) return { op: m[1] as VersionFilter["op"], value: m[2] };
  return { op: "prefix", value };
}

/** Compares dotted versions numerically where possible ("1.10.0" > "1.9.2"). */
function compareParts(pa: string[], pb: string[]): number {
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : NaN;
    const ny = /^\d+$/.test(y) ? Number(y) : NaN;
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** Semver-like ordering: numeric core first, then a pre-release ("-rc1") sorts before its release. Build metadata is ignored. */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const [core, ...pre] = v.replace(/^v/i, "").split("+")[0].split("-");
    return { core: core.split("."), pre: pre.join("-") };
  };
  const va = split(a);
  const vb = split(b);
  const core = compareParts(va.core, vb.core);
  if (core !== 0) return core;
  if (va.pre === vb.pre) return 0;
  if (!va.pre) return 1;
  if (!vb.pre) return -1;
  return compareParts(va.pre.split("."), vb.pre.split("."));
}

export function matchesVersion(version: string, filter: VersionFilter): boolean {
  const v = version.toLowerCase();
  const f = filter.value.toLowerCase();
  if (filter.op === "prefix") return v.startsWith(f) || v.replace(/^v/, "").startsWith(f.replace(/^v/, ""));
  const c = compareVersions(v, f);
  switch (filter.op) {
    case "=":
      return c === 0;
    case ">=":
      return c >= 0;
    case "<=":
      return c <= 0;
    case ">":
      return c > 0;
    case "<":
      return c < 0;
  }
}

export function describeVersionFilter(f: VersionFilter): string {
  return f.op === "prefix" ? `starting with “${f.value}”` : `${f.op} ${f.value}`;
}

/** Splits `text` into segments, marking case-insensitive occurrences of `needle`. */
export function highlight(text: string, needle: string): { text: string; match: boolean }[] {
  const n = needle.trim().toLowerCase();
  if (!n) return [{ text, match: false }];
  const out: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const j = lower.indexOf(n, i);
    if (j === -1) {
      out.push({ text: text.slice(i), match: false });
      break;
    }
    if (j > i) out.push({ text: text.slice(i, j), match: false });
    out.push({ text: text.slice(j, j + n.length), match: true });
    i = j + n.length;
  }
  return out;
}

export interface SearchState {
  q: string;
  type: string[];
  project: string[];
  sort: SortKey;
  page: number;
}

/** Builds a /search URL from state; omits defaults. */
export function searchHref(state: SearchState, patch: Partial<SearchState> = {}): string {
  const s = { ...state, ...patch };
  const sp = new URLSearchParams();
  if (s.q) sp.set("q", s.q);
  for (const t of s.type) sp.append("type", t);
  for (const p of s.project) sp.append("project", p);
  if (s.sort !== "relevance") sp.set("sort", s.sort);
  if (s.page > 1) sp.set("page", String(s.page));
  const qs = sp.toString();
  return qs ? `/search?${qs}` : "/search";
}

export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
