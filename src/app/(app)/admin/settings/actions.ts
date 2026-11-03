"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { deleteSetting, getSettings, normalizeGitlabUrl, saveSetupSettings, setSetting } from "@/lib/setup";
import { createGitLabClient } from "@/lib/gitlab/client";
import { getAdminSession, type ActionResult } from "@/lib/admin/guard";
import { CLEANUP_TOKEN_KEY, CLEANUP_TOKEN_META_KEY, inspectServiceToken, type ServiceTokenInfo } from "@/lib/admin/settings";
import { routes } from "@/lib/routes";

const NOT_ADMIN = "Only Ombor administrators can change settings.";

function parseUrl(url: string): string | null {
  try {
    return normalizeGitlabUrl(url);
  } catch {
    return null;
  }
}

export async function testGitLabConnection(input: { gitlabUrl: string }): Promise<ActionResult<{ version: string }>> {
  const parsed = z.object({ gitlabUrl: z.string().trim().min(1).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the GitLab URL." };
  if (!(await getAdminSession())) return { ok: false, error: NOT_ADMIN };

  const url = parseUrl(parsed.data.gitlabUrl);
  if (!url) return { ok: false, error: "Enter a valid URL, e.g. https://gitlab.example.com" };
  const result = await createGitLabClient({ baseUrl: url, token: "" }).testConnection();
  if (!result.ok) return { ok: false, error: result.error ?? "GitLab is not reachable." };
  return { ok: true, version: result.version ?? "unknown" };
}

const connectionSchema = z.object({
  gitlabUrl: z.string().trim().min(1, "GitLab URL is required").max(500),
  clientId: z.string().trim().min(1, "OAuth Application ID is required").max(200),
  clientSecret: z.string().trim().max(500),
});

export async function saveGitLabConnection(input: {
  gitlabUrl: string;
  clientId: string;
  clientSecret: string;
}): Promise<ActionResult<{ changed: string[] }>> {
  const parsed = connectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  if (!(await getAdminSession())) return { ok: false, error: NOT_ADMIN };

  const gitlabUrl = parseUrl(parsed.data.gitlabUrl);
  if (!gitlabUrl) return { ok: false, error: "Enter a valid URL, e.g. https://gitlab.example.com" };

  const current = await getSettings();
  const clientSecret = parsed.data.clientSecret || current?.clientSecret;
  if (!clientSecret) return { ok: false, error: "Client secret is required." };

  // Only setting names are logged — never values of secrets.
  const changed: string[] = [];
  if (current?.gitlabUrl !== gitlabUrl) changed.push("gitlab_url");
  if (current?.clientId !== parsed.data.clientId) changed.push("oauth_client_id");
  if (parsed.data.clientSecret && parsed.data.clientSecret !== current?.clientSecret) changed.push("oauth_client_secret");

  try {
    await saveSetupSettings({ gitlabUrl, clientId: parsed.data.clientId, clientSecret });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Failed to save settings.";
    await logAudit({ action: "settings.update", targetType: "settings", target: "gitlab_connection", status: "failure", metadata: { changed, error } });
    return { ok: false, error };
  }

  await logAudit({
    action: "settings.update",
    targetType: "settings",
    target: "gitlab_connection",
    metadata: { changed, ...(changed.includes("gitlab_url") ? { gitlabUrl } : {}) },
  });
  revalidatePath("/", "layout");
  return { ok: true, changed };
}

export async function saveCleanupToken(input: { token: string }): Promise<ActionResult<{ info: ServiceTokenInfo }>> {
  const parsed = z.object({ token: z.string().trim().min(8, "Paste the token.").max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid token." };
  const session = await getAdminSession();
  if (!session) return { ok: false, error: NOT_ADMIN };

  const settings = await getSettings();
  if (!settings) return { ok: false, error: "GitLab connection is not configured." };

  const check = await inspectServiceToken(settings.gitlabUrl, parsed.data.token);
  if (!check.ok) {
    await logAudit({
      action: "settings.update",
      targetType: "settings",
      target: CLEANUP_TOKEN_KEY,
      status: "failure",
      metadata: { operation: "set", error: check.error },
    });
    return { ok: false, error: check.error };
  }

  const info: ServiceTokenInfo = { ...check.info, savedAt: new Date().toISOString(), savedBy: session.username };
  try {
    await setSetting(CLEANUP_TOKEN_KEY, parsed.data.token, true);
    await setSetting(CLEANUP_TOKEN_META_KEY, JSON.stringify(info));
  } catch (e) {
    console.error("[ombor] failed to save cleanup token", e);
    return { ok: false, error: "Failed to save the token." };
  }

  await logAudit({
    action: "settings.update",
    targetType: "settings",
    target: CLEANUP_TOKEN_KEY,
    metadata: { operation: "set", tokenUser: info.username, scopes: info.scopes, expiresAt: info.expiresAt },
  });
  revalidatePath(routes.settings);
  return { ok: true, info };
}

export async function clearCleanupToken(): Promise<ActionResult> {
  if (!(await getAdminSession())) return { ok: false, error: NOT_ADMIN };
  try {
    await deleteSetting(CLEANUP_TOKEN_KEY);
    await deleteSetting(CLEANUP_TOKEN_META_KEY);
  } catch (e) {
    console.error("[ombor] failed to clear cleanup token", e);
    return { ok: false, error: "Failed to clear the token." };
  }
  await logAudit({ action: "settings.update", targetType: "settings", target: CLEANUP_TOKEN_KEY, metadata: { operation: "clear" } });
  revalidatePath(routes.settings);
  return { ok: true };
}

export async function signOutAllUsers(): Promise<ActionResult<{ sessionsRevoked: number }>> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: NOT_ADMIN };
  try {
    const deleted = await db.delete(sessions).where(ne(sessions.id, session.sessionId)).returning({ id: sessions.id });
    await logAudit({
      action: "user.sessions_revoke",
      targetType: "session",
      target: "all users",
      metadata: { scope: "all", sessionsRevoked: deleted.length, keptCurrentSession: true },
    });
    revalidatePath(routes.settings);
    revalidatePath(routes.users);
    return { ok: true, sessionsRevoked: deleted.length };
  } catch (e) {
    console.error("[ombor] failed to revoke all sessions", e);
    await logAudit({ action: "user.sessions_revoke", targetType: "session", target: "all users", status: "failure", metadata: { scope: "all" } });
    return { ok: false, error: "Failed to sign out users." };
  }
}
