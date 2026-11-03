import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { getSetting, getSettings, setSetting } from "@/lib/setup";
import {
  buildOAuthAuthorizeUrl,
  exchangeCodeForToken,
  getGitLabUser,
  getRedirectUri,
} from "@/lib/auth/gitlab-oauth";
import { createSession } from "@/lib/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";

const STATE_COOKIE = "ombor_oauth_state";

function loginError(req: NextRequest, message: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, req.url));
  res.cookies.delete(STATE_COOKIE);
  return res;
}

function safeNext(value: string | null | undefined): string {
  // Only allow same-origin relative paths.
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export async function GET(req: NextRequest) {
  const settings = await getSettings();
  if (!settings) {
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  const { searchParams } = new URL(req.url);
  const redirectUri = getRedirectUri(req.url);

  // Step 1: start the OAuth flow
  if (searchParams.get("action") === "login") {
    const state = crypto.randomBytes(16).toString("hex");
    const next = safeNext(searchParams.get("next"));
    const res = NextResponse.redirect(
      buildOAuthAuthorizeUrl(settings.gitlabUrl, settings.clientId, redirectUri, state),
    );
    res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next }), {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return res;
  }

  // Step 2: GitLab redirected back
  const errorParam = searchParams.get("error");
  if (errorParam) {
    return loginError(req, searchParams.get("error_description") || errorParam);
  }

  const code = searchParams.get("code");
  if (!code) return loginError(req, "Authorization code is missing");

  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(STATE_COOKIE)?.value || "{}");
  } catch {
    // ignore
  }
  if (!saved.state || saved.state !== searchParams.get("state")) {
    return loginError(req, "Login session expired or CSRF check failed. Please try again.");
  }

  try {
    const token = await exchangeCodeForToken(
      settings.gitlabUrl,
      settings.clientId,
      settings.clientSecret,
      code,
      redirectUri,
    );
    const gitlabUser = await getGitLabUser(settings.gitlabUrl, token.access_token);

    if (gitlabUser.state && gitlabUser.state !== "active") {
      return loginError(req, `Your GitLab account is ${gitlabUser.state}.`);
    }

    // Upsert user. The first user ever becomes the Ombor admin.
    const [existing] = await db.select().from(users).where(eq(users.gitlabUserId, gitlabUser.id)).limit(1);
    let userId: number;
    if (existing) {
      if (existing.isBlocked) {
        await logAudit({
          action: "auth.login_failed",
          targetType: "user",
          target: gitlabUser.username,
          status: "failure",
          metadata: { reason: "blocked" },
          actor: { userId: existing.id, username: existing.username },
        });
        return loginError(req, "Your access to Ombor has been blocked by an administrator.");
      }
      userId = existing.id;
      await db
        .update(users)
        .set({
          username: gitlabUser.username,
          name: gitlabUser.name,
          email: gitlabUser.email,
          avatarUrl: gitlabUser.avatar_url,
          lastLoginAt: new Date(),
        })
        .where(eq(users.id, userId));
    } else {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
      const [inserted] = await db
        .insert(users)
        .values({
          gitlabUserId: gitlabUser.id,
          username: gitlabUser.username,
          name: gitlabUser.name,
          email: gitlabUser.email,
          avatarUrl: gitlabUser.avatar_url,
          isAdmin: count === 0,
          lastLoginAt: new Date(),
        })
        .returning({ id: users.id });
      userId = inserted.id;
    }

    // Token refresh must reuse the exact redirect_uri registered with GitLab.
    if ((await getSetting("oauth_redirect_uri")) !== redirectUri) {
      await setSetting("oauth_redirect_uri", redirectUri);
    }

    await createSession({
      userId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresIn: token.expires_in,
    });

    await logAudit({
      action: "auth.login",
      targetType: "user",
      target: gitlabUser.username,
      actor: { userId, username: gitlabUser.username },
    });

    const res = NextResponse.redirect(new URL(safeNext(saved.next), req.url));
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    console.error("[ombor] OAuth callback failed", e);
    const cause = (e as { cause?: { code?: string } })?.cause?.code;
    const msg = cause?.includes("CERT")
      ? `Cannot verify GitLab TLS certificate (${cause}). Configure NODE_EXTRA_CA_CERTS.`
      : e instanceof Error
        ? e.message
        : "Authentication failed";
    return loginError(req, msg);
  }
}
