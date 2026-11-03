"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, FolderGit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { routes } from "@/lib/routes";
import { searchMemberProjects, type ProjectOption } from "./actions";

export function ProjectPicker({
  selected,
  initialOptions,
  format,
}: {
  selected: ProjectOption | null;
  initialOptions: ProjectOption[];
  format: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ProjectOption[]>(initialOptions);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  function onQueryChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    const id = ++latest.current; // invalidates any in-flight search
    if (q.length === 1) {
      // Too short for a server search; keep the current list.
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const res = await searchMemberProjects(q).catch(() => ({ ok: false as const, error: "Search failed. Try again." }));
      if (id !== latest.current) return;
      setSearching(false);
      if (res.ok) {
        setOptions(res.projects);
        setError(null);
      } else {
        setError(res.error);
      }
    }, 250);
  }

  function choose(p: ProjectOption) {
    setOpen(false);
    if (p.id === selected?.id) return;
    const params = new URLSearchParams({ format, project: String(p.id) });
    startNavigation(() => router.push(`${routes.clientSetup}?${params}`, { scroll: false }));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="lg"
            className="h-10 w-full justify-between gap-2 px-3 font-normal sm:w-[360px]"
            aria-label={selected ? `Project: ${selected.pathWithNamespace}. Change project` : "Choose a project"}
          />
        }
      >
        {navigating ? <Loader2 className="animate-spin text-muted-foreground" /> : <FolderGit2 className="text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-left">{selected ? selected.pathWithNamespace : "Choose a project"}</span>
        <ChevronsUpDown className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(420px,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search your projects…" value={query} onValueChange={onQueryChange} aria-label="Search projects" />
          <CommandList>
            {searching && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Searching…
              </div>
            )}
            {error && <p className="px-3 py-2 text-xs text-destructive">{error}</p>}
            {!searching && <CommandEmpty>No matching projects.</CommandEmpty>}
            <CommandGroup heading={query.trim().length > 1 ? "Results" : "Recently active"}>
              {options.map((p) => (
                <CommandItem key={p.id} value={String(p.id)} onSelect={() => choose(p)} data-checked={p.id === selected?.id}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{p.pathWithNamespace}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
