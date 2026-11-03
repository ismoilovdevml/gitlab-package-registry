"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

export interface FilterOption {
  value: string;
  label: string;
}

export function FindingsFilters({
  severity,
  check,
  severityOptions,
  checkOptions,
}: {
  severity?: string;
  check?: string;
  severityOptions: FilterOption[];
  checkOptions: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: "severity" | "check", value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL) params.delete(key);
    else params.set(key, value);
    params.delete("page");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const sevItems = [{ value: ALL, label: "All severities" }, ...severityOptions];
  const checkItems = [{ value: ALL, label: "All checks" }, ...checkOptions];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
      <Select items={sevItems} value={severity ?? ALL} onValueChange={(v) => update("severity", v as string | null)}>
        <SelectTrigger aria-label="Severity" className="h-9 min-w-36 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sevItems.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select items={checkItems} value={check ?? ALL} onValueChange={(v) => update("check", v as string | null)}>
        <SelectTrigger aria-label="Check" className="h-9 min-w-36 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {checkItems.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
