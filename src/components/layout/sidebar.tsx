"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NAV_SECTIONS } from "./nav-items";
import { OmborLogo } from "./logo";

export interface ShellUser {
  username: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export function SidebarNav({
  user,
  gitlabHost,
  onNavigate,
}: {
  user: ShellUser;
  gitlabHost: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const initials = (user.name || user.username)
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-full flex-col gap-6 bg-sidebar px-3 py-5 text-sidebar-foreground">
      <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 px-2.5">
        <OmborLogo />
        <span className="flex min-w-0 flex-col">
          <span className="text-base font-semibold tracking-tight text-white">Ombor</span>
          <span className="truncate text-[11px] text-sidebar-muted">{gitlabHost}</span>
        </span>
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-5 overflow-y-auto">
        {NAV_SECTIONS.filter((s) => !s.adminOnly || user.isAdmin).map((section) => (
          <div key={section.title} className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-muted">
              {section.title}
            </span>
            {section.items.map((item) => {
              const base = item.href.split("?")[0];
              const active = pathname === base || pathname.startsWith(`${base}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white",
                  )}
                >
                  <item.icon className="size-[18px]" strokeWidth={1.8} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-sidebar-border px-2.5 pt-4">
        <Avatar className="size-8">
          <AvatarImage src={user.avatarUrl || undefined} alt="" />
          <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col text-[13px]">
          <span className="truncate font-medium text-white">{user.name || user.username}</span>
          <span className="truncate text-xs text-sidebar-muted">{user.isAdmin ? "Registry admin" : `@${user.username}`}</span>
        </span>
      </div>
    </div>
  );
}

export function Sidebar(props: { user: ShellUser; gitlabHost: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">
      <SidebarNav {...props} />
    </aside>
  );
}
