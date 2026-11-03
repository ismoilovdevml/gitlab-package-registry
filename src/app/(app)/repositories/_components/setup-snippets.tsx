"use client";

import { useState } from "react";
import { SnippetTabs } from "@/components/ombor/code-block";
import { FormatBadge } from "@/components/ombor/format-badge";
import type { Snippet } from "@/lib/gitlab/install-commands";
import { cn } from "@/lib/utils";

/** Format picker + the setup snippets for the chosen format. */
export function SetupSnippets({ groups }: { groups: { format: string; snippets: Snippet[] }[] }) {
  const [active, setActive] = useState(0);
  if (groups.length === 0) return null;
  const current = groups[Math.min(active, groups.length - 1)];
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Package format" className="flex flex-wrap gap-1.5">
        {groups.map((g, i) => (
          <button
            key={g.format}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn(
              "rounded-lg border p-1 transition-colors",
              i === active ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:bg-muted",
            )}
          >
            <FormatBadge type={g.format} />
          </button>
        ))}
      </div>
      <SnippetTabs key={current.format} snippets={current.snippets} />
    </div>
  );
}
