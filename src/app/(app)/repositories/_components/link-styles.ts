// Button-like classes for <Link>/<a> in Server Components.
// (`buttonVariants` lives in a "use client" module and cannot be called from the server.)
export const linkButton =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0";

export const linkButtonGhost =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary whitespace-nowrap transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 outline-none [&_svg]:size-4";
