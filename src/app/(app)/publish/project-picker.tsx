"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronsUpDown, FolderGit2, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { ProjectOption } from "@/lib/publish/types";
import { searchPublishProjects } from "./actions";

export function ProjectPicker({
  id,
  value,
  onChange,
  initialProjects,
  initialError,
  disabled,
}: {
  id?: string;
  value: ProjectOption | null;
  onChange: (project: ProjectOption) => void;
  initialProjects: ProjectOption[];
  initialError: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProjectOption[]>(initialProjects);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function onQueryChange(next: string) {
    setQuery(next);
    if (timer.current) clearTimeout(timer.current);
    const q = next.trim();
    const current = ++requestId.current;
    if (!q) {
      setResults(initialProjects);
      setError(initialError);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchPublishProjects(q);
        if (current !== requestId.current) return;
        if (res.ok) {
          setResults(res.projects);
          setError(null);
        } else {
          setResults([]);
          setError(res.error);
        }
      });
    }, 250);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-label="Target project"
        className={cn(
          "flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        )}
      >
        <FolderGit2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate", value ? "font-mono" : "text-muted-foreground")}>
          {value ? value.pathWithNamespace : "Select a project…"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-[min(20rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search projects…" value={query} onValueChange={onQueryChange} aria-label="Search projects" />
          <CommandList>
            {pending && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Searching…
              </div>
            )}
            {error ? (
              <p role="alert" className="px-3 py-4 text-sm text-destructive">
                {error}
              </p>
            ) : (
              <CommandEmpty>{pending ? "Searching…" : "No projects where you have the Developer role."}</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup heading={query.trim() ? "Matching projects" : "Recently active"}>
                {results.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={String(p.id)}
                    data-checked={value?.id === p.id}
                    onSelect={() => {
                      onChange(p);
                      setOpen(false);
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">{p.pathWithNamespace}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Only projects where you have the Developer role or higher. Showing up to 20.
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
