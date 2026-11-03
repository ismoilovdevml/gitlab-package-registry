"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyButton({ text, className, label = "Copy" }: { text: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context; fall back for plain-http deployments.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={copied ? "Copied" : label} className={cn("text-muted-foreground", className)} onClick={copy}>
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}
