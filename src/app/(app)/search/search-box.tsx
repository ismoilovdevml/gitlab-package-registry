"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { searchHref, type SearchState } from "@/lib/search/query";

const EXAMPLES: { label: string; insert: string; title: string }[] = [
  { label: "format:npm", insert: "format:npm", title: "Only npm packages" },
  { label: "group:backend", insert: "group:", title: "Limit to a group or project path" },
  { label: "name@1.2", insert: "@", title: "A package at a version (prefix)" },
  { label: "version:>=2.0", insert: "version:>=", title: "Version comparison" },
  { label: "sha256:e3b0c4…", insert: "sha256:", title: "Find the package that contains a file" },
];

export function SearchBox({ state }: { state: SearchState }) {
  const router = useRouter();
  const [q, setQ] = useState(state.q);
  const inputRef = useRef<HTMLInputElement>(null);

  function insert(text: string) {
    const base = q.trimEnd();
    const next = text === "@" ? `${base || "name"}@` : `${base ? `${base} ` : ""}${text}`;
    setQ(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(searchHref(state, { q: q.trim(), page: 1 }));
        }}
        className="flex h-14 items-center gap-3 rounded-xl border-2 border-primary bg-card px-4 text-primary focus-within:ring-3 focus-within:ring-ring/25 sm:px-[18px]"
      >
        <Search className="size-5 shrink-0" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          name="q"
          aria-label="Search the registry"
          autoFocus={!state.q}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Package name, name@version, or a sha256…"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-base text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
        >
          Enter <CornerDownLeft className="size-3.5" aria-hidden />
        </button>
        <button type="submit" aria-label="Search" className="rounded-md p-1 text-muted-foreground hover:text-foreground sm:hidden">
          <CornerDownLeft className="size-4" aria-hidden />
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <span>Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            title={ex.title}
            onClick={() => insert(ex.insert)}
            className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}
