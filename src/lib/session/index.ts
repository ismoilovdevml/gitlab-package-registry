import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { decrypt, encrypt, randomToken, sha256 } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/auth/gitlab-oauth";
import { getSetting, getSettings } from "@/lib/setup";
import type { SessionPayload } from "@/types/session";

export const SESSION_COOKIE = "ombor_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

export async function getClientMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

export async function createSession(input: {
  userId: number;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresIn?: number; // seconds
}) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const meta = await getClientMeta();

  await db.insert(sessions).values({
    id: sha256(token),
    userId: input.userId,
    accessToken: encrypt(input.accessToken),
    refreshToken: input.refreshToken ? encrypt(input.refreshToken) : null,
    tokenExpiresAt: input.tokenExpiresIn ? new Date(Date.now() + input.tokenExpiresIn * 1000) : null,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  // Opportunistic cleanup of expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).catch(() => {});

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

async function readSessionRow() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || row.user.isBlocked) return null;
  return row;
}

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const row = await readSessionRow().catch(() => null);
  if (!row) return null;
  const { session, user } = row;
  return {
    sessionId: session.id,
    userId: user.id,
    gitlabUserId: user.gitlabUserId,
    username: user.username,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    isAdmin: user.isAdmin,
    expiresAt: session.expiresAt.getTime(),
  };
});

export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
});

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await verifySession();
  if (!session.isAdmin) redirect("/dashboard?error=admin_only");
  return session;
}

// One in-flight refresh per session in this process (GitLab rotates refresh tokens).
const refreshing = new Map<string, Promise<string>>();

async function refreshSessionToken(sessionId: string): Promise<string> {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!row) throw new Error("Session not found");

  // Another request may already have refreshed it.
  if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
    return decrypt(row.accessToken);
  }
  if (!row.refreshToken) return decrypt(row.accessToken);

  const settings = await getSettings();
  if (!settings) throw new Error("GitLab is not configured");

  // GitLab requires the same redirect_uri that was used at login (saved by the callback route).
  const redirectUri =
    (await getSetting("oauth_redirect_uri")) ||
    `${(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}/api/auth/callback`;
  const token = await refreshAccessToken(
    settings.gitlabUrl,
    settings.clientId,
    settings.clientSecret,
    decrypt(row.refreshToken),
    redirectUri,
  );

  await db
    .update(sessions)
    .set({
      accessToken: encrypt(token.access_token),
      refreshToken: token.refresh_token ? encrypt(token.refresh_token) : row.refreshToken,
      tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      lastSeenAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  return token.access_token;
}

/** Returns a valid GitLab OAuth access token for the current session, refreshing it when needed. */
export const getAccessToken = cache(async (): Promise<string> => {
  const session = await verifySession();
  const [row] = await db.select().from(sessions).where(eq(sessions.id, session.sessionId)).limit(1);
  if (!row) redirect("/login");

  const expiresSoon =
    row.tokenExpiresAt !== null && row.tokenExpiresAt.getTime() - Date.now() < TOKEN_REFRESH_MARGIN_MS;
  if (!expiresSoon) return decrypt(row.accessToken);

  let pending = refreshing.get(session.sessionId);
  if (!pending) {
    pending = refreshSessionToken(session.sessionId).finally(() => refreshing.delete(session.sessionId));
    refreshing.set(session.sessionId, pending);
  }
  try {
    return await pending;
  } catch {
    // Refresh token revoked/expired: force a new login.
    await db.delete(sessions).where(eq(sessions.id, session.sessionId)).catch(() => {});
    redirect("/login?error=Session%20expired.%20Please%20sign%20in%20again.");
  }
});

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, sha256(token))).catch(() => {});
  }
  cookieStore.delete(SESSION_COOKIE);
}
