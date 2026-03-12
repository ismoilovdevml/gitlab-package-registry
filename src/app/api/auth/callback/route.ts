import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/setup";
import {
  buildOAuthAuthorizeUrl,
  exchangeCodeForToken,
  getGitLabUser,
  createPAT,
} from "@/lib/auth/gitlab-oauth";
import { createSession } from "@/lib/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const settings = await getSettings();
  if (!settings) {
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL("/", req.url).origin;
  const redirectUri = `${appUrl}/api/auth/callback`;

  // Step 1: Initiate OAuth flow
  if (action === "login") {
    const oauthState = crypto.randomBytes(16).toString("hex");

    const authorizeUrl = buildOAuthAuthorizeUrl(
      settings.gitlabUrl,
      settings.clientId,
      redirectUri,
      oauthState,
    );

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set("oauth_state", oauthState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return response;
  }

  // OAuth error
  if (errorParam) {
    const errorMsg = searchParams.get("error_description") || errorParam;
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorMsg)}`, req.url),
    );
  }

  // Step 2: Handle OAuth callback
  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=Ruxsat%20kodi%20topilmadi", req.url),
    );
  }

  // Verify state
  const savedState = req.cookies.get("oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(
      new URL("/login?error=CSRF%20tekshiruvi%20muvaffaqiyatsiz", req.url),
    );
  }

  try {
    // Exchange code for token
    const tokenData = await exchangeCodeForToken(
      settings.gitlabUrl,
      settings.clientId,
      settings.clientSecret,
      code,
      redirectUri,
    );

    // Get user info
    const gitlabUser = await getGitLabUser(settings.gitlabUrl, tokenData.access_token);

    // Create PAT for API calls
    const pat = await createPAT(settings.gitlabUrl, tokenData.access_token, gitlabUser.id);

    // Upsert user in DB
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.gitlabUserId, gitlabUser.id))
      .limit(1);

    let dbUserId: number;
    const allUsers = await db.select().from(users).limit(1);
    const isFirstUser = allUsers.length === 0;

    if (existingUsers.length > 0) {
      dbUserId = existingUsers[0].id;
      await db
        .update(users)
        .set({
          username: gitlabUser.username,
          name: gitlabUser.name,
          email: gitlabUser.email,
          avatarUrl: gitlabUser.avatar_url,
          lastLoginAt: new Date(),
        })
        .where(eq(users.id, dbUserId));
    } else {
      const inserted = await db
        .insert(users)
        .values({
          gitlabUserId: gitlabUser.id,
          username: gitlabUser.username,
          name: gitlabUser.name,
          email: gitlabUser.email,
          avatarUrl: gitlabUser.avatar_url,
          isAdmin: isFirstUser,
          lastLoginAt: new Date(),
        })
        .returning({ id: users.id });
      dbUserId = inserted[0].id;
    }

    // Create session
    await createSession({
      userId: dbUserId,
      gitlabUserId: gitlabUser.id,
      username: gitlabUser.username,
      name: gitlabUser.name,
      avatarUrl: gitlabUser.avatar_url,
      isAdmin: isFirstUser || existingUsers[0]?.isAdmin || false,
      pat: pat.token,
    });

    // Clear oauth state cookie and redirect
    const response = NextResponse.redirect(new URL("/dashboard", req.url));
    response.cookies.delete("oauth_state");
    return response;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Autentifikatsiya xatosi";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(msg)}`, req.url),
    );
  }
}
