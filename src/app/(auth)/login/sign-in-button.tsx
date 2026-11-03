"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function GitLabMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="#FC6D26" className={cn("size-5 shrink-0", className)}>
      <path d="M12 21.4 15.7 10H8.3L12 21.4zM12 21.4 8.3 10H3.1L12 21.4zM3.1 10l-1.1 3.4c-.1.3 0 .7.3.9L12 21.4 3.1 10zM3.1 10h5.2L6.1 3.1c-.1-.4-.6-.4-.7 0L3.1 10zM12 21.4 15.7 10h5.2L12 21.4zM20.9 10l1.1 3.4c.1.3 0 .7-.3.9L12 21.4 20.9 10zM20.9 10h-5.2l2.2-6.9c.1-.4.6-.4.7 0l2.3 6.9z" />
    </svg>
  );
}

/** Plain link to the OAuth start URL (works without JS); shows a spinner once clicked. */
export function SignInButton({ href }: { href: string }) {
  const [pending, setPending] = useState(false);

  // Reset the spinner when the page is restored from the back/forward cache.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) setPending(false);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    <a
      href={href}
      aria-disabled={pending || undefined}
      onClick={(e) => {
        if (pending) {
          e.preventDefault();
          return;
        }
        setPending(true);
      }}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2.5 rounded-[10px] bg-foreground text-[15px] font-medium text-background transition-opacity outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50",
        pending && "cursor-progress opacity-80",
      )}
    >
      {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <GitLabMark />}
      {pending ? "Redirecting to GitLab…" : "Sign in with GitLab"}
    </a>
  );
}
