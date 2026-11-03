"use client";

// `buttonVariants` lives in a "use client" module, so it can't be called from Server Components.
// This wrapper lets server-rendered pages render links styled as buttons.

import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LinkButton({
  href,
  external = false,
  variant = "outline",
  size = "lg",
  className,
  title,
  children,
}: {
  href: string;
  external?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
} & VariantProps<typeof buttonVariants>) {
  const cls = cn(buttonVariants({ variant, size }), className);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={title} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} title={title} className={cls}>
      {children}
    </Link>
  );
}
