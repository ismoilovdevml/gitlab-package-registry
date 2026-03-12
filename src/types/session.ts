export interface SessionPayload {
  userId: number;
  gitlabUserId: number;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  pat: string;
  expiresAt: number;
}
