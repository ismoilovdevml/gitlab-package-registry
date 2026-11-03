"use client";

import { useRouter } from "next/navigation";
import { searchHref, SORT_KEYS, type SearchState, type SortKey } from "@/lib/search/query";

const LABELS: Record<SortKey, string> = { relevance: "Best match", newest: "Newest", name: "Name" };

export function SortSelect({ state }: { state: SearchState }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      Sort
      <select
        value={state.sort}
        onChange={(e) => router.push(searchHref(state, { sort: e.target.value as SortKey, page: 1 }))}
        className="h-[34px] rounded-lg border border-input bg-card px-2 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {SORT_KEYS.map((k) => (
          <option key={k} value={k}>
            {LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
}
