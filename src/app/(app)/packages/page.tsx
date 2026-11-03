import Link from "next/link";
import { AlertTriangle, Package, SearchX, Upload } from "lucide-react";
import { getAuthenticatedClient, type GitLabContext } from "@/lib/dal";
import { getPackageScopes, listCatalogPackages, type Scope } from "@/lib/gitlab/catalog";
import { getFormat } from "@/lib/gitlab/formats";
import type { GitLabPackage, PaginatedResponse } from "@/lib/gitlab/types";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { PageHeader } from "@/components/ombor/page-header";
import { EmptyState, ErrorState } from "@/components/ombor/empty-state";
import {
  PAGE_SIZE,
  filtersToQuery,
  parseFilters,
  sortToApi,
  type PackageFilters,
  type PackageRow,
} from "./_components/filters";
import {
  FilterSidebar,
  FiltersProvider,
  FormatChips,
  SearchInput,
  SortSelect,
  type ScopeOption,
} from "./_components/package-filters";
import { PackagesTable } from "./_components/packages-table";
import { PackagesPagination } from "./_components/packages-pagination";

export const metadata = { title: "Packages" };
export const dynamic = "force-dynamic";

interface PackageListing {
  rows: PackageRow[];
  /** Total matching items, or null when GitLab didn't report it. */
  total: number | null;
  totalPages: number | null;
  hasNext: boolean;
  /** Human label of the active scope (group/project path). */
  scopeLabel: string | null;
  truncated: boolean;
  /** Items actually loaded across scopes (catalog mode only). */
  loaded: number;
  failedScopes: string[];
}

function toRow(p: GitLabPackage, now: number, fallback?: { projectId: number; projectPath: string | null }): PackageRow | null {
  const projectId = p.project_id ?? fallback?.projectId;
  if (!projectId) return null;
  const pipeline = p.pipeline ?? p.pipelines?.[0] ?? null;
  return {
    id: p.id,
    projectId,
    projectPath: p.project_path ?? fallback?.projectPath ?? null,
    name: p.name,
    version: p.version ?? "",
    type: p.package_type,
    status: p.status,
    createdAgo: timeAgo(p.created_at, now),
    createdFull: formatDateTime(p.created_at),
    lastDownloaded: p.last_downloaded_at ? timeAgo(p.last_downloaded_at, now) : null,
    lastDownloadedFull: p.last_downloaded_at ? formatDateTime(p.last_downloaded_at) : null,
    pipelineId: pipeline?.id ?? null,
    pipelineUrl: pipeline?.web_url ?? null,
  };
}

/** GitLab drops x-total on very large collections; the client then falls back to the page length. */
function paginatedTotals(res: PaginatedResponse<GitLabPackage>) {
  const unknown = res.nextPage !== null && res.totalItems <= res.data.length;
  return { total: unknown ? null : res.totalItems, totalPages: unknown ? null : res.totalPages };
}

