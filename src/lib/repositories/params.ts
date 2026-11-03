// Client-safe helpers for the Repositories screens (URL params, sort options).

export const REPOSITORY_SORTS = [
  { value: "activity", label: "Last activity", orderBy: "last_activity_at", sort: "desc" },
  { value: "name", label: "Name", orderBy: "name", sort: "asc" },
  { value: "storage", label: "Storage size", orderBy: "storage_size", sort: "desc" },
] as const;

export type RepositorySort = (typeof REPOSITORY_SORTS)[number]["value"];

export const REPOSITORIES_PER_PAGE = 25;
export const TAGS_PER_PAGE = 50;

export interface RepositoryListParams {
  q: string;
  sort: RepositorySort;
  group: number | null;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Parses a positive integer route/query param; returns null when invalid. */
export function parsePositiveInt(value: string | string[] | undefined): number | null {
  const s = first(value);
  if (!/^\d{1,12}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

export function parsePage(value: string | string[] | undefined): number {
  return Math.min(parsePositiveInt(value) ?? 1, 10_000);
}

export function parseRepositoryListParams(sp: RawParams): RepositoryListParams {
  const sortRaw = first(sp.sort);
  const sort = (REPOSITORY_SORTS.find((s) => s.value === sortRaw)?.value ?? "activity") as RepositorySort;
  return {
    q: first(sp.q).trim().slice(0, 200),
    sort,
    group: parsePositiveInt(sp.group),
    page: parsePage(sp.page),
  };
}

/** Builds /repositories?… keeping only non-default values. */
export function repositoriesHref(params: Partial<RepositoryListParams>): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.group) qs.set("group", String(params.group));
  if (params.sort && params.sort !== "activity") qs.set("sort", params.sort);
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  const s = qs.toString();
  return s ? `/repositories?${s}` : "/repositories";
}
