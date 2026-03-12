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
    super("Session expired. Please log in again.", 401, "SESSION_EXPIRED");
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
    super(`Rate limited. Retry after ${retryAfter} seconds.`, 429, "RATE_LIMITED");
  }
}

export function handleGitLabError(status: number, body: string): never {
  switch (status) {
    case 401:
      throw new SessionExpiredError();
    case 403:
      throw new PermissionDeniedError(body || undefined);
    case 404:
      throw new NotFoundError(body || undefined);
    case 429: {
      const retryAfter = 60;
      throw new RateLimitError(retryAfter);
    }
    default:
      throw new GitLabApiError(
        body || `GitLab API error (${status})`,
        status,
        "GITLAB_API_ERROR",
      );
  }
}
