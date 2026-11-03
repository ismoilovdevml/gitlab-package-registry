"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { REPOSITORY_SORTS, repositoriesHref, type RepositoryListParams, type RepositorySort } from "@/lib/repositories/params";

const selectClass =
  "h-[38px] min-w-0 rounded-[9px] border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function RepositoryFilters({
  params,
  groups,
}: {
  params: RepositoryListParams;
  groups: { id: number; fullPath: string }[] | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.q);

  function go(next: Partial<RepositoryListParams>) {
    startTransition(() => router.push(repositoriesHref({ ...params, ...next, page: 1 })));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-[18px] py-3.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {groups && groups.length > 0 && (
          <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Group</span>
            <select
              className={`${selectClass} max-w-[260px]`}
              value={params.group ?? ""}
              onChange={(e) => go({ group: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.fullPath}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="whitespace-nowrap">Sort by</span>
          <select
            className={selectClass}
            value={params.sort}
            onChange={(e) => go({ sort: e.target.value as RepositorySort })}
          >
            {REPOSITORY_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
      </div>
      <form
        role="search"
        className="flex h-[38px] w-full items-center gap-2 rounded-[9px] border border-input px-3 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 sm:w-[300px]"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: q.trim() });
        }}
      >
        <Search className="size-[15px] shrink-0" aria-hidden />
        <input
          type="search"
          aria-label="Filter repositories"
          placeholder="Filter repositories"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value === "" && params.q) go({ q: "" });
          }}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </form>
    </div>
  );
}
