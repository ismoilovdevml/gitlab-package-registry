import { ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/ombor/status-badge";
import type { GitLabPipelineRef } from "@/lib/gitlab/types";
import { formatDateTime, shortSha, timeAgo } from "@/lib/format";
import { pipelineStatusTone } from "./status";

export function PipelinesTable({ pipelines }: { pipelines: GitLabPipelineRef[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-muted/50 text-left text-muted-foreground">
            <th className="border-y px-4 py-2.5 font-medium">Pipeline</th>
            <th className="border-y px-3 py-2.5 font-medium">Ref</th>
            <th className="border-y px-3 py-2.5 font-medium">Commit</th>
            <th className="border-y px-3 py-2.5 font-medium">Status</th>
            <th className="border-y px-3 py-2.5 font-medium">Triggered by</th>
            <th className="border-y px-4 py-2.5 text-right font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {pipelines.map((p) => (
            <tr key={p.id} className="border-b last:border-0">
              <td className="px-4 py-3 whitespace-nowrap">
                {p.web_url ? (
                  <a
                    href={p.web_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    #{p.id}
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  <span className="font-medium">#{p.id}</span>
                )}
                {p.iid !== undefined && <span className="ml-2 text-muted-foreground">iid {p.iid}</span>}
              </td>
              <td className="max-w-[220px] truncate px-3 py-3 font-mono" title={p.ref}>
                {p.ref}
              </td>
              <td className="px-3 py-3 font-mono text-muted-foreground" title={p.sha}>
                {shortSha(p.sha, 8)}
              </td>
              <td className="px-3 py-3">
                <StatusBadge tone={pipelineStatusTone(p.status)} dot>
                  {p.status}
                </StatusBadge>
              </td>
              <td className="px-3 py-3">
                {p.user ? (
                  <span className="flex flex-col">
                    <span className="font-medium">{p.user.name}</span>
                    <span className="text-xs text-muted-foreground">@{p.user.username}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground" title={formatDateTime(p.created_at)}>
                {timeAgo(p.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
