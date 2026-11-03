"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { getFormat, PACKAGE_TYPES } from "@/lib/gitlab/formats";
import { cn } from "@/lib/utils";
import { SORT_OPTIONS, STATUS_OPTIONS } from "./filters";

type ParamUpdate = Record<string, string | null>;

const FiltersContext = createContext<{ update: (u: ParamUpdate) => void; pending: boolean }>({
  update: () => {},
  pending: false,
});

/** Shares one URL updater + pending flag between all filter controls and the results table. */
export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function update(u: ParamUpdate) {
    // Read the live URL so debounced callbacks never resurrect stale params.
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(u)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    // Any filter change starts from page 1.
    if (!("page" in u)) params.delete("page");
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return <FiltersContext.Provider value={{ update, pending }}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  return useContext(FiltersContext);
}

/** Dims its children while a filter navigation is in flight. */
export function PendingRegion({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFilters();
  return (
    <div aria-busy={pending} className={cn("transition-opacity", pending && "pointer-events-none opacity-60", className)}>
      {children}
    </div>
  );
}

const chipBase =
  "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function FormatChips({ active, count }: { active: string; count: number | null }) {
  const { update } = useFilters();
  const chips = [{ key: "", label: "All formats" }, ...PACKAGE_TYPES.map((t) => ({ key: t, label: getFormat(t).label }))];
  return (
    <div role="group" aria-label="Filter by format" className="flex flex-wrap gap-2">
      {chips.map((c) => {
        const on = c.key === active;
        return (
          <button
            key={c.key || "all"}
            type="button"
            aria-pressed={on}
            onClick={() => update({ type: c.key || null })}
            className={cn(
              chipBase,
              on
                ? "border-foreground bg-foreground text-background"
                : "border-input bg-card text-foreground hover:bg-muted",
            )}
          >
            {c.label}
            {on && count !== null && <span className="font-mono text-[11px] opacity-80">{count.toLocaleString("en-US")}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({ value: q }: { value: string }) {
  const { update, pending } = useFilters();
  const [value, setValue] = useState(q);
  const [synced, setSynced] = useState(q);
  const [lastPushed, setLastPushed] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt URL changes we didn't make ourselves (clear-filters link, back button).
  if (q !== synced) {
    setSynced(q);
    if (q !== lastPushed) setValue(q);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function push(next: string) {
    setLastPushed(next.trim());
    update({ q: next.trim() || null });
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), 350);
  }

  return (
    <label className="flex h-[38px] min-w-0 flex-[1_1_240px] items-center gap-2 rounded-lg border border-input bg-card px-3 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      {pending ? <Loader2 className="size-[15px] shrink-0 animate-spin" /> : <Search className="size-[15px] shrink-0" />}
      <input
        type="search"
        aria-label="Filter by name"
        placeholder="Filter by name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (timer.current) clearTimeout(timer.current);
            push(value);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          className="rounded p-0.5 hover:text-foreground"
          onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            setValue("");
            push("");
          }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </label>
  );
}

const selectClass =
  "h-[38px] rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SortSelect({ value }: { value: string }) {
  const { update } = useFilters();
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
      Sort
      <select
        value={value}
        onChange={(e) => update({ sort: e.target.value === "newest" ? null : e.target.value })}
        className={selectClass}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const legendClass = "mb-2.5 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase";
const radioRow = "flex cursor-pointer items-center gap-2 text-sm";
const radioInput = "size-4 shrink-0 accent-primary";

export interface ScopeOption {
  kind: "group" | "project";
  id: number;
  path: string;
}

export function FilterSidebar({
  status,
  scopes,
  activeScope,
  hasFilters,
}: {
  status: string;
  scopes: ScopeOption[];
  activeScope: { kind: "group" | "project"; id: number } | null;
  hasFilters: boolean;
}) {
  const { update } = useFilters();
  const scopeValue = activeScope ? `${activeScope.kind}:${activeScope.id}` : "";

  function setScope(v: string) {
    const [kind, id] = v.split(":");
    update({ group: kind === "group" ? id : null, project: kind === "project" ? id : null });
  }

  return (
    <aside
      aria-label="Filters"
      className="flex w-full flex-col gap-5 rounded-xl border bg-card p-[18px] lg:sticky lg:top-6 lg:w-[240px] lg:shrink-0"
    >
      <fieldset className="flex min-w-0 flex-col">
        <legend className={legendClass}>Scope</legend>
        <div className="-mr-2 flex max-h-64 flex-col gap-2.5 overflow-y-auto pr-2">
          <label className={radioRow}>
            <input type="radio" name="scope" className={radioInput} checked={scopeValue === ""} onChange={() => setScope("")} />
            All projects
          </label>
          {scopes.map((s) => {
            const v = `${s.kind}:${s.id}`;
            return (
              <label key={v} className={radioRow} title={s.path}>
                <input type="radio" name="scope" className={radioInput} checked={scopeValue === v} onChange={() => setScope(v)} />
                <span className="min-w-0 truncate">{s.path}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{s.kind === "group" ? "group" : "project"}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className={legendClass}>Status</legend>
        {STATUS_OPTIONS.map((o) => (
          <label key={o.value || "any"} className={radioRow}>
            <input
              type="radio"
              name="status"
              className={radioInput}
              checked={status === o.value}
              onChange={() => update({ status: o.value || null })}
            />
            {o.label}
          </label>
        ))}
      </fieldset>

      {hasFilters && (
        <Link href="/packages" className="text-left text-sm font-medium text-primary hover:underline">
          Clear all filters
        </Link>
      )}
    </aside>
  );
}
