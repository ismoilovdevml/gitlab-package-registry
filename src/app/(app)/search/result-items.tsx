import Link from "next/link";
import { Box, FileText } from "lucide-react";
import { StatusBadge, packageStatusTone } from "@/components/ombor/status-badge";
import { getFormat } from "@/lib/gitlab/formats";
import type { GitLabPackage } from "@/lib/gitlab/types";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { highlight } from "@/lib/search/query";
import type { ChecksumMatch, ContainerHit } from "@/lib/search";
import type { PackageGroup } from "@/lib/search/results";
import { cn } from "@/lib/utils";

const TILE: Record<string, string> = {
  maven: "MVN",
  pypi: "PYPI",
  nuget: "NUGET",
  golang: "GO",
  composer: "PHP",
  conan: "CONAN",
  helm: "HELM",
  generic: "GEN",
  debian: "DEB",
  rubygems: "GEM",
  terraform_module: "TF",
  ml_model: "ML",
  container: "OCI",
  npm: "NPM",
};

export function FormatTile({ type }: { type: string }) {
  const f = getFormat(type);
  return (
    <span
      title={f.label}
      className={cn("flex size-10 flex-none items-center justify-center rounded-[10px] text-[10px] font-bold tracking-wide", f.badge)}
    >
      {TILE[type] ?? type.slice(0, 4).toUpperCase()}
    </span>
  );
}

export function Highlight({ text, needle }: { text: string; needle: string }) {
  return (
    <>
      {highlight(text, needle).map((s, i) =>
        s.match ? (
          <mark key={i} className="rounded-[3px] bg-yellow-200/80 px-0.5 text-foreground dark:bg-yellow-400/30">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

const card = "relative flex gap-3.5 rounded-xl border bg-card px-4 py-4 transition-colors hover:border-primary/40 sm:px-[18px]";
// Stretches the primary link over the whole card; secondary links sit above it with `relative z-10`.
const stretched = "after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50";

function Meta({ children }: { children: React.ReactNode }) {
  return <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">{children}</span>;
}

function NameLine({ name, needle, version, status, href }: { name: string; needle: string; version: string; status?: string; href: string | null }) {
  const label = (
    <span className="font-mono text-sm font-medium break-all">
      <Highlight text={name} needle={needle} />
    </span>
  );
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {href ? (
        <Link href={href} className={cn("text-foreground hover:text-primary", stretched)}>
          {label}
        </Link>
      ) : (
        label
      )}
      {version && <span className="font-mono text-xs text-muted-foreground">{version}</span>}
      {status && status !== "default" && <StatusBadge tone={packageStatusTone(status)}>{status.replace("_", " ")}</StatusBadge>}
    </span>
  );
}

function href(p: GitLabPackage) {
  return p.project_id ? routes.package(p.project_id, p.id) : null;
}

const MAX_VERSION_CHIPS = 6;

export function PackageResult({ group, needle }: { group: PackageGroup; needle: string }) {
  const { latest, versions } = group;
  const more = versions.length - MAX_VERSION_CHIPS;
  return (
    <article className={card}>
      <FormatTile type={group.packageType} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <NameLine name={group.name} needle={needle} version={latest.version} status={latest.status} href={href(latest)} />
        {versions.length > 1 && (
          <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
            <span>{versions.length} matching versions:</span>
            {versions.slice(0, MAX_VERSION_CHIPS).map((v) => {
              const h = href(v);
              const cls = "relative z-10 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground";
              return h ? (
                <Link key={v.id} href={h} className={cn(cls, "hover:bg-accent hover:text-accent-foreground")}>
                  {v.version || "—"}
                </Link>
              ) : (
                <span key={v.id} className={cls}>
                  {v.version || "—"}
                </span>
              );
            })}
            {more > 0 && <span>+{more} more</span>}
          </span>
        )}
        <Meta>
          <span className="break-all">{group.projectPath}</span>
          <span>{getFormat(group.packageType).label}</span>
          <span title={formatDateTime(latest.created_at)}>Published {timeAgo(latest.created_at)}</span>
          {latest.last_downloaded_at && <span>Last downloaded {timeAgo(latest.last_downloaded_at)}</span>}
        </Meta>
      </div>
    </article>
  );
}

export function ChecksumResult({ match }: { match: ChecksumMatch }) {
  const { pkg, file } = match;
  return (
    <article className={card}>
      <FormatTile type={pkg.package_type} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <NameLine name={pkg.name} needle="" version={pkg.version} status={pkg.status} href={href(pkg)} />
        <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-mono break-all">{file.file_name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
        </span>
        <span className="font-mono text-xs break-all text-muted-foreground">
          {match.algo}: <span className="text-foreground">{match.hash}</span>
        </span>
        <Meta>
          <span className="break-all">{pkg.project_path ?? "—"}</span>
          <span title={formatDateTime(file.created_at)}>Uploaded {timeAgo(file.created_at)}</span>
        </Meta>
      </div>
    </article>
  );
}

export function ContainerResult({ hit, needle }: { hit: ContainerHit; needle: string }) {
  const { repo } = hit;
  return (
    <article className={card}>
      <FormatTile type="container" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <NameLine
          name={repo.path}
          needle={needle}
          version={repo.tags_count !== undefined ? `${repo.tags_count} tags` : ""}
          href={routes.containerRepository(repo.project_id, repo.id)}
        />
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <Box className="size-3.5 shrink-0" aria-hidden />
          <span className="font-mono text-xs break-all">{repo.location}</span>
        </span>
        <Meta>
          <span className="break-all">{hit.projectPath}</span>
          <span title={formatDateTime(repo.created_at)}>Created {timeAgo(repo.created_at)}</span>
        </Meta>
      </div>
    </article>
  );
}
