import "server-only";

import type { GitLabOAuthToken, GitLabUser } from "@/lib/gitlab/types";

export const OAUTH_SCOPES = "api read_user";

export function buildOAuthAuthorizeUrl(
  gitlabUrl: string,
  clientId: string,
  redirectUri: string,
  state: string,
) {
  const url = new URL(`${gitlabUrl}/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(gitlabUrl: string, body: Record<string, string>): Promise<GitLabOAuthToken> {
  const res = await fetch(`${gitlabUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error_description || parsed.error || text;
    } catch {
      // not JSON
    }
    throw new Error(`GitLab OAuth error (${res.status}): ${message.slice(0, 300)}`);
  }

  return res.json();
}

export function exchangeCodeForToken(
  gitlabUrl: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<GitLabOAuthToken> {
  return tokenRequest(gitlabUrl, {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
}

export function refreshAccessToken(
  gitlabUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  redirectUri: string,
): Promise<GitLabOAuthToken> {
  return tokenRequest(gitlabUrl, {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    redirect_uri: redirectUri,
  });
}

export async function revokeToken(
  gitlabUrl: string,
  clientId: string,
  clientSecret: string,
  token: string,
): Promise<void> {
  await fetch(`${gitlabUrl}/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, token }),
    cache: "no-store",
  }).catch(() => {});
}

export async function getGitLabUser(gitlabUrl: string, accessToken: string): Promise<GitLabUser> {
  const res = await fetch(`${gitlabUrl}/api/v4/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch GitLab user (${res.status})`);
  }

  return res.json();
}

export function getRedirectUri(requestUrl: string): string {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(requestUrl).origin;
  return `${appUrl.replace(/\/+$/, "")}/api/auth/callback`;
}
