export class GitLabApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "GitLabApiError";
  }
}

export class SessionExpiredError extends GitLabApiError {
  constructor() {
    super("Session expired. Please sign in again.", 401, "SESSION_EXPIRED");
  }
}

export class PermissionDeniedError extends GitLabApiError {
  constructor(message = "You don't have permission to perform this action.") {
    super(message, 403, "PERMISSION_DENIED");
  }
}

export class NotFoundError extends GitLabApiError {
  constructor(message = "Resource not found.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class RateLimitError extends GitLabApiError {
  constructor(public retryAfter: number) {
    super(`Rate limited by GitLab. Retry after ${retryAfter} seconds.`, 429, "RATE_LIMITED");
  }
}

/** Extracts GitLab's `{"message": ...}` / `{"error": ...}` body into a readable string. */
export function parseGitLabMessage(body: string): string {
  if (!body) return "";
  try {
    const parsed = JSON.parse(body);
    const msg = parsed.message ?? parsed.error_description ?? parsed.error;
    if (typeof msg === "string") return msg;
    if (msg) return JSON.stringify(msg);
  } catch {
    // not JSON
  }
  return body.slice(0, 300);
}

export function handleGitLabError(status: number, body: string, retryAfter?: string | null): never {
  const message = parseGitLabMessage(body);
  switch (status) {
    case 401:
      throw new SessionExpiredError();
    case 403:
      throw new PermissionDeniedError(message || undefined);
    case 404:
      throw new NotFoundError(message || undefined);
    case 429:
      throw new RateLimitError(parseInt(retryAfter || "60", 10) || 60);
    default:
      throw new GitLabApiError(message || `GitLab API error (${status})`, status, "GITLAB_API_ERROR");
  }
}

/** Human-readable message for any thrown value — safe to show in the UI. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Unexpected error";
}
