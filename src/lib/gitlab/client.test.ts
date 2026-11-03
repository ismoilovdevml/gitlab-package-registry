import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildQuery, createGitLabClient } from "./client";
import { NotFoundError, PermissionDeniedError, RateLimitError, SessionExpiredError } from "./errors";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const calledUrl = (i = 0) => String(fetchMock.mock.calls[i][0]);
const calledInit = (i = 0) => fetchMock.mock.calls[i][1] as RequestInit & { headers: Record<string, string> };

describe("buildQuery", () => {
  it("returns an empty string when nothing is set", () => {
    expect(buildQuery()).toBe("");
    expect(buildQuery({ a: undefined, b: null, c: "" })).toBe("");
  });

  it("skips empty values but keeps falsy numbers and booleans", () => {
    expect(buildQuery({ page: 0, simple: false, q: "", x: null, sort: "desc" })).toBe("?page=0&simple=false&sort=desc");
  });

  it("encodes values", () => {
    expect(buildQuery({ package_name: "@acme/ui lib" })).toBe("?package_name=%40acme%2Fui+lib");
  });
});

describe("createGitLabClient", () => {
  it("strips trailing slashes from the base URL", () => {
    const c = createGitLabClient({ baseUrl: "https://gl.example.com///", token: "" });
    expect(c.webUrl).toBe("https://gl.example.com");
    expect(c.apiUrl).toBe("https://gl.example.com/api/v4");
  });

  it("sends a Bearer token only when one is provided", async () => {
    fetchMock.mockImplementation(async () => json({ version: "17.0" }));
    await createGitLabClient({ baseUrl: "https://gl", token: "tok" }).getVersion();
    expect(calledInit(0).headers.Authorization).toBe("Bearer tok");

    await createGitLabClient({ baseUrl: "https://gl", token: "" }).getVersion();
    expect(calledInit(1).headers).not.toHaveProperty("Authorization");
  });

  describe("request", () => {
    const client = () => createGitLabClient({ baseUrl: "https://gl", token: "t" });

    it("parses JSON and sets Content-Type only for string bodies", async () => {
      fetchMock.mockImplementation(async () => json({ id: 1 }));
      await expect(client().request("/projects/1", { method: "PUT", body: '{"a":1}' })).resolves.toEqual({ id: 1 });
      expect(calledUrl()).toBe("https://gl/api/v4/projects/1");
      expect(calledInit().headers).toMatchObject({ Accept: "application/json", "Content-Type": "application/json" });

      await client().request("/projects/1");
      expect(calledInit(1).headers).not.toHaveProperty("Content-Type");
    });

    it("returns undefined for 204 and empty bodies", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      await expect(client().request("/x", { method: "DELETE" })).resolves.toBeUndefined();
      fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));
      await expect(client().request("/x")).resolves.toBeUndefined();
    });

    it.each([
      [401, SessionExpiredError],
      [403, PermissionDeniedError],
      [404, NotFoundError],
    ])("maps HTTP %i to a typed error", async (status, ErrorClass) => {
      fetchMock.mockImplementation(async () => json({ message: `${status} nope` }, { status }));
      await expect(client().request("/x")).rejects.toBeInstanceOf(ErrorClass);
    });

    it("surfaces GitLab's JSON message on errors", async () => {
      fetchMock.mockImplementation(async () => json({ message: "404 Project Not Found" }, { status: 404 }));
      await expect(client().request("/projects/9")).rejects.toThrow("404 Project Not Found");
    });

    it("passes retry-after into RateLimitError", async () => {
      fetchMock.mockImplementation(async () => json({ message: "slow down" }, { status: 429, headers: { "retry-after": "30" } }));
      const err = await client().request("/x").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfter).toBe(30);
    });
  });

  describe("requestPaginated", () => {
    const client = () => createGitLabClient({ baseUrl: "https://gl", token: "" });

    it("reads totals and paging from headers", async () => {
      fetchMock.mockResolvedValue(
        json([{ id: 1 }, { id: 2 }], {
          headers: { "x-total": "45", "x-total-pages": "3", "x-page": "2", "x-next-page": "3" },
        }),
      );
      const res = await client().requestPaginated<{ id: number }>("/projects/1/packages", { page: 2, per_page: 20 });
      expect(res).toEqual({ data: [{ id: 1 }, { id: 2 }], totalItems: 45, totalPages: 3, currentPage: 2, nextPage: 3 });
      expect(calledUrl()).toBe("https://gl/api/v4/projects/1/packages?page=2&per_page=20");
    });

    it("appends paging params with & when the path already has a query", async () => {
      fetchMock.mockImplementation(async () => json([]));
      await client().requestPaginated("/groups/1/packages?package_type=npm", { page: 1, sort: "desc" });
      expect(calledUrl()).toBe("https://gl/api/v4/groups/1/packages?package_type=npm&page=1&sort=desc");
    });

    it("leaves the path untouched without params", async () => {
      fetchMock.mockImplementation(async () => json([]));
      await client().requestPaginated("/projects");
      expect(calledUrl()).toBe("https://gl/api/v4/projects");
    });

    it("falls back gracefully when GitLab omits x-total / x-total-pages", async () => {
      fetchMock.mockImplementation(async () => json([{ id: 1 }, { id: 2 }, { id: 3 }], { headers: { "x-page": "4", "x-next-page": "5" } }));
      const more = await client().requestPaginated("/projects", { page: 4 });
      expect(more).toMatchObject({ totalItems: 3, currentPage: 4, nextPage: 5, totalPages: 5 });

      fetchMock.mockImplementation(async () => json([{ id: 1 }], { headers: { "x-next-page": "" } }));
      const last = await client().requestPaginated("/projects", { page: 7 });
      expect(last).toMatchObject({ totalItems: 1, currentPage: 7, nextPage: null, totalPages: 7 });
    });

    it("throws typed errors for non-2xx", async () => {
      fetchMock.mockImplementation(async () => json({ message: "403 Forbidden" }, { status: 403 }));
      await expect(client().requestPaginated("/projects")).rejects.toBeInstanceOf(PermissionDeniedError);
    });
  });

  describe("requestAll", () => {
    const client = () => createGitLabClient({ baseUrl: "https://gl", token: "" });
    const page = (ids: number[], next: number | null) =>
      json(
        ids.map((id) => ({ id })),
        { headers: next ? { "x-next-page": String(next) } : {} },
      );

    it("follows x-next-page until exhausted", async () => {
      fetchMock
        .mockResolvedValueOnce(page([1, 2], 2))
        .mockResolvedValueOnce(page([3, 4], 3))
        .mockResolvedValueOnce(page([5], null));
      const all = await client().requestAll<{ id: number }>("/projects", { perPage: 2 });
      expect(all.map((x) => x.id)).toEqual([1, 2, 3, 4, 5]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(calledUrl(0)).toBe("https://gl/api/v4/projects?page=1&per_page=2");
      expect(calledUrl(2)).toBe("https://gl/api/v4/projects?page=3&per_page=2");
    });

    it("stops fetching once maxItems is reached and trims the overshoot", async () => {
      fetchMock.mockResolvedValueOnce(page([1, 2, 3], 2)).mockResolvedValueOnce(page([4, 5, 6], 3));
      const all = await client().requestAll<{ id: number }>("/projects", { perPage: 3, maxItems: 5 });
      expect(all.map((x) => x.id)).toEqual([1, 2, 3, 4, 5]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("propagates errors from any page", async () => {
      fetchMock.mockResolvedValueOnce(page([1], 2)).mockResolvedValueOnce(json({}, { status: 401 }));
      await expect(client().requestAll("/projects")).rejects.toBeInstanceOf(SessionExpiredError);
    });
  });

  describe("testConnection", () => {
    const client = () => createGitLabClient({ baseUrl: "https://gl", token: "" });

    it("reports the version on success", async () => {
      fetchMock.mockImplementation(async () => json({ version: "17.5.0" }));
      await expect(client().testConnection()).resolves.toEqual({ ok: true, version: "17.5.0" });
    });

    it("treats 401/403 as reachable", async () => {
      fetchMock.mockImplementation(async () => json({}, { status: 403 }));
      await expect(client().testConnection()).resolves.toEqual({ ok: true, version: "unknown (auth required)" });
    });

    it("reports other HTTP failures", async () => {
      fetchMock.mockImplementation(async () => json({}, { status: 502 }));
      await expect(client().testConnection()).resolves.toEqual({ ok: false, error: "GitLab responded with HTTP 502" });
    });

    it("explains untrusted TLS certificates", async () => {
      fetchMock.mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: { code: "SELF_SIGNED_CERT_IN_CHAIN" } }));
      const res = await client().testConnection();
      expect(res.ok).toBe(false);
      expect(res.error).toContain("NODE_EXTRA_CA_CERTS");
    });

    it("uses the network cause message", async () => {
      fetchMock.mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED" } }));
      await expect(client().testConnection()).resolves.toEqual({ ok: false, error: "connect ECONNREFUSED" });
    });
  });
});
