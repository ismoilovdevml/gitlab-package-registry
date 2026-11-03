import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { auditQueryString, auditWhere, parseAuditFilters, type AuditFilters } from "./audit-query";

// Only the pure filter helpers are tested; the query functions need a database.
vi.mock("@/lib/db", () => ({ db: {} }));

const dialect = new PgDialect();
const render = (f: AuditFilters, ownUserId: number | null = null) => {
  const where = auditWhere(f, { ownUserId });
  return where ? dialect.sqlToQuery(where) : undefined;
};

const EMPTY: AuditFilters = parseAuditFilters({});

describe("parseAuditFilters", () => {
  it("returns empty filters and page 1 by default", () => {
    expect(EMPTY).toEqual({
      actor: undefined,
      action: undefined,
      project: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
      q: undefined,
      page: 1,
    });
  });

  it("parses valid values from a record (first array value) or URLSearchParams", () => {
    const expected = {
      actor: "jane",
      action: "package.delete",
      project: "acme/app",
      status: "failure",
      from: "2026-01-01",
      to: "2026-01-31",
      q: "lodash",
      page: 3,
    };
    expect(
      parseAuditFilters({
        actor: " jane ",
        action: ["package.delete", "auth.login"],
        project: "acme/app",
        status: "failure",
        from: "2026-01-01",
        to: "2026-01-31",
        q: "lodash",
        page: "3",
      }),
    ).toEqual(expected);
    expect(
      parseAuditFilters(
        new URLSearchParams("actor=jane&action=package.delete&project=acme/app&status=failure&from=2026-01-01&to=2026-01-31&q=lodash&page=3"),
      ),
    ).toEqual(expected);
  });

  it("accepts whole-category action filters", () => {
    expect(parseAuditFilters({ action: "cleanup.*" }).action).toBe("cleanup.*");
  });

  it("drops invalid values instead of failing", () => {
    expect(
      parseAuditFilters({
        action: "package.explode",
        status: "maybe",
        from: "2026-13-45",
        to: "yesterday",
        actor: "x".repeat(201),
        q: "   ",
        page: "-2",
      }),
    ).toEqual({ ...EMPTY });
    expect(parseAuditFilters({ page: "abc" }).page).toBe(1);
    expect(parseAuditFilters({ page: "2000000" }).page).toBe(1);
  });
});

describe("auditQueryString", () => {
  it("is empty for default filters", () => {
    expect(auditQueryString(EMPTY)).toBe("");
  });

  it("serialises set filters and only pages beyond 1", () => {
    const f = parseAuditFilters({ actor: "jane", status: "success", page: "2" });
    expect(auditQueryString(f)).toBe("?actor=jane&status=success&page=2");
    expect(auditQueryString(f, { page: 1 })).toBe("?actor=jane&status=success");
    expect(auditQueryString(f, { actor: undefined, q: "a b" })).toBe("?status=success&q=a+b&page=2");
  });
});

describe("auditWhere", () => {
  it("is undefined without filters for admins", () => {
    expect(render(EMPTY)).toBeUndefined();
  });

  it("scopes non-admins to their own entries and ignores the actor filter", () => {
    const q = render({ ...EMPTY, actor: "someone-else" }, 42)!;
    expect(q.sql).toContain('"user_id" = $1');
    expect(q.params).toEqual([42]);
    expect(q.sql).not.toMatch(/ilike/i);
  });

  it("escapes LIKE wildcards in free-text filters", () => {
    const q = render({ ...EMPTY, actor: "50%_off\\" })!;
    expect(q.params).toEqual(["%50\\%\\_off\\\\%"]);
  });

  it("expands a category filter to its actions", () => {
    const q = render({ ...EMPTY, action: "user.*" })!;
    expect(q.sql).toMatch(/"action" in \(/i);
    expect(q.params).toEqual(["user.role_change", "user.block", "user.unblock", "user.sessions_revoke"]);
  });

  it("uses an exact match for a single action", () => {
    const q = render({ ...EMPTY, action: "auth.login" })!;
    expect(q.sql).toContain('"action" = $1');
    expect(q.params).toEqual(["auth.login"]);
  });

  it("makes the date range inclusive of the whole 'to' day (UTC)", () => {
    const q = render({ ...EMPTY, from: "2026-01-01", to: "2026-01-31" })!;
    expect(q.sql).toMatch(/"created_at" >= \$1 and .*"created_at" < \$2/);
    const [from, to] = q.params as unknown[];
    expect(new Date(from as string).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(new Date(to as string).toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("searches target and IP for q", () => {
    const q = render({ ...EMPTY, q: "10.0" })!;
    expect(q.sql).toMatch(/"target" ilike \$1 or .*"ip" ilike \$2/);
    expect(q.params).toEqual(["%10.0%", "%10.0%"]);
  });
});
