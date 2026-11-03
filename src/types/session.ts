// What server code gets from verifySession(). Tokens are never part of this object;
// use getAccessToken() from @/lib/session when a GitLab call is needed.
export interface SessionPayload {
  sessionId: string;
  userId: number;
  gitlabUserId: number;
  username: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  expiresAt: number;
}
