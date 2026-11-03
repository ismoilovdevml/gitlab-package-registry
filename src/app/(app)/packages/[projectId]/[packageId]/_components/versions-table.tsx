import Link from "next/link";
import { StatusBadge, packageStatusTone } from "@/components/ombor/status-badge";
import type { GitLabPackage } from "@/lib/gitlab/types";
import { formatDateTime, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { DeletePackageButton } from "./delete-package-button";
import { PipelineLink } from "./pipeline-link";
import { packageStatusLabel } from "./status";

export function VersionsTable({
  projectId,
  currentId,
  versions,
  canDelete,
  compact = false,
}: {
  projectId: number;
  currentId: number;
  versions: GitLabPackage[];
  canDelete: boolean;
  /** Compact = the "Recent versions" card on the overview (no status / actions columns). */
  compact?: boolean;
}) {
  const showActions = canDelete && !compact;
  const edge = compact ? "px-5 sm:px-[22px]" : "px-4";
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-[13px]", compact ? "min-w-[480px]" : "min-w-[760px]")}>
        <thead>
          <tr className="bg-muted/50 text-left text-muted-foreground">
            <th className={cn("border-y py-2.5 font-medium", edge)}>Version</th>
            <th className="border-y px-3 py-2.5 font-medium">Tags</th>
            <th className="border-y px-3 py-2.5 font-medium">Pipeline</th>
            {!compact && <th className="border-y px-3 py-2.5 font-medium">Status</th>}
            {!compact && <th className="border-y px-3 py-2.5 font-medium">Last downloaded</th>}
            <th className={cn("border-y py-2.5 text-right font-medium", showActions ? "px-3" : edge)}>Published</th>
            {showActions && (
              <th className="border-y px-4 py-2.5 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => {
            const current = v.id === currentId;
            return (
              <tr key={v.id} className={cn("border-b last:border-0", current && "bg-accent/40")}>
                <td className={cn("py-3", edge)}>
                  <div className="flex items-center gap-2">
                    {current ? (
                      <span className="font-mono font-medium">{v.version}</span>
                    ) : (
                      <Link href={routes.package(projectId, v.id)} className="font-mono font-medium text-primary hover:underline">
                        {v.version}
                      </Link>
                    )}
                    {current && <StatusBadge tone="info">current</StatusBadge>}
                  </div>
                </td>
                <td className="px-3 py-3">
                  {v.tags && v.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {v.tags.map((t) => (
                        <span key={t.name} className="rounded-full bg-info-soft px-2 py-0.5 text-xs text-info">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <PipelineLink pipeline={v.pipeline ?? v.pipelines?.[0]} />
                </td>
                {!compact && (
                  <td className="px-3 py-3">
                    <StatusBadge tone={packageStatusTone(v.status)}>{packageStatusLabel(v.status)}</StatusBadge>
                  </td>
                )}
                {!compact && (
                  <td
                    className="px-3 py-3 whitespace-nowrap text-muted-foreground"
                    title={v.last_downloaded_at ? formatDateTime(v.last_downloaded_at) : undefined}
                  >
                    {v.last_downloaded_at ? timeAgo(v.last_downloaded_at) : "Never"}
                  </td>
                )}
                <td
                  className={cn("py-3 text-right whitespace-nowrap text-muted-foreground", showActions ? "px-3" : edge)}
                  title={formatDateTime(v.created_at)}
                >
                  {timeAgo(v.created_at)}
                </td>
                {showActions && (
                  <td className="px-4 py-3 text-right">
                    <DeletePackageButton
                      compact
                      projectId={projectId}
                      packageId={v.id}
                      name={v.name}
                      version={v.version}
                      isCurrent={current}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
