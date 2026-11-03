import Link from "next/link";
import { ChevronLeft, ChevronRight, Info, Search, Users } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { PageHeader } from "@/components/ombor/page-header";
import { StatCard } from "@/components/ombor/stat-card";
import { StatusBadge } from "@/components/ombor/status-badge";
import { EmptyState, ErrorState } from "@/components/ombor/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { USERS_PAGE_SIZE, getUserStats, listUsers, parseUserFilters, userQueryString, type UserFilters, type UserRow } from "@/lib/admin/users";
import { fieldInput, initials, linkButton, nativeSelect, nowMs } from "@/lib/admin/ui";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { UserActions } from "./user-actions";

export const metadata = { title: "Users & access" };
export const dynamic = "force-dynamic";

const GITLAB_ROLES = [
  { role: "Guest", can: "Nothing in the registry of private projects. Public projects stay readable." },
  { role: "Reporter", can: "Browse packages and images, view files and install snippets, download / pull." },
  { role: "Developer", can: "Everything above, plus publish packages and push container images." },
  { role: "Maintainer", can: "Everything above, plus delete packages, files, tags and image repositories, and manage cleanup policies." },
  { role: "Owner", can: "Same as Maintainer for registry purposes." },
];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const filters = parseUserFilters(await searchParams);
  const [list, stats] = await Promise.allSettled([listUsers(filters), getUserStats()]);
  const hasFilters = userQueryString(filters, { page: 1 }) !== "";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="mb-1"
        title="Users and access"
        description="Everyone who has signed in to Ombor with GitLab. Ombor roles only control Ombor administration — package permissions come from GitLab."
      />

      {stats.status === "fulfilled" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Users" value={formatNumber(stats.value.total)} hint="Signed in at least once" />
          <StatCard label="Admins" value={formatNumber(stats.value.admins)} hint="Active Ombor admins" />
          <StatCard
            label="Blocked"
            value={formatNumber(stats.value.blocked)}
            hint="Can't sign in to Ombor"
            hintTone={stats.value.blocked > 0 ? "warning" : "neutral"}
          />
          <StatCard label="Active sessions" value={formatNumber(stats.value.activeSessions)} hint="Not yet expired" />
        </div>
      ) : (
        <ErrorState error={stats.reason} title="Couldn't load user statistics" />
      )}

      <section className="flex flex-col overflow-hidden rounded-xl border bg-card">
        <form method="get" action={routes.users} className="flex flex-wrap items-center gap-2.5 border-b px-4 py-3.5 sm:px-5" aria-label="Filter users">
          <label className="relative min-w-0 flex-[1_1_240px]">
            <span className="sr-only">Filter by name, username or email</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" defaultValue={filters.q} placeholder="Filter by name, username or email" className={cn(fieldInput, "pl-8")} />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Role</span>
            <select name="role" defaultValue={filters.role ?? ""} className={nativeSelect}>
              <option value="">All roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">Status</span>
            <select name="status" defaultValue={filters.status ?? ""} className={nativeSelect}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <button type="submit" className={linkButton.primary}>
            Apply
          </button>
          {hasFilters && (
            <Link href={routes.users} className={linkButton.ghost}>
              Reset
            </Link>
          )}
        </form>

        {list.status === "rejected" ? (
          <ErrorState error={list.reason} title="Couldn't load users" className="m-4" />
        ) : list.value.total === 0 ? (
          <EmptyState
            className="m-4"
            icon={<Users />}
            title={hasFilters ? "No users match these filters" : "No users yet"}
            description={hasFilters ? "Try a different search or clear the filters." : "Users appear here after they sign in with GitLab."}
          />
        ) : (
          <UsersTable rows={list.value.rows} total={list.value.total} filters={filters} currentUserId={session.userId} />
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" aria-labelledby="gitlab-roles">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
            <Info className="size-4" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="gitlab-roles" className="text-base font-semibold">
              Package permissions come from GitLab
            </h2>
            <p className="text-sm text-muted-foreground">
              Every registry request runs with the signed-in user&apos;s own GitLab token, so GitLab decides what they can see and change in
              each project. To change someone&apos;s package access, change their role on the project or group in GitLab.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[520px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="border-b px-4 py-2.5 font-medium">GitLab role</th>
                <th className="border-b px-4 py-2.5 font-medium">What they can do in Ombor</th>
              </tr>
            </thead>
            <tbody>
              {GITLAB_ROLES.map((r) => (
                <tr key={r.role} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">{r.role}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.can}</td>
                </tr>
              ))}
              <tr>
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">Ombor admin</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  Sees the full audit log, manages Ombor users and settings. Does <strong>not</strong> grant extra access to packages.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UsersTable({
  rows,
  total,
  filters,
  currentUserId,
}: {
  rows: UserRow[];
  total: number;
  filters: UserFilters;
  currentUserId: number;
}) {
  const now = nowMs();
  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const th = "border-b px-3 py-2.5 font-medium whitespace-nowrap";
  const td = "border-b border-border/60 px-3 py-3";

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-muted/50 text-left text-muted-foreground">
              <th className={cn(th, "pl-5")}>User</th>
              <th className={th}>Ombor role</th>
              <th className={th}>Status</th>
              <th className={th}>Last login</th>
              <th className={cn(th, "text-right")}>Active sessions</th>
              <th className={cn(th, "pr-5 text-right")}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className={cn(td, "pl-5")}>
                    <div className="flex items-center gap-2.5">
                      <Avatar>
                        {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                        <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                          {initials(u.name ?? u.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {u.name ?? u.username}
                          {isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          @{u.username}
                          {u.email ? ` · ${u.email}` : ""}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className={td}>
                    <StatusBadge tone={u.isAdmin ? "info" : "neutral"}>{u.isAdmin ? "Admin" : "User"}</StatusBadge>
                  </td>
                  <td className={td}>
                    <StatusBadge tone={u.isBlocked ? "danger" : "success"} dot>
                      {u.isBlocked ? "Blocked" : "Active"}
                    </StatusBadge>
                  </td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    <span title={formatDateTime(u.lastLoginAt)}>{timeAgo(u.lastLoginAt, now)}</span>
                  </td>
                  <td className={cn(td, "tabular text-right")}>{formatNumber(u.activeSessions)}</td>
                  <td className={cn(td, "pr-5 text-right")}>
                    <UserActions
                      isSelf={isSelf}
                      user={{
                        id: u.id,
                        username: u.username,
                        isAdmin: u.isAdmin,
                        isBlocked: u.isBlocked,
                        activeSessions: u.activeSessions,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
        <span className="text-muted-foreground">
          {formatNumber(total)} user{total === 1 ? "" : "s"}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            {page > 1 ? (
              <Link href={`${routes.users}${userQueryString(filters, { page: page - 1 })}`} className={linkButton.outline} aria-label="Previous page">
                <ChevronLeft />
              </Link>
            ) : (
              <span className={cn(linkButton.outline, linkButton.disabled)} aria-disabled aria-label="Previous page">
                <ChevronLeft />
              </span>
            )}
            {page < totalPages ? (
              <Link href={`${routes.users}${userQueryString(filters, { page: page + 1 })}`} className={linkButton.outline} aria-label="Next page">
                <ChevronRight />
              </Link>
            ) : (
              <span className={cn(linkButton.outline, linkButton.disabled)} aria-disabled aria-label="Next page">
                <ChevronRight />
              </span>
            )}
          </div>
        )}
      </nav>
    </>
  );
}
