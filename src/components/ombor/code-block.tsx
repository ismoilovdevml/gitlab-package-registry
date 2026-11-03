"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Snippet } from "@/lib/gitlab/install-commands";
import { CopyButton } from "./copy-button";

export function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <div className={cn("relative rounded-lg bg-[#0B1220] text-[#E6EAF0] dark:bg-black/40", className)}>
      <pre className="overflow-x-auto p-4 pr-12 font-mono text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} className="absolute top-2 right-2 text-[#8D98A9] hover:bg-white/10 hover:text-white" />
    </div>
  );
}

/** Tabbed set of snippets (e.g. npm / pnpm / yarn). */
export function SnippetTabs({ snippets, className }: { snippets: Snippet[]; className?: string }) {
  const [active, setActive] = useState(0);
  if (snippets.length === 0) return null;
  const current = snippets[Math.min(active, snippets.length - 1)];
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {snippets.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-1">
          {snippets.map((s, i) => (
            <button
              key={s.label}
              role="tab"
              type="button"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn(
                "h-8 rounded-md px-3 text-[13px] font-medium transition-colors",
                i === active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <CodeBlock code={current.code} />
    </div>
  );
}
