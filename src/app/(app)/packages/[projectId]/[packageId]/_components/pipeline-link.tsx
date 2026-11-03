import type { GitLabPipelineRef } from "@/lib/gitlab/types";
import { cn } from "@/lib/utils";
import { pipelineStatusTone, TONE_DOT } from "./status";

/** Status dot + "#id", linking to the pipeline in GitLab when a URL is known. */
export function PipelineLink({ pipeline, className }: { pipeline: GitLabPipelineRef | null | undefined; className?: string }) {
  if (!pipeline) return <span className="text-muted-foreground">—</span>;
  const dot = (
    <span
      className={cn("size-2 shrink-0 rounded-full", TONE_DOT[pipelineStatusTone(pipeline.status)])}
      aria-hidden
    />
  );
  const label = `#${pipeline.id}`;
  const title = pipeline.status ? `Pipeline ${label}: ${pipeline.status}` : undefined;
  if (pipeline.web_url) {
    return (
      <a
        href={pipeline.web_url}
        target="_blank"
        rel="noreferrer"
        title={title}
        className={cn("inline-flex items-center gap-1.5 font-medium text-primary hover:underline", className)}
      >
        {dot}
        {label}
      </a>
    );
  }
  return (
    <span title={title} className={cn("inline-flex items-center gap-1.5", className)}>
      {dot}
      {label}
    </span>
  );
}
