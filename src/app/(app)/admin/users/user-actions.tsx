"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Ban, LogOut, MoreHorizontal, ShieldCheck, ShieldOff, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ombor/confirm-dialog";
import { revokeUserSessions, setUserBlocked, setUserRole } from "./actions";

type Pending = "promote" | "demote" | "block" | "unblock" | "revoke" | null;

export function UserActions({
  user,
  isSelf,
}: {
  user: { id: number; username: string; isAdmin: boolean; isBlocked: boolean; activeSessions: number };
  isSelf: boolean;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const close = (open: boolean) => !open && setPending(null);

  const dialogs: Record<Exclude<Pending, null>, { title: string; description: string; label: string; destructive: boolean; run: () => Promise<{ error?: string } | void> }> = {
    promote: {
      title: `Make @${user.username} an admin?`,
      description:
        "Admins can see the full audit log, manage users and change Ombor settings. Package permissions still come from GitLab.",
      label: "Make admin",
      destructive: false,
      run: async () => {
        const r = await setUserRole({ userId: user.id, admin: true });
        if (!r.ok) return { error: r.error };
        toast.success(`@${user.username} is now an admin`);
      },
    },
    demote: {
      title: `Remove admin role from @${user.username}?`,
      description: "They keep access to packages through their GitLab roles, but lose access to Ombor administration.",
      label: "Remove admin",
      destructive: true,
      run: async () => {
        const r = await setUserRole({ userId: user.id, admin: false });
        if (!r.ok) return { error: r.error };
        toast.success(`@${user.username} is no longer an admin`);
      },
    },
    block: {
      title: `Block @${user.username}?`,
      description: `They will be signed out of Ombor immediately (${user.activeSessions} active session${user.activeSessions === 1 ? "" : "s"}) and can't sign in again until unblocked. Their GitLab account is not affected.`,
      label: "Block user",
      destructive: true,
      run: async () => {
        const r = await setUserBlocked({ userId: user.id, blocked: true });
        if (!r.ok) return { error: r.error };
        toast.success(`@${user.username} blocked`, { description: `${r.sessionsRevoked} session(s) revoked` });
      },
    },
    unblock: {
      title: `Unblock @${user.username}?`,
      description: "They will be able to sign in to Ombor with GitLab again.",
      label: "Unblock",
      destructive: false,
      run: async () => {
        const r = await setUserBlocked({ userId: user.id, blocked: false });
        if (!r.ok) return { error: r.error };
        toast.success(`@${user.username} unblocked`);
      },
    },
    revoke: {
      title: `Sign out @${user.username} everywhere?`,
      description: isSelf
        ? "All your other Ombor sessions will be signed out. This browser stays signed in."
        : "All of their Ombor sessions will end. They can sign in again with GitLab.",
      label: "Revoke sessions",
      destructive: true,
      run: async () => {
        const r = await revokeUserSessions({ userId: user.id });
        if (!r.ok) return { error: r.error };
        toast.success(`${r.sessionsRevoked} session(s) revoked`);
      },
    },
  };

  const current = pending ? dialogs[pending] : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for @${user.username}`} />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {user.isAdmin ? (
            <DropdownMenuItem disabled={isSelf} onClick={() => setPending("demote")}>
              <ShieldOff /> Remove admin
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={user.isBlocked} onClick={() => setPending("promote")}>
              <ShieldCheck /> Make admin
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={user.activeSessions === 0} onClick={() => setPending("revoke")}>
            <LogOut /> Revoke sessions
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.isBlocked ? (
            <DropdownMenuItem onClick={() => setPending("unblock")}>
              <UserCheck /> Unblock
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" disabled={isSelf} onClick={() => setPending("block")}>
              <Ban /> Block
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {current && (
        <ConfirmDialog
          open={pending !== null}
          onOpenChange={close}
          title={current.title}
          description={current.description}
          confirmLabel={current.label}
          destructive={current.destructive}
          onConfirm={current.run}
        />
      )}
    </>
  );
}
