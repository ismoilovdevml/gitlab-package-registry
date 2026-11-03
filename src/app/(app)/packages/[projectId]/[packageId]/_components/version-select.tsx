"use client";

import { useRouter } from "next/navigation";
import { routes } from "@/lib/routes";

export function VersionSelect({
  projectId,
  currentId,
  versions,
}: {
  projectId: number;
  currentId: number;
  versions: { id: number; version: string; tags: string[] }[];
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
      Version
      <select
        value={String(currentId)}
        onChange={(e) => router.push(routes.package(projectId, Number(e.target.value)))}
        className="h-9 max-w-[220px] rounded-lg border border-border bg-card px-2.5 font-mono text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-input dark:bg-input/30"
      >
        {versions.map((v) => (
          <option key={v.id} value={String(v.id)}>
            {v.version}
            {v.tags.length > 0 ? ` · ${v.tags.join(", ")}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
