import { requireAdmin, getAuthenticatedClient } from "@/lib/dal";
import { getSettings } from "@/lib/setup";
import { StatusBadge, type Tone } from "@/components/ombor/status-badge";
import { CopyButton } from "@/components/ombor/copy-button";
import { ErrorState } from "@/components/ombor/empty-state";
import {
  OMBOR_VERSION,
  SESSION_LIFETIME_DAYS,
  getCleanupTokenStatus,
  getDatabaseStatus,
  getOAuthRedirectUri,
  getSessionStats,
} from "@/lib/admin/settings";
import { formatDate, formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { nowMs } from "@/lib/admin/ui";
import { CleanupTokenForm, GitLabConnectionForm, SignOutAllButton } from "./settings-forms";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "gitlab", label: "GitLab connection" },
  { id: "cleanup-token", label: "Cleanup service token" },
  { id: "sessions", label: "Sessions & security" },
  { id: "about", label: "About" },
];

async function getGitLabVersion() {
  const { client } = await getAuthenticatedClient();
  return client.getVersion();
}

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, redirectUri, tokenStatus, sessionStats, dbStatus, gitlabVersion] = await Promise.allSettled([
    getSettings(),
    getOAuthRedirectUri(),
    getCleanupTokenStatus(),
    getSessionStats(),
    getDatabaseStatus(),
    getGitLabVersion(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Settings</h1>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:w-52 lg:shrink-0 lg:flex-col lg:gap-0.5">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-muted"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* GitLab connection */}
          <Section
            id="gitlab"
            title="GitLab connection"
            description="Ombor signs users in with this GitLab OAuth application and calls the GitLab REST API with each user's own token."
            badge={
              gitlabVersion.status === "fulfilled" ? (
                <StatusBadge tone="success" dot className="h-7 px-2.5 text-[13px]">
                  Connected · GitLab {gitlabVersion.value.version}
                </StatusBadge>
              ) : (
                <StatusBadge tone="danger" dot className="h-7 px-2.5 text-[13px]">
                  GitLab API unreachable
                </StatusBadge>
              )
            }
          >
            {settings.status === "fulfilled" && settings.value ? (
              <GitLabConnectionForm
                gitlabUrl={settings.value.gitlabUrl}
                clientId={settings.value.clientId}
                secretConfigured={Boolean(settings.value.clientSecret)}
              />
            ) : (
              <ErrorState
                error={settings.status === "rejected" ? settings.reason : "Settings are missing or can't be decrypted."}
                title="Couldn't load GitLab settings"
              />
            )}
            <div className="flex flex-col gap-1.5 rounded-lg bg-muted/60 p-3.5">
              <span className="text-xs text-muted-foreground">OAuth redirect URI (register this in the GitLab application)</span>
              {redirectUri.status === "fulfilled" ? (
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{redirectUri.value}</code>
                  <CopyButton text={redirectUri.value} label="Copy redirect URI" />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
              <span className="text-xs text-muted-foreground">
                Required scopes: <code className="font-mono">api</code> (or <code className="font-mono">read_api</code> for read-only),{" "}
                <code className="font-mono">read_user</code>.
              </span>
            </div>
          </Section>

          {/* Cleanup service token */}
          <Section
            id="cleanup-token"
            title="Cleanup service token"
            description="Used only by scheduled cleanup policies, which run without a signed-in user. Use a GitLab group or project access token (or a service account PAT) with the api scope and the Maintainer role on the projects the policies clean."
            badge={
              tokenStatus.status === "fulfilled" ? (
                <StatusBadge tone={tokenStatus.value.configured ? (tokenStatus.value.error ? "danger" : "success") : "neutral"} dot className="h-7 px-2.5 text-[13px]">
                  {tokenStatus.value.configured ? "Configured" : "Not configured"}
                </StatusBadge>
              ) : null
            }
          >
            {tokenStatus.status === "rejected" ? (
              <ErrorState error={tokenStatus.reason} title="Couldn't read the cleanup token status" />
            ) : (
              <>
                {tokenStatus.value.error && <ErrorState error={tokenStatus.value.error} title="Stored token is unusable" />}
                {tokenStatus.value.info && <TokenInfo info={tokenStatus.value.info} />}
                {!tokenStatus.value.configured && (
                  <p className="rounded-lg bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
                    Scheduled cleanup policies can&apos;t run until a token is saved.
                  </p>
                )}
                <CleanupTokenForm configured={tokenStatus.value.configured} />
              </>
            )}
          </Section>

          {/* Sessions & security */}
          <Section
            id="sessions"
            title="Sessions & security"
            description="Sessions are stored server-side; GitLab tokens are encrypted at rest and never sent to the browser."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tile label="Session lifetime" value={`${SESSION_LIFETIME_DAYS} days`} />
              <Tile
                label="Active sessions"
                value={sessionStats.status === "fulfilled" ? formatNumber(sessionStats.value.active) : "—"}
              />
              <Tile
                label="Signed-in users"
                value={sessionStats.status === "fulfilled" ? formatNumber(sessionStats.value.users) : "—"}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-destructive">Sign out all users</span>
                <span className="text-[13px] text-muted-foreground">
                  Ends every session except yours. Use after rotating the OAuth secret or if a device was lost.
                </span>
              </div>
              <SignOutAllButton otherSessions={sessionStats.status === "fulfilled" ? Math.max(0, sessionStats.value.active - 1) : 0} />
            </div>
          </Section>

          {/* About */}
          <Section id="about" title="About">
            <dl className="grid gap-3 sm:grid-cols-2">
              <AboutItem label="Ombor version" value={<span className="font-mono">{OMBOR_VERSION}</span>} />
              <AboutItem
                label="GitLab version"
                value={
                  gitlabVersion.status === "fulfilled" ? (
                    <span className="font-mono">
                      {gitlabVersion.value.version}
                      {gitlabVersion.value.revision ? ` (${gitlabVersion.value.revision})` : ""}
                      {gitlabVersion.value.enterprise !== undefined ? (gitlabVersion.value.enterprise ? " · EE" : " · CE") : ""}
                    </span>
                  ) : (
                    <span className="text-destructive">
                      Unavailable: {gitlabVersion.reason instanceof Error ? gitlabVersion.reason.message : "request failed"}
                    </span>
                  )
                }
              />
              <AboutItem
                label="Database"
                value={
                  dbStatus.status === "fulfilled" && dbStatus.value.ok ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone="success" dot>
                        Healthy
                      </StatusBadge>
                      <span className="font-mono text-[13px]">
                        PostgreSQL {dbStatus.value.version} · {dbStatus.value.latencyMs} ms
                      </span>
                    </span>
                  ) : (
                    <StatusBadge tone="danger" dot>
                      {dbStatus.status === "fulfilled" && !dbStatus.value.ok ? dbStatus.value.error : "Unavailable"}
                    </StatusBadge>
                  )
                }
              />
              <AboutItem label="Runtime" value={<span className="font-mono">Node.js {process.version}</span>} />
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  badge,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-4 rounded-xl border bg-card p-5 sm:p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`${id}-title`} className="text-lg font-semibold">
            {title}
          </h2>
          {description && <p className="max-w-2xl text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabular text-[15px] font-semibold">{value}</span>
    </div>
  );
}

function AboutItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function TokenInfo({ info }: { info: NonNullable<Awaited<ReturnType<typeof getCleanupTokenStatus>>["info"]> }) {
  let expiryTone: Tone = "neutral";
  let expiry = "No expiry date";
  if (info.expiresAt) {
    const days = Math.floor((new Date(info.expiresAt).getTime() - nowMs()) / 86_400_000);
    expiry = days < 0 ? `Expired ${formatDate(info.expiresAt)}` : `${formatDate(info.expiresAt)} (in ${days} d)`;
    expiryTone = days < 0 ? "danger" : days <= 14 ? "warning" : "neutral";
  }
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <AboutItem label="Authenticates as" value={<span className="font-mono">@{info.username}</span>} />
      <AboutItem label="Scopes" value={<span className="font-mono">{info.scopes?.join(", ") ?? "unknown"}</span>} />
      <AboutItem
        label="Expires"
        value={expiryTone === "neutral" ? expiry : <StatusBadge tone={expiryTone}>{expiry}</StatusBadge>}
      />
      <AboutItem
        label="Saved"
        value={
          <span title={formatDateTime(info.savedAt)}>
            {timeAgo(info.savedAt)} by @{info.savedBy}
          </span>
        }
      />
    </dl>
  );
}
