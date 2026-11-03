// URL search-param model for the packages list. Client- and server-safe.

import { PACKAGE_TYPES } from "@/lib/gitlab/formats";
import type { PackageType } from "@/lib/gitlab/types";

export const PAGE_SIZE = 25;

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "default", label: "Default" },
  { value: "hidden", label: "Hidden" },
  { value: "processing", label: "Processing" },
  { value: "error", label: "Error" },
  { value: "pending_destruction", label: "Pending deletion" },
] as const;

export type StatusValue = Exclude<(typeof STATUS_OPTIONS)[number]["value"], "">;

export interface PackageFilters {
  q: string;
  type: PackageType | "";
  status: StatusValue | "";
  sort: SortValue;
  project: number | null;
  group: number | null;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function positiveInt(v: string): number | null {
  if (!/^\d{1,12}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}

export function parseFilters(sp: RawParams): PackageFilters {
  const type = first(sp.type);
  const status = first(sp.status);
  const sort = first(sp.sort);
  return {
    q: first(sp.q).slice(0, 200),
    type: (PACKAGE_TYPES as readonly string[]).includes(type) ? (type as PackageType) : "",
    status: STATUS_OPTIONS.some((s) => s.value && s.value === status) ? (status as StatusValue) : "",
    sort: SORT_OPTIONS.some((s) => s.value === sort) ? (sort as SortValue) : "newest",
    project: positiveInt(first(sp.project)),
    group: positiveInt(first(sp.group)),
    page: Math.min(positiveInt(first(sp.page)) ?? 1, 10_000),
  };
}

export function sortToApi(sort: SortValue): { order_by: "created_at" | "name"; sort: "asc" | "desc" } {
  switch (sort) {
    case "oldest":
      return { order_by: "created_at", sort: "asc" };
    case "name_asc":
      return { order_by: "name", sort: "asc" };
    case "name_desc":
      return { order_by: "name", sort: "desc" };
    default:
      return { order_by: "created_at", sort: "desc" };
  }
}

/** Serializes filters (minus defaults) to a query string without the leading "?". */
export function filtersToQuery(f: Partial<PackageFilters>): string {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.type) params.set("type", f.type);
  if (f.status) params.set("status", f.status);
  if (f.sort && f.sort !== "newest") params.set("sort", f.sort);
  if (f.project) params.set("project", String(f.project));
  else if (f.group) params.set("group", String(f.group));
  if (f.page && f.page > 1) params.set("page", String(f.page));
  return params.toString();
}

export function packagesHref(query: string, page?: number): string {
  const params = new URLSearchParams(query);
  if (page && page > 1) params.set("page", String(page));
  else params.delete("page");
  const qs = params.toString();
  return qs ? `/packages?${qs}` : "/packages";
}

/** Serialized row handed to the client table. All display strings are computed on the server. */
export interface PackageRow {
  id: number;
  projectId: number;
  projectPath: string | null;
  name: string;
  version: string;
  type: string;
  status: string;
  createdAgo: string;
  createdFull: string;
  lastDownloaded: string | null;
  lastDownloadedFull: string | null;
  pipelineId: number | null;
  pipelineUrl: string | null;
}
