import "server-only";

import { headers } from "next/headers";
import { count, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { getSetting } from "@/lib/setup";
import { SESSION_TTL_MS } from "@/lib/session";
import { createGitLabClient } from "@/lib/gitlab/client";
import { GitLabApiError, errorMessage } from "@/lib/gitlab/errors";
import pkg from "../../../package.json";

export const OMBOR_VERSION: string = pkg.version;

/** Encrypted setting read by scheduled cleanup policies. */
export const CLEANUP_TOKEN_KEY = "cleanup_service_token";
/** Non-secret details about the stored cleanup token (who it belongs to, scopes, expiry). */
export const CLEANUP_TOKEN_META_KEY = "cleanup_service_token_meta";

/** Mirrors SESSION_TTL_MS in src/lib/session (not exported there). */
export const SESSION_LIFETIME_DAYS = SESSION_TTL_MS / 86_400_000;

export interface ServiceTokenInfo {
  username: string;
  name: string | null;
  tokenName: string | null;
  scopes: string[] | null;
  expiresAt: string | null;
  savedAt: string;
  savedBy: string;
}

export async function getCleanupTokenStatus(): Promise<{ configured: boolean; info: ServiceTokenInfo | null; error?: string }> {
  let configured = false;
  let error: string | undefined;
  try {
    configured = Boolean(await getSetting(CLEANUP_TOKEN_KEY));
  } catch {
    // Decryption failed: SESSION_SECRET changed since the token was saved.
    configured = true;
    error = "The stored token can't be decrypted (SESSION_SECRET changed). Save it again.";
  }
  let info: ServiceTokenInfo | null = null;
  if (configured) {
    try {
      const raw = await getSetting(CLEANUP_TOKEN_META_KEY);
      info = raw ? (JSON.parse(raw) as ServiceTokenInfo) : null;
    } catch {
      info = null;
    }
  }
  return { configured, info, error };
}

interface PersonalAccessTokenSelf {
  name?: string;
  scopes?: string[];
  expires_at?: string | null;
  active?: boolean;
  revoked?: boolean;
}

/**
 * Checks a service token against GitLab: GET /user (must succeed), then
 * GET /personal_access_tokens/self for scopes/expiry (best effort; works for PATs and group/project access tokens).
 */
export async function inspectServiceToken(
  gitlabUrl: string,
  token: string,
): Promise<{ ok: true; info: Omit<ServiceTokenInfo, "savedAt" | "savedBy"> } | { ok: false; error: string }> {
  const client = createGitLabClient({ baseUrl: gitlabUrl, token });
  let user;
  try {
    user = await client.getCurrentUser();
  } catch (e) {
    if (e instanceof GitLabApiError && e.status === 401) {
      return { ok: false, error: "GitLab rejected this token (401). Check that it is valid, active and not expired." };
    }
    return { ok: false, error: `Couldn't validate the token: ${errorMessage(e)}` };
  }

  let self: PersonalAccessTokenSelf | null = null;
  try {
    self = await client.request<PersonalAccessTokenSelf>("/personal_access_tokens/self");
  } catch {
    self = null; // Older GitLab or a token type without this endpoint.
  }
  if (self?.scopes && !self.scopes.includes("api")) {
    return {
      ok: false,
      error: `This token has scopes [${self.scopes.join(", ")}] — cleanup needs the "api" scope to delete packages.`,
    };
  }

  return {
    ok: true,
    info: {
      username: user.username,
      name: user.name ?? null,
      tokenName: self?.name ?? null,
      scopes: self?.scopes ?? null,
      expiresAt: self?.expires_at ?? null,
    },
  };
}

/** The OAuth redirect URI registered in GitLab (saved at login), or the expected one. */
export async function getOAuthRedirectUri(): Promise<string> {
  const saved = await getSetting("oauth_redirect_uri").catch(() => null);
  if (saved) return saved;
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return `${appUrl.replace(/\/+$/, "")}/api/auth/callback`;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  return `${proto}://${host}/api/auth/callback`;
}

export async function getSessionStats() {
  const [row] = await db
    .select({
      active: count(),
      users: sql<number>`count(distinct ${sessions.userId})`.mapWith(Number),
    })
    .from(sessions)
    .where(gt(sessions.expiresAt, new Date()));
  return row ?? { active: 0, users: 0 };
}

export async function getDatabaseStatus(): Promise<{ ok: true; version: string; latencyMs: number } | { ok: false; error: string }> {
  const started = performance.now();
  try {
    const rows = await db.execute<{ version: string }>(sql`select current_setting('server_version') as version`);
    const latencyMs = Math.round(performance.now() - started);
    const version = (rows as unknown as { version: string }[])[0]?.version ?? "unknown";
    return { ok: true, version, latencyMs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Database unavailable" };
  }
}
