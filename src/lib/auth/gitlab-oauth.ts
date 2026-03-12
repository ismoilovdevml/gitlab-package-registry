import "server-only";

import type { GitLabOAuthToken, GitLabUser, GitLabPATResponse } from "@/lib/gitlab/types";

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
  url.searchParams.set("scope", "read_user api");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForToken(
  gitlabUrl: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<GitLabOAuthToken> {
  const res = await fetch(`${gitlabUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OAuth token exchange failed: ${text}`);
  }

  return res.json();
}

export async function getGitLabUser(
  gitlabUrl: string,
  accessToken: string,
): Promise<GitLabUser> {
  const res = await fetch(`${gitlabUrl}/api/v4/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch GitLab user");
  }

  return res.json();
}

export async function createPAT(
  gitlabUrl: string,
  accessToken: string,
  userId: number,
): Promise<GitLabPATResponse> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const res = await fetch(
    `${gitlabUrl}/api/v4/users/${userId}/personal_access_tokens`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: `GLPR UI - ${new Date().toISOString().slice(0, 10)}`,
        scopes: ["api", "read_registry", "write_registry"],
        expires_at: expiresAt.toISOString().slice(0, 10),
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PAT creation failed: ${text}`);
  }

  return res.json();
}
