import Link from "next/link";
import { Activity, FolderGit2, HardDrive, Package } from "lucide-react";
import { PageHeader } from "@/components/ombor/page-header";
import { StatCard } from "@/components/ombor/stat-card";
import { ErrorState } from "@/components/ombor/empty-state";
import { getAuthenticatedClient } from "@/lib/dal";
import { errorMessage } from "@/lib/gitlab/errors";
import { formatBytes, formatNumber } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  buildActivity,
  countByFormat,
  getGitLabVersion,
  getPackageActivity,
  getStorageSummary,
  parseRange,
} from "@/lib/overview";
import { ActivityChart, ChartLegend, FormatBreakdown, HealthPanel, LargestProjects, panel, RangeToggle, RecentTable } from "./sections";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

const RECENT_LIMIT = 8;

function plural(n: number, one: string, many = `${one}s`) {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const range = parseRange((await searchParams).range);
  const { session } = await getAuthenticatedClient();

  const [activityRes, storageRes, versionRes] = await Promise.allSettled([
    getPackageActivity(range),
    getStorageSummary(),
    getGitLabVersion(),
  ]);

  const data = activityRes.status === "fulfilled" ? activityRes.value : null;
  const storage = storageRes.status === "fulfilled" ? storageRes.value : null;
  const version = versionRes.status === "fulfilled" ? versionRes.value : null;

  const activity = data ? buildActivity(data.packages, range, data.now) : null;
  const formats = data ? countByFormat(data.packages) : [];

  const subtitleParts: string[] = [];
  if (data) subtitleParts.push(plural(data.groupCount, "GitLab group"));
  if (storage) subtitleParts.push(`${plural(storage.projectsTotal, "project")}${storage.projectsTotalIsLowerBound ? "+" : ""}`);
  const subtitle = subtitleParts.length ? `All registries across ${subtitleParts.join(" and ")}` : "All registries you can access in GitLab";

  const failed = <span className="text-destructive">Couldn&apos;t load from GitLab</span>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description={subtitle} actions={<RangeToggle range={range} />} className="mb-0" />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard
          label="Packages"
          icon={<Package />}
          value={data ? `${formatNumber(data.total)}${data.totalIsLowerBound ? "+" : ""}` : "—"}
          hint={
            data
              ? data.failedScopes.length > 0
                ? `${plural(data.failedScopes.length, "scope")} failed to load`
                : `Name + version records in ${plural(data.groupCount + data.personalProjectCount, "scope")}`
              : failed
          }
          hintTone={data && data.failedScopes.length > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label={`Published · ${range}`}
          icon={<Activity />}
          value={activity ? `${formatNumber(activity.total)}${data?.rangeIncomplete ? "+" : ""}` : "—"}
          hint={activity ? `${formatNumber(activity.ci)} via CI pipeline · ${formatNumber(activity.direct)} direct` : failed}
          hintTone={activity && activity.total > 0 ? "success" : "neutral"}
        />
        <StatCard
          label="Projects with packages"
          icon={<FolderGit2 />}
          value={storage ? formatNumber(storage.projectsWithPackages) : "—"}
          hint={storage ? `of ${formatNumber(storage.projectsWithStats)} projects with visible statistics` : failed}
        />
        <StatCard
          label="Storage used"
          icon={<HardDrive />}
          value={storage ? formatBytes(storage.packagesBytes + storage.registryBytes) : "—"}
          hint={
            storage
              ? `Packages + containers, ${formatNumber(storage.projectsWithStats)} accessible projects${
                  storage.projectsTotal > storage.projectsScanned ? ` (${formatNumber(storage.projectsScanned)} most active scanned)` : ""
                }`
              : failed
          }
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <section aria-labelledby="activity-heading" className={cn(panel, "flex-[2_1_520px] gap-[18px] px-[22px] py-5")}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="activity-heading" className="text-base font-semibold">
                Publishing activity
              </h2>
              <span className="text-[13px] text-muted-foreground">Package versions published, by how they were uploaded</span>
            </div>
            <ChartLegend />
          </div>
          {activity && data ? (
            <ActivityChart activity={activity} range={range} rangeIncomplete={data.rangeIncomplete} />
          ) : (
            <ErrorState error={activityRes.status === "rejected" ? activityRes.reason : null} />
          )}
        </section>

        <section aria-labelledby="formats-heading" className={cn(panel, "flex-[1_1_300px] gap-4 px-[22px] py-5")}>
          <div className="flex flex-col gap-1">
            <h2 id="formats-heading" className="text-base font-semibold">
              Packages by format
            </h2>
            {data && (
              <span className="text-[13px] text-muted-foreground">
                {data.truncated
                  ? `Sample of the ${formatNumber(data.packages.length)} newest packages (by count, not size)`
                  : `All ${formatNumber(data.packages.length)} packages (by count, not size)`}
              </span>
            )}
          </div>
          {data ? (
            <FormatBreakdown formats={formats} sampleSize={data.packages.length} />
          ) : (
            <ErrorState error={activityRes.status === "rejected" ? activityRes.reason : null} />
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-4">
        <section aria-labelledby="recent-heading" className={cn(panel, "flex-[2_1_520px] self-start")}>
          <div className="flex items-center justify-between gap-3 px-[22px] py-[18px]">
            <h2 id="recent-heading" className="text-base font-semibold">
              Recently published
            </h2>
            <Link href={routes.packages} className="text-[13px] font-medium text-primary hover:underline">
              View all packages
            </Link>
          </div>
          {data ? (
            <RecentTable packages={data.packages.slice(0, RECENT_LIMIT)} now={data.now} />
          ) : (
            <div className="px-[22px] pb-5">
              <ErrorState error={activityRes.status === "rejected" ? activityRes.reason : null} />
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <HealthPanel
            version={version}
            versionError={versionRes.status === "rejected" ? errorMessage(versionRes.reason) : null}
            username={session.username}
            isAdmin={session.isAdmin}
            scopes={
              data ? { total: data.groupCount + data.personalProjectCount, failed: data.failedScopes, truncated: data.truncated } : null
            }
          />
          {storage ? (
            <LargestProjects
              rows={storage.largest}
              packagesBytes={storage.packagesBytes}
              registryBytes={storage.registryBytes}
              projectsWithStats={storage.projectsWithStats}
              projectsScanned={storage.projectsScanned}
            />
          ) : (
            <ErrorState title="Couldn't load project storage" error={storageRes.status === "rejected" ? storageRes.reason : null} />
          )}
        </div>
      </div>
    </div>
  );
}
