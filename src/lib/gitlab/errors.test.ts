import { describe, expect, it } from "vitest";
import {
  errorMessage,
  GitLabApiError,
  handleGitLabError,
  NotFoundError,
  parseGitLabMessage,
  PermissionDeniedError,
  RateLimitError,
  SessionExpiredError,
} from "./errors";

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected function to throw");
}

describe("parseGitLabMessage", () => {
  it("returns an empty string for an empty body", () => {
    expect(parseGitLabMessage("")).toBe("");
  });

  it("prefers message, then error_description, then error", () => {
    expect(parseGitLabMessage('{"message":"m","error_description":"d","error":"e"}')).toBe("m");
    expect(parseGitLabMessage('{"error_description":"d","error":"e"}')).toBe("d");
    expect(parseGitLabMessage('{"error":"e"}')).toBe("e");
  });

  it("stringifies structured messages (validation errors)", () => {
    expect(parseGitLabMessage('{"message":{"name":["is invalid"]}}')).toBe('{"name":["is invalid"]}');
  });

  it("falls back to the raw body (truncated to 300 chars) when not JSON", () => {
    expect(parseGitLabMessage("Bad gateway")).toBe("Bad gateway");
    expect(parseGitLabMessage("x".repeat(500))).toHaveLength(300);
  });

  it("falls back to the raw body when JSON has no known field", () => {
    expect(parseGitLabMessage('{"foo":1}')).toBe('{"foo":1}');
  });
});

describe("handleGitLabError", () => {
  it("401 -> SessionExpiredError regardless of body", () => {
    const e = thrown(() => handleGitLabError(401, '{"message":"401 Unauthorized"}'));
    expect(e).toBeInstanceOf(SessionExpiredError);
    expect(e).toMatchObject({ status: 401, code: "SESSION_EXPIRED" });
  });

  it("403 -> PermissionDeniedError with GitLab's message, or a default", () => {
    expect(thrown(() => handleGitLabError(403, '{"message":"403 Forbidden"}'))).toMatchObject({
      constructor: PermissionDeniedError,
      message: "403 Forbidden",
      code: "PERMISSION_DENIED",
    });
    expect((thrown(() => handleGitLabError(403, "")) as Error).message).toBe(
      "You don't have permission to perform this action.",
    );
  });

  it("404 -> NotFoundError", () => {
    const e = thrown(() => handleGitLabError(404, '{"message":"404 Project Not Found"}'));
    expect(e).toBeInstanceOf(NotFoundError);
    expect((e as Error).message).toBe("404 Project Not Found");
    expect((thrown(() => handleGitLabError(404, "")) as Error).message).toBe("Resource not found.");
  });

  it("429 -> RateLimitError using retry-after, defaulting to 60s", () => {
    const e = thrown(() => handleGitLabError(429, "", "17")) as RateLimitError;
    expect(e).toBeInstanceOf(RateLimitError);
    expect(e.retryAfter).toBe(17);
    expect(e.status).toBe(429);
    expect((thrown(() => handleGitLabError(429, "", null)) as RateLimitError).retryAfter).toBe(60);
    expect((thrown(() => handleGitLabError(429, "", "garbage")) as RateLimitError).retryAfter).toBe(60);
  });

  it("other statuses -> generic GitLabApiError with message or status fallback", () => {
    const e = thrown(() => handleGitLabError(500, "")) as GitLabApiError;
    expect(e).toBeInstanceOf(GitLabApiError);
    expect(e).not.toBeInstanceOf(NotFoundError);
    expect(e).toMatchObject({ status: 500, code: "GITLAB_API_ERROR", message: "GitLab API error (500)" });
    expect((thrown(() => handleGitLabError(422, '{"message":"name taken"}')) as Error).message).toBe("name taken");
  });

  it("typed errors are GitLabApiError subclasses", () => {
    expect(new SessionExpiredError()).toBeInstanceOf(GitLabApiError);
    expect(new RateLimitError(5)).toBeInstanceOf(GitLabApiError);
  });
});

describe("errorMessage", () => {
  it("uses Error.message and hides non-Error values", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("secret string")).toBe("Unexpected error");
    expect(errorMessage(undefined)).toBe("Unexpected error");
  });
});
