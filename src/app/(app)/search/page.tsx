import type { Metadata } from "next";
import Link from "next/link";
import { Check, Info, SearchX } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/ombor/empty-state";
import { Pagination } from "@/components/ombor/pagination";
import { getFormat } from "@/lib/gitlab/formats";
import type { GitLabPackage } from "@/lib/gitlab/types";
import { timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { CHECKSUM_SCAN_LIMIT, CONTAINER_GROUP_LIMIT, recentPackages, runSearch, type SearchOutcome } from "@/lib/search";
import {
  describeVersionFilter,
  parseQuery,
  searchHref,
  SORT_KEYS,
  toggle,
  type ParsedQuery,
  type SearchState,
  type SortKey,
} from "@/lib/search/query";
import { countBy, groupPackages, projectOf, sortGroups, type FacetItem } from "@/lib/search/results";
import { cn } from "@/lib/utils";
import { ChecksumResult, ContainerResult, FormatTile, PackageResult } from "./result-items";
import { SearchBox } from "./search-box";
import { SortSelect } from "./sort-select";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const CONTAINER_SHOWN = 12;
const PROJECT_FACET_LIMIT = 12;

type SP = Record<string, string | string[] | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const q = first((await searchParams).q)?.trim();
  return { title: q ? `Search: ${q}` : "Search" };
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function all(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
}

function readState(sp: SP): SearchState {
  const sort = first(sp.sort) as SortKey;
  const page = Number(first(sp.page));
  return {
    q: (first(sp.q) ?? "").trim().slice(0, 300),
    type: all(sp.type),
    project: all(sp.project),
    sort: SORT_KEYS.includes(sort) ? sort : "relevance",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = readState(await searchParams);
  const parsed = parseQuery(state.q);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:p-8 sm:pb-6">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">Search</h1>
        <SearchBox key={state.q} state={state} />
        {parsed.mode !== "empty" && <ModeHint parsed={parsed} />}
      </section>
      {parsed.mode === "empty" ? <EmptyQuery /> : <Results state={state} parsed={parsed} />}
    </div>
  );
}

function ModeHint({ parsed }: { parsed: ParsedQuery }) {
  const filters: string[] = [];
  if (parsed.formats.length) filters.push(`format: ${parsed.formats.map((f) => getFormat(f).label).join(", ")}`);
  if (parsed.groups.length) filters.push(`in ${parsed.groups.join(", ")}`);

  let text: React.ReactNode;
  switch (parsed.mode) {
    case "checksum": {
      const algo = parsed.checksum?.algo ? parsed.checksum.algo.toUpperCase() : "any hash";
      const partial = parsed.checksum && ![32, 40, 64].includes(parsed.checksum.value.length);
      text = (
        <>
          <strong className="font-medium text-foreground">Checksum search</strong> ({algo}
          {partial ? ", prefix" : ""}) — matches package files by hash. GitLab has no checksum index, so only the files of the{" "}
          {CHECKSUM_SCAN_LIMIT} most recently published packages are scanned.
        </>
      );
      break;
    }
    case "version":
      text = (
        <>
          <strong className="font-medium text-foreground">Version search</strong> —{" "}
          {parsed.name ? (
            <>
              packages named like <code className="font-mono text-foreground">{parsed.name}</code>
            </>
          ) : (
            "all packages"
          )}{" "}
          with a version {describeVersionFilter(parsed.version!)}.
        </>
      );
      break;
    case "name":
      text = (
        <>
          <strong className="font-medium text-foreground">Name search</strong> — package names and container image paths containing{" "}
          <code className="font-mono text-foreground">{parsed.name}</code>. Add <code className="font-mono">@1.2</code> or a
          version to narrow by version.
        </>
      );
      break;
    default:
      text = (
        <>
          <strong className="font-medium text-foreground">Browse</strong> — newest packages matching the filters.
        </>
      );
  }

  return (
    <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
      <p className="flex gap-2">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {text}
          {filters.length > 0 && <> Filters: {filters.join(" · ")}.</>}
        </span>
      </p>
      {parsed.ignored.length > 0 && (
        <p className="pl-5.5 text-warning">
          Ignored: <span className="font-mono">{parsed.ignored.join(" ")}</span> — not something GitLab can be searched by.
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */

interface Item {
  format: string;
  project: string;
}

async function Results({ state, parsed }: { state: SearchState; parsed: ParsedQuery }) {
  let outcome: SearchOutcome;
  try {
    outcome = await runSearch(parsed);
  } catch (e) {
    return <ErrorState error={e} title="Search failed" />;
  }
  const isChecksum = parsed.mode === "checksum";

  // Every result card is one facet item: a package (all its matching versions), a checksum hit, or an image.
  const groups = sortGroups(groupPackages(outcome.packages), state.sort, parsed.name);
  const checksum = outcome.checksumMatches;
  const items: (Item & { kind: "pkg" | "sum" | "img"; index: number })[] = [
    ...groups.map((g, index) => ({ kind: "pkg" as const, index, format: g.packageType, project: g.projectPath })),
    ...checksum.map((m, index) => ({ kind: "sum" as const, index, format: m.pkg.package_type, project: projectOf(m.pkg) })),
    ...outcome.containers.map((c, index) => ({ kind: "img" as const, index, format: "container", project: c.projectPath })),
  ];

  const typeOk = (i: Item) => !state.type.length || state.type.includes(i.format);
  const projectOk = (i: Item) => !state.project.length || state.project.includes(i.project);
  const formatFacet = withSelected(countBy(items.filter(projectOk), (i) => i.format), state.type);
  const projectFacet = withSelected(countBy(items.filter(typeOk), (i) => i.project), state.project);
  const visible = items.filter((i) => typeOk(i) && projectOk(i));

  const visibleGroups = visible.filter((i) => i.kind === "pkg").map((i) => groups[i.index]);
  const visibleChecksum = visible.filter((i) => i.kind === "sum").map((i) => checksum[i.index]);
  const visibleImages = visible.filter((i) => i.kind === "img").map((i) => outcome.containers[i.index]);
  const versionCount = visibleGroups.reduce((s, g) => s + g.versions.length, 0);

  const totalPages = Math.max(1, Math.ceil((isChecksum ? visibleChecksum : visibleGroups).length / PAGE_SIZE));
  const page = Math.min(state.page, totalPages);
  const pageSlice = <T,>(list: T[]) => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary: string[] = [];
  if (isChecksum) summary.push(`${visibleChecksum.length} matching ${visibleChecksum.length === 1 ? "file" : "files"}`);
  else {
    summary.push(`${visibleGroups.length} ${visibleGroups.length === 1 ? "package" : "packages"}`);
    if (versionCount !== visibleGroups.length) summary.push(`${versionCount} versions`);
  }
  if (outcome.containers.length || state.type.includes("container")) summary.push(`${visibleImages.length} container images`);
  summary.push(`${outcome.elapsedMs} ms`);

  const nothing = visible.length === 0 && !outcome.packageError && !outcome.containerError;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <aside aria-label="Refine results" className="flex min-w-0 flex-[1_1_220px] flex-col gap-5">
        <Facet title="Format" items={formatFacet} selected={state.type} hrefFor={(v) => searchHref(state, { type: toggle(state.type, v), page: 1 })} label={(v) => getFormat(v).label} />
        <Facet
          title="Project"
          items={projectFacet}
          selected={state.project}
          limit={PROJECT_FACET_LIMIT}
          mono
          hrefFor={(v) => searchHref(state, { project: toggle(state.project, v), page: 1 })}
        />
        {(state.type.length > 0 || state.project.length > 0) && (
          <Link href={searchHref(state, { type: [], project: [], page: 1 })} className="text-[13px] font-medium text-primary hover:underline">
            Clear filters
          </Link>
        )}
      </aside>

      <section aria-label="Results" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
          <span className="tabular" aria-live="polite">
            {summary.join(" · ")}
          </span>
          {!isChecksum && visibleGroups.length > 1 && <SortSelect state={state} />}
        </div>

        <Notices outcome={outcome} parsed={parsed} />

        {outcome.packageError ? <ErrorState error={outcome.packageError} title="Package search failed" /> : null}

        {nothing ? (
          <EmptyState
            icon={<SearchX />}
            title={`No results for “${state.q}”`}
            description={noResultsHint(parsed, state)}
            action={
              state.type.length || state.project.length ? (
                <Link href={searchHref(state, { type: [], project: [], page: 1 })} className="text-sm font-medium text-primary hover:underline">
                  Clear filters
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            {isChecksum
              ? pageSlice(visibleChecksum).map((m) => <ChecksumResult key={`${m.pkg.id}:${m.file.id}`} match={m} />)
              : pageSlice(visibleGroups).map((g) => <PackageResult key={g.key} group={g} needle={parsed.name} />)}
            <Pagination page={page} totalPages={totalPages} hasNext={page < totalPages} hrefFor={(p) => searchHref(state, { page: p })} />

            {page === 1 && (visibleImages.length > 0 || outcome.containerError) ? (
              <div className="mt-4 flex flex-col gap-3">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Container images</h2>
                {outcome.containerError ? <ErrorState error={outcome.containerError} title="Container image search failed" /> : null}
                {visibleImages.slice(0, CONTAINER_SHOWN).map((c) => (
                  <ContainerResult key={c.repo.id} hit={c} needle={parsed.name} />
                ))}
                {visibleImages.length > CONTAINER_SHOWN && (
                  <p className="text-[13px] text-muted-foreground">
                    Showing {CONTAINER_SHOWN} of {visibleImages.length} images — refine the query or{" "}
                    <Link href={routes.repositories} className="font-medium text-primary hover:underline">
                      browse repositories
                    </Link>
                    .
                  </p>
                )}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function withSelected(items: FacetItem[], selected: string[]): FacetItem[] {
  const missing = selected.filter((s) => !items.some((i) => i.value === s)).map((value) => ({ value, count: 0 }));
  return [...items, ...missing];
}

function Facet({
  title,
  items,
  selected,
  hrefFor,
  label = (v) => v,
  limit,
  mono,
}: {
  title: string;
  items: FacetItem[];
  selected: string[];
  hrefFor: (value: string) => string;
  label?: (value: string) => string;
  limit?: number;
  mono?: boolean;
}) {
  if (!items.length) return null;
  const shown = limit ? items.filter((it, i) => i < limit || selected.includes(it.value)) : items;
  const hidden = items.length - shown.length;
  return (
    <div className="flex flex-col gap-1">
      <span className="pb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{title}</span>
      {shown.map((it) => {
        const on = selected.includes(it.value);
        return (
          <Link
            key={it.value}
            href={hrefFor(it.value)}
            aria-label={`${on ? "Remove" : "Add"} filter ${title.toLowerCase()} ${label(it.value)} (${it.count})`}
            className="flex min-h-8 items-center gap-2 rounded-lg px-1.5 text-sm hover:bg-muted"
          >
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
              )}
            >
              {on && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className={cn("min-w-0 truncate", mono && "font-mono text-[13px]")} title={label(it.value)}>
              {label(it.value)}
            </span>
            <span className="ml-auto text-xs text-muted-foreground tabular">{it.count}</span>
          </Link>
        );
      })}
      {hidden > 0 && <span className="px-1.5 pt-1 text-xs text-muted-foreground">+{hidden} more — refine the query to narrow down</span>}
    </div>
  );
}

function Notices({ outcome, parsed }: { outcome: SearchOutcome; parsed: ParsedQuery }) {
  const notes: React.ReactNode[] = [];
  if (parsed.mode === "checksum") {
    notes.push(
      <>
        Scanned the files of the {outcome.scanned} most recent {outcome.scanned === 1 ? "package" : "packages"}
        {outcome.truncated ? ` (limit ${CHECKSUM_SCAN_LIMIT}; older packages were not checked)` : ""}.
        {outcome.scanFailed > 0 && ` Files of ${outcome.scanFailed} packages couldn't be read.`} Narrow with{" "}
        <code className="font-mono">format:</code> or <code className="font-mono">group:</code> to reach older packages.
      </>,
    );
  } else if (outcome.truncated) {
    notes.push(
      <>
        Results are partial: at least one group or namespace has more than 100 matches and only the newest 100 were fetched. Add a
        version, <code className="font-mono">format:</code> or <code className="font-mono">group:</code> to narrow the search.
      </>,
    );
  }
  if (outcome.failedScopes.length) {
    notes.push(
      <>
        Couldn&apos;t search {outcome.failedScopes.length} of {outcome.scopeCount || "the"} groups/namespaces (permission or GitLab
        error): <span className="font-mono">{abbreviate(outcome.failedScopes)}</span>.
      </>,
    );
  }
  if (outcome.containerTruncated || outcome.containerSkippedGroups > 0) {
    notes.push(
      <>
        Container image results are partial
        {outcome.containerSkippedGroups > 0 ? ` — only the first ${CONTAINER_GROUP_LIMIT} top-level groups were searched` : ""}
        {outcome.containerTruncated ? " — some groups have more than 100 image repositories" : ""}. Images in personal namespaces
        aren&apos;t included.
      </>,
    );
  }
  if (outcome.containerFailedScopes.length) {
    notes.push(
      <>
        Couldn&apos;t list container images in: <span className="font-mono">{abbreviate(outcome.containerFailedScopes)}</span>.
      </>,
    );
  }
  if (!notes.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {notes.map((n, i) => (
        <p key={i} className="flex gap-2 rounded-lg border border-info/20 bg-info-soft px-3 py-2 text-[13px] text-info">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{n}</span>
        </p>
      ))}
    </div>
  );
}

function abbreviate(list: string[], n = 5) {
  return list.length > n ? `${list.slice(0, n).join(", ")} +${list.length - n} more` : list.join(", ");
}

function noResultsHint(parsed: ParsedQuery, state: SearchState): React.ReactNode {
  if (state.type.length || state.project.length) return "Nothing matches the selected filters. Clear them to see all results.";
  if (parsed.mode === "checksum")
    return `No file among the ${CHECKSUM_SCAN_LIMIT} most recent packages has this checksum. It may belong to an older package, or to one you can't access.`;
  if (parsed.mode === "version") return "The package exists in no version matching that filter, or you don't have access to it. Try a shorter version prefix.";
  return "Try a shorter part of the name (GitLab matches substrings), drop qualifiers, or check that you have access to the project.";
}

/* ----------------------------------------------------------------------------------------------- */

/** Syntax examples, built from a real package when one is available so they return results. */
function tips(sample: GitLabPackage | undefined): { q: string; text: string }[] {
  const name = sample?.name ?? "my-lib";
  const fragment = name.split(/[/:]/).pop()?.slice(0, 12) || name;
  const major = (sample?.version ?? "1.0").split(".")[0] || "1";
  const group = sample?.project_path?.split("/")[0] ?? "backend";
  const format = sample?.package_type ?? "npm";
  return [
    { q: fragment, text: `Package names and container images containing “${fragment}”` },
    { q: `${name}@${major}`, text: `Versions of ${name} starting with ${major}` },
    { q: `${name} version:>=${major}.0`, text: `Versions at or above ${major}.0` },
    { q: `format:${format}`, text: "Newest packages of one format (npm, maven, pypi, helm, container…)" },
    { q: `${fragment} group:${group}`, text: "Only inside a group or project path" },
    { q: "sha256:e3b0c44298fc", text: "Find the package that contains a file (by SHA-256, SHA-1 or MD5 prefix)" },
  ];
}

async function EmptyQuery() {
  let recent: GitLabPackage[] = [];
  let error: unknown = null;
  try {
    recent = await recentPackages(8);
  } catch (e) {
    error = e;
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 className="text-base font-semibold">Search syntax</h2>
        <ul className="flex flex-col divide-y">
          {tips(recent[0]).map((t) => (
            <li key={t.q} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3">
              <Link href={routes.search(t.q)} className="w-fit shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground hover:bg-accent hover:text-accent-foreground">
                {t.q}
              </Link>
              <span className="text-[13px] text-muted-foreground">{t.text}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          A bare 32/40/64-character hex string is treated as an MD5/SHA-1/SHA-256 checksum.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 className="text-base font-semibold">Recently published</h2>
        {error ? (
          <ErrorState error={error} />
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No packages published in the groups and projects you can access yet.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {recent.map((p) => (
              <li key={p.id} className="py-2 first:pt-0 last:pb-0">
                <Link href={p.project_id ? routes.package(p.project_id, p.id) : routes.search(p.name)} className="group flex items-center gap-3">
                  <FormatTile type={p.package_type} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-mono text-sm font-medium group-hover:text-primary">{p.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.version}</span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {p.project_path ?? "—"} · {timeAgo(p.created_at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
