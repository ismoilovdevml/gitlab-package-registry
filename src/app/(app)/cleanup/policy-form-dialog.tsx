"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FORMATS, PACKAGE_TYPES } from "@/lib/gitlab/formats";
import { describePolicy, MAX_PATTERN_LENGTH, patternError } from "@/lib/cleanup/shared";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { createPolicyAction, searchProjectsAction, updatePolicyAction, type PolicyInput } from "./actions";
import type { PolicyView } from "./types";

const selectClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function NewPolicyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-10 px-4">
        <Plus />
        New policy
      </Button>
      <PolicyFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function toInt(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

export function PolicyFormDialog({
  open,
  onOpenChange,
  policy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy?: PolicyView;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{policy ? "Edit cleanup policy" : "New cleanup policy"}</DialogTitle>
          <DialogDescription>
            Deletes package versions in one project. Versions still processing are never deleted.
          </DialogDescription>
        </DialogHeader>
        {/* Remount on open so the form starts from the policy's current values. */}
        {open && <PolicyForm policy={policy} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PolicyForm({ policy, onDone }: { policy?: PolicyView; onDone: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(policy?.name ?? "");
  const [project, setProject] = useState<{ id: number; path: string } | null>(
    policy ? { id: policy.projectId, path: policy.projectPath } : null,
  );
  const [packageType, setPackageType] = useState(policy?.packageType ?? "");
  const [namePattern, setNamePattern] = useState(policy?.namePattern ?? "");
  const [keepLatest, setKeepLatest] = useState(policy?.keepLatest?.toString() ?? (policy ? "" : "5"));
  const [olderThanDays, setOlderThanDays] = useState(policy?.olderThanDays?.toString() ?? (policy ? "" : "30"));
  const [dryRun, setDryRun] = useState(policy?.dryRun ?? true);
  const [enabled, setEnabled] = useState(policy?.enabled ?? true);

  const patternErr = patternError(namePattern.trim() || null);
  const keepN = toInt(keepLatest);
  const olderN = toInt(olderThanDays);
  const summary =
    !Number.isNaN(keepN) && !Number.isNaN(olderN) && (keepN || olderN)
      ? describePolicy({ packageType: packageType || null, namePattern: namePattern.trim() || null, keepLatest: keepN, olderThanDays: olderN })
      : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!project) return setError("Choose a project.");
    if (Number.isNaN(keepN) || Number.isNaN(olderN)) return setError("Numbers must be whole numbers.");
    if (keepN === null && olderN === null) return setError("Set 'keep latest' and/or 'older than days'.");
    if (patternErr) return setError(patternErr);

    const input: PolicyInput = {
      name,
      projectId: project.id,
      packageType: (packageType || null) as PolicyInput["packageType"],
      namePattern: namePattern.trim() || null,
      keepLatest: keepN,
      olderThanDays: olderN,
      enabled,
      dryRun,
    };
    startTransition(async () => {
      if (policy) {
        const res = await updatePolicyAction(policy.id, input);
        if (!res.ok) return setError(res.error);
        toast.success("Policy updated");
        onDone();
      } else {
        const res = await createPolicyAction(input);
        if (!res.ok) return setError(res.error);
        toast.success("Policy created");
        onDone();
        router.push(`${routes.cleanup}?policy=${res.id}`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-name`}>Name</Label>
        <Input
          id={`${uid}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="npm prereleases"
          maxLength={100}
          required
        />
      </div>

      <ProjectPicker value={project} onChange={setProject} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-type`}>Format</Label>
          <select
            id={`${uid}-type`}
            className={selectClass}
            value={packageType}
            onChange={(e) => setPackageType(e.target.value)}
          >
            <option value="">All formats</option>
            {PACKAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {FORMATS[t].label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-pattern`}>Package name matches (regex)</Label>
          <Input
            id={`${uid}-pattern`}
            value={namePattern}
            onChange={(e) => setNamePattern(e.target.value)}
            placeholder="^@acme/"
            maxLength={MAX_PATTERN_LENGTH}
            className="font-mono"
            aria-invalid={!!patternErr}
            aria-describedby={`${uid}-pattern-help`}
          />
          <p id={`${uid}-pattern-help`} className={cn("text-xs", patternErr ? "text-destructive" : "text-muted-foreground")}>
            {patternErr ?? "Empty = every package name."}
          </p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-xl border p-4">
        <legend className="px-1.5 text-[13px] font-semibold text-success">Always keep</legend>
        <label className="flex flex-wrap items-center gap-2.5 text-sm">
          The latest
          <Input
            type="number"
            min={1}
            max={10000}
            inputMode="numeric"
            value={keepLatest}
            onChange={(e) => setKeepLatest(e.target.value)}
            aria-label="Number of newest versions to keep per package"
            className="h-9 w-20"
          />
          versions of each package
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl border p-4">
        <legend className="px-1.5 text-[13px] font-semibold text-destructive">Delete</legend>
        <label className="flex flex-wrap items-center gap-2.5 text-sm">
          Versions older than
          <Input
            type="number"
            min={1}
            max={36500}
            inputMode="numeric"
            value={olderThanDays}
            onChange={(e) => setOlderThanDays(e.target.value)}
            aria-label="Minimum age in days"
            className="h-9 w-20"
          />
          days
        </label>
        <p className="text-xs text-muted-foreground">
          Leave either field empty to ignore it. With only &quot;keep latest&quot;, every older version is deleted.
        </p>
      </fieldset>

      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <label className="flex items-start justify-between gap-4 text-sm">
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Dry run</span>
            <span className="text-xs text-muted-foreground">Only record what would be deleted. Scheduled runs skip dry-run policies.</span>
          </span>
          <Switch checked={dryRun} onCheckedChange={setDryRun} aria-label="Dry run" />
        </label>
        <label className="flex items-start justify-between gap-4 text-sm">
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Enabled</span>
            <span className="text-xs text-muted-foreground">Disabled policies are never run by the scheduler.</span>
          </span>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enabled" />
        </label>
      </div>

      {summary && (
        <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">Rule: </span>
          {summary}
        </p>
      )}
      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {policy ? "Save policy" : "Create policy"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ProjectPicker({
  value,
  onChange,
}: {
  value: { id: number; path: string } | null;
  onChange: (p: { id: number; path: string }) => void;
}) {
  const uid = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: number; path: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await searchProjectsAction(query);
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setResults(res.projects);
        setError(null);
      } else {
        setResults([]);
        setError(res.error);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${uid}-project`}>Project</Label>
      {value && (
        <p className="text-[13px] text-muted-foreground">
          Selected: <span className="font-mono text-foreground">{value.path}</span>
        </p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={`${uid}-project`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects where you are Maintainer…"
          className="pl-8"
          autoComplete="off"
        />
      </div>
      <div role="listbox" aria-label="Projects" className="max-h-44 overflow-y-auto rounded-lg border">
        {loading && results.length === 0 ? (
          <p className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Searching…
          </p>
        ) : error ? (
          <p className="px-3 py-2.5 text-sm text-destructive">{error}</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-muted-foreground">No projects where you have Maintainer access.</p>
        ) : (
          results.map((p) => {
            const selected = value?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onChange(p)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left font-mono text-[13px] last:border-b-0 hover:bg-muted",
                  selected && "bg-accent text-accent-foreground",
                )}
              >
                <span className="min-w-0 truncate">{p.path}</span>
                {selected && <Check className="size-4 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
