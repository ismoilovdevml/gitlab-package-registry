"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, LogOut, PlugZap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ombor/confirm-dialog";
import { clearCleanupToken, saveCleanupToken, saveGitLabConnection, signOutAllUsers, testGitLabConnection } from "./actions";

export function GitLabConnectionForm({
  gitlabUrl: initialUrl,
  clientId: initialClientId,
  secretConfigured,
}: {
  gitlabUrl: string;
  clientId: string;
  secretConfigured: boolean;
}) {
  const router = useRouter();
  const [gitlabUrl, setGitlabUrl] = useState(initialUrl);
  const [clientId, setClientId] = useState(initialClientId);
  const [clientSecret, setClientSecret] = useState("");
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const [confirmUrlChange, setConfirmUrlChange] = useState(false);

  function test() {
    startTest(async () => {
      const r = await testGitLabConnection({ gitlabUrl });
      if (r.ok) toast.success("GitLab is reachable", { description: `Version ${r.version}` });
      else toast.error("Connection failed", { description: r.error });
    });
  }

  async function save(): Promise<{ error?: string } | void> {
    const r = await saveGitLabConnection({ gitlabUrl, clientId, clientSecret });
    if (!r.ok) {
      toast.error("Couldn't save settings", { description: r.error });
      return { error: r.error };
    }
    setClientSecret("");
    toast.success(r.changed.length ? "GitLab connection saved" : "No changes to save");
    router.refresh();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (gitlabUrl.trim().replace(/\/+$/, "") !== initialUrl) {
      setConfirmUrlChange(true);
      return;
    }
    startSave(async () => {
      await save();
    });
  }

  const busy = testing || saving;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gitlab-url">Instance URL</Label>
          <Input
            id="gitlab-url"
            type="url"
            required
            value={gitlabUrl}
            onChange={(e) => setGitlabUrl(e.target.value)}
            placeholder="https://gitlab.example.com"
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-id">OAuth Application ID</Label>
          <Input
            id="client-id"
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="h-10 font-mono text-[13px]"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="client-secret">OAuth Client Secret</Label>
          <Input
            id="client-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={secretConfigured ? "•••••••• (leave blank to keep the current secret)" : "Paste the application secret"}
            className="h-10 font-mono text-[13px]"
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">Write-only. The stored secret is encrypted and never shown.</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="lg" className="h-10 px-3.5" onClick={test} disabled={busy || !gitlabUrl}>
          {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Test connection
        </Button>
        <Button type="submit" size="lg" className="h-10 px-4" disabled={busy}>
          {saving && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
      <ConfirmDialog
        open={confirmUrlChange}
        onOpenChange={setConfirmUrlChange}
        title="Change the GitLab instance URL?"
        description="Existing sessions hold tokens issued by the current instance. If the new URL points to a different GitLab, everyone (including you) must sign in again, and the OAuth application must exist on the new instance."
        confirmLabel="Save anyway"
        destructive={false}
        onConfirm={save}
      />
    </form>
  );
}

export function CleanupTokenForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [saving, startSave] = useTransition();
  const [confirmClear, setConfirmClear] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startSave(async () => {
      const r = await saveCleanupToken({ token });
      if (!r.ok) {
        toast.error("Token not saved", { description: r.error });
        return;
      }
      setToken("");
      toast.success("Cleanup token saved", { description: `Authenticated as @${r.info.username}` });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cleanup-token">{configured ? "Replace token" : "Token"}</Label>
        <Input
          id="cleanup-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={configured ? "•••••••• (stored — paste a new token to replace it)" : "glpat-…"}
          className="h-10 font-mono text-[13px]"
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          Write-only. Validated against GitLab (<code className="font-mono">GET /user</code>) before it is stored encrypted.
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {configured && (
          <Button type="button" variant="destructive" size="lg" className="h-10 px-3.5" onClick={() => setConfirmClear(true)} disabled={saving}>
            <Trash2 /> Clear
          </Button>
        )}
        <Button type="submit" size="lg" className="h-10 px-4" disabled={saving || token.trim().length === 0}>
          {saving ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Validate &amp; save
        </Button>
      </div>
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear the cleanup service token?"
        description="Scheduled cleanup policies will stop running until a new token is saved."
        confirmLabel="Clear token"
        onConfirm={async () => {
          const r = await clearCleanupToken();
          if (!r.ok) return { error: r.error };
          toast.success("Cleanup token cleared");
          router.refresh();
        }}
      />
    </form>
  );
}

export function SignOutAllButton({ otherSessions }: { otherSessions: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" size="lg" className="h-10 px-3.5" onClick={() => setOpen(true)} disabled={otherSessions === 0}>
        <LogOut /> Sign out all users
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sign out all users?"
        description={`This ends ${otherSessions} active session${otherSessions === 1 ? "" : "s"} for every user except your current one. Everyone will need to sign in with GitLab again.`}
        confirmLabel="Sign out everyone"
        onConfirm={async () => {
          const r = await signOutAllUsers();
          if (!r.ok) return { error: r.error };
          toast.success(`${r.sessionsRevoked} session(s) ended`);
          router.refresh();
        }}
      />
    </>
  );
}