async function loadPackages(ctx: GitLabContext, f: PackageFilters): Promise<PackageListing> {
  const now = Date.now();
  const query = {
    package_name: f.q || undefined,
    package_type: f.type || undefined,
    status: f.status || undefined,
    ...sortToApi(f.sort),
  };
  const isRow = (r: PackageRow | null): r is PackageRow => r !== null;

  if (f.project) {
    const [res, project] = await Promise.all([
      ctx.packages.listProjectPackages(f.project, { ...query, page: f.page, per_page: PAGE_SIZE }),
      ctx.projects.getProject(f.project).catch(() => null),
    ]);
    const fallback = { projectId: f.project, projectPath: project?.path_with_namespace ?? null };
    return {
      rows: res.data.map((p) => toRow(p, now, fallback)).filter(isRow),
      ...paginatedTotals(res),
      hasNext: res.nextPage !== null,
      scopeLabel: project?.path_with_namespace ?? `Project #${f.project}`,
      truncated: false,
      loaded: res.data.length,
      failedScopes: [],
    };
  }

  if (f.group) {
    const [res, group] = await Promise.all([
      ctx.packages.listGroupPackages(f.group, { ...query, page: f.page, per_page: PAGE_SIZE }),
      ctx.groups.getGroup(f.group).catch(() => null),
    ]);
    return {
      rows: res.data.map((p) => toRow(p, now)).filter(isRow),
      ...paginatedTotals(res),
      hasNext: res.nextPage !== null,
      scopeLabel: group?.full_path ?? `Group #${f.group}`,
      truncated: false,
      loaded: res.data.length,
      failedScopes: [],
    };
  }

  // No scope: merge every group + personal namespace, then page in memory.
  const catalog = await listCatalogPackages(query, { perScope: 100 });
  const all = catalog.packages.map((p) => toRow(p, now)).filter(isRow);
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const start = (f.page - 1) * PAGE_SIZE;
  return {
    rows: all.slice(start, start + PAGE_SIZE),
    total: catalog.total,
    totalPages,
    hasNext: f.page < totalPages,
    scopeLabel: null,
    truncated: catalog.truncated,
    loaded: all.length,
    failedScopes: catalog.failedScopes,
  };
}

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const ctx = await getAuthenticatedClient();
  const [listing, scopesResult] = await Promise.allSettled([loadPackages(ctx, filters), getPackageScopes()]);
  const scopes: Scope[] = scopesResult.status === "fulfilled" ? scopesResult.value : [];
  const data = listing.status === "fulfilled" ? listing.value : null;

  const activeScope = filters.project
    ? { kind: "project" as const, id: filters.project }
    : filters.group
      ? { kind: "group" as const, id: filters.group }
      : null;

  // Keep the active scope selectable even when it isn't a top-level group / personal project.
  const scopeOptions: ScopeOption[] = scopes.map((s) => ({ kind: s.kind, id: s.id, path: s.path }));
  if (activeScope && !scopeOptions.some((s) => s.kind === activeScope.kind && s.id === activeScope.id)) {
    scopeOptions.unshift({ ...activeScope, path: data?.scopeLabel ?? `${activeScope.kind} #${activeScope.id}` });
  }

  const hasFilters = Boolean(filters.q || filters.type || filters.status);
  const scopeQuery = filtersToQuery({ project: filters.project, group: filters.group });
  const pageQuery = filtersToQuery({ ...filters, page: 1 });

  const where = data?.scopeLabel ? (
    <>
      in <span className="font-medium text-foreground">{data.scopeLabel}</span>
    </>
  ) : (
    "across all projects you can read"
  );
  const description = data ? (
    <>
      {data.total !== null ? `${formatNumber(data.total)} ${data.total === 1 ? "package" : "packages"}` : "Packages"}
      {filters.type ? ` · ${getFormat(filters.type).label}` : ""} {where}
    </>
  ) : (
    "Every package version published to GitLab projects you can read"
  );

  const first = data && data.rows.length ? (filters.page - 1) * PAGE_SIZE + 1 : 0;
  const last = data ? first + Math.max(0, data.rows.length - 1) : 0;

  return (
    <FiltersProvider>
      <PageHeader
        title="Packages"
        description={description}
        actions={
          <Link
            href={routes.publish}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-3.5 text-sm font-medium text-background hover:bg-foreground/85"
          >
            <Upload className="size-4" /> Upload package
          </Link>
        }
        className="mb-5"
      />

      <FormatChips active={filters.type} count={data?.total ?? null} />

      <div className="mt-5 flex flex-col items-start gap-4 lg:flex-row">
        <FilterSidebar
          status={filters.status}
          scopes={scopeOptions}
          activeScope={activeScope}
          hasFilters={hasFilters || activeScope !== null || filters.sort !== "newest"}
        />

        <section aria-label="Package list" className="flex w-full min-w-0 flex-1 flex-col rounded-xl border bg-card">
          <div className="flex flex-wrap items-center gap-2.5 border-b px-[18px] py-3.5">
            <SearchInput value={filters.q} />
            <SortSelect value={filters.sort} />
            {data && data.rows.length > 0 && (
              <span className="text-[13px] text-muted-foreground tabular">
                Showing {formatNumber(first)}–{formatNumber(last)}
                {data.scopeLabel === null
                  ? ` of ${formatNumber(data.loaded)}`
                  : data.total !== null
                    ? ` of ${formatNumber(data.total)}`
                    : ""}
              </span>
            )}
          </div>

          {data && (data.truncated || data.failedScopes.length > 0) && (
            <div className="mx-[18px] mt-3.5 flex flex-col gap-1.5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px]">
              {data.truncated && (
                <p className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    Partial list: showing the first {formatNumber(data.loaded)} of {formatNumber(data.total)} matches
                    (up to 100 per group). Pick a scope or narrow the filters to page through everything.
                  </span>
                </p>
              )}
              {data.failedScopes.length > 0 && (
                <p className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span className="break-words">
                    Couldn&apos;t load packages from {data.failedScopes.length === 1 ? "" : `${data.failedScopes.length} scopes: `}
                    <span className="font-mono">{data.failedScopes.slice(0, 5).join(", ")}</span>
                    {data.failedScopes.length > 5 ? ` and ${data.failedScopes.length - 5} more` : ""}.
                  </span>
                </p>
              )}
            </div>
          )}

          {listing.status === "rejected" ? (
            <div className="p-[18px]">
              <ErrorState error={listing.reason} title="Couldn't load packages from GitLab" />
            </div>
          ) : data && data.rows.length > 0 ? (
            <>
              <PackagesTable rows={data.rows} />
              <PackagesPagination page={filters.page} totalPages={data.totalPages} hasNext={data.hasNext} query={pageQuery} />
            </>
          ) : filters.page > 1 ? (
            <EmptyState
              className="m-[18px]"
              icon={<SearchX />}
              title="This page is empty"
              description="There are fewer results than this page number."
              action={
                <Link href={`/packages${pageQuery ? `?${pageQuery}` : ""}`} className="text-sm font-medium text-primary hover:underline">
                  Go to the first page
                </Link>
              }
            />
          ) : hasFilters ? (
            <EmptyState
              className="m-[18px]"
              icon={<SearchX />}
              title="No packages match these filters"
              description={
                filters.q
                  ? `Nothing named like “${filters.q}”${filters.type ? ` in ${getFormat(filters.type).label}` : ""}${filters.status ? ` with status ${filters.status}` : ""}.`
                  : "Try a different format or status."
              }
              action={
                <Link href={`/packages${scopeQuery ? `?${scopeQuery}` : ""}`} className="text-sm font-medium text-primary hover:underline">
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              className="m-[18px]"
              icon={<Package />}
              title={data?.scopeLabel ? `No packages in ${data.scopeLabel}` : "No packages yet"}
              description="Publish a package from CI or upload one manually. Packages appear here as soon as GitLab stores them."
              action={
                <div className="flex flex-wrap justify-center gap-3 text-sm font-medium">
                  <Link href={routes.publish} className="text-primary hover:underline">
                    Upload a package
                  </Link>
                  <Link href={routes.clientSetup} className="text-primary hover:underline">
                    Set up a client
                  </Link>
                </div>
              }
            />
          )}
        </section>
      </div>
    </FiltersProvider>
  );
}
