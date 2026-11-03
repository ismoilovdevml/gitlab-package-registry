"use client";

import { SnippetTabs } from "@/components/ombor/code-block";
import { getFormat } from "@/lib/gitlab/formats";
import { CI_FORMATS, getCiPublishSnippets, type CiFormat } from "@/lib/publish/snippets";
import { cn } from "@/lib/utils";

export function CiPanel({ format, onFormatChange }: { format: CiFormat; onFormatChange: (format: CiFormat) => void }) {
  const snippets = getCiPublishSnippets(format);
  const isGo = format === "golang";
  const isContainer = format === "container";

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section className="flex min-w-0 flex-[2_1_520px] flex-col gap-4 rounded-xl border bg-card p-5 sm:p-[22px]">
        <div role="radiogroup" aria-label="Package format" className="flex flex-wrap gap-2">
          {CI_FORMATS.map((f) => {
            const active = f === format;
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onFormatChange(f)}
                className={cn(
                  "h-8 rounded-full px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "bg-foreground text-background" : "border border-input hover:bg-muted",
                )}
              >
                {getFormat(f).label}
              </button>
            );
          })}
        </div>

        <p className="text-[13px] text-muted-foreground">
          {isGo ? (
            "Go modules don't need a publish job: GitLab serves them from the repository's semver tags."
          ) : (
            <>
              Add this job to{" "}
              <code className="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">.gitlab-ci.yml</code>.{" "}
              {isContainer
                ? "It logs in with the predefined CI registry credentials, so no secret is needed."
                : "It authenticates with CI_JOB_TOKEN, so no secret is needed."}
            </>
          )}
        </p>

        <SnippetTabs key={format} snippets={snippets} />
      </section>

      <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5 rounded-xl border bg-card p-5">
        <h2 className="text-[15px] font-semibold">What happens next</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-[18px] text-[13px] leading-normal text-muted-foreground">
          <li>Push a tag such as v1.2.0.</li>
          <li>
            {isGo
              ? "GitLab's Go proxy picks the tag up directly from the repository."
              : isContainer
                ? "The pipeline pushes the image to the project's container registry."
                : "The pipeline publishes to the project's package registry."}
          </li>
          <li>
            Ombor reads straight from GitLab, so it shows up under {isContainer ? "Repositories" : "Packages"} as soon as
            the job finishes.
          </li>
        </ol>
      </aside>
    </div>
  );
}
