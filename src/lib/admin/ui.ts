// Class strings for server-rendered links/selects styled like buttons/inputs.
// (`buttonVariants` lives in a "use client" module and cannot be called from Server Components.)

const base =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0";

export const linkButton = {
  outline: `${base} border-border bg-background hover:bg-muted dark:border-input dark:bg-input/30`,
  primary: `${base} border-transparent bg-foreground text-background hover:bg-foreground/85`,
  ghost: `${base} border-transparent text-muted-foreground hover:bg-muted hover:text-foreground`,
  disabled: "pointer-events-none opacity-50",
};

export const nativeSelect =
  "h-9 min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export const fieldInput =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function initials(nameOrUsername: string | null | undefined): string {
  const s = (nameOrUsername ?? "").trim();
  if (!s) return "?";
  const parts = s.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : s.slice(0, 2);
  return letters.toUpperCase();
}

/** "2026-11-03 10:42:18" in UTC. */
export function utcTimestamp(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

/** Request time for server-rendered relative timestamps (Server Components render once per request). */
export function nowMs(): number {
  return Date.now();
}
