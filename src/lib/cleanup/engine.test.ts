import { describe, expect, it, vi } from "vitest";
import type { GitLabClient } from "@/lib/gitlab/client";
import type { GitLabPackage } from "@/lib/gitlab/types";
import { compilePattern, MAX_SCAN, planCleanup } from "./engine";

// planCleanup is pure apart from the injected client; keep the DB/audit/session layers out of the test
// (vi.mock calls are hoisted above the imports).
vi.mock("@/lib/db", () => ({ db: {}, sql: {} }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/dal", () => ({ getAuthenticatedClient: vi.fn() }));

const NOW = Date.parse("2026-06-01T00:00:00Z");
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();

let nextId = 1;
function pkg(name: string, version: string, ageDays: number, over: Partial<GitLabPackage> = {}): GitLabPackage {
  return {
    id: nextId++,
    name,
    version,
    package_type: "npm",
    status: "default",
    created_at: daysAgo(ageDays),
    _links: { web_path: "/x" },
    ...over,
  };
}

function fakeClient(packages: GitLabPackage[]) {
  const requestAll = vi.fn(async () => packages);
  return { client: { requestAll } as unknown as GitLabClient, requestAll };
}

type Rules = Parameters<typeof planCleanup>[1];
const rules = (over: Partial<Rules>): Rules => ({
  projectId: 5,
  packageType: null,
  namePattern: null,
  keepLatest: null,
  olderThanDays: null,
  ...over,
});

const versions = (plan: { toDelete: { name: string; version: string }[] }) =>
  plan.toDelete.map((p) => `${p.name}@${p.version}`);

describe("compilePattern", () => {
  it("returns null for an empty pattern and a RegExp otherwise", () => {
    expect(compilePattern(null)).toBeNull();
    expect(compilePattern("")).toBeNull();
    expect(compilePattern("^a")?.test("abc")).toBe(true);
  });

  it("throws on invalid or overlong patterns", () => {
    expect(() => compilePattern("([")).toThrow(/Invalid regular expression/);
    expect(() => compilePattern("a".repeat(201))).toThrow(/at most 200/);
  });
});

describe("planCleanup", () => {
  it("requires keepLatest and/or olderThanDays before touching GitLab", async () => {
    const { client, requestAll } = fakeClient([]);
    await expect(planCleanup(client, rules({}), NOW)).rejects.toThrow(/keep latest/);
    expect(requestAll).not.toHaveBeenCalled();
  });

  it("rejects an invalid regex before touching GitLab", async () => {
    const { client, requestAll } = fakeClient([]);
    await expect(planCleanup(client, rules({ keepLatest: 1, namePattern: "(" }), NOW)).rejects.toThrow();
    expect(requestAll).not.toHaveBeenCalled();
  });

  it("lists the project's packages newest first, filtered by type, capped at MAX_SCAN", async () => {
    const { client, requestAll } = fakeClient([]);
    await planCleanup(client, rules({ keepLatest: 1, packageType: "maven" }), NOW);
    expect(requestAll).toHaveBeenCalledWith(
      "/projects/5/packages?package_type=maven&order_by=created_at&sort=desc",
      { maxItems: MAX_SCAN },
    );
  });

  it("keeps the latest N per name regardless of input order", async () => {
    const { client } = fakeClient([
      pkg("a", "1", 30),
      pkg("a", "3", 10),
      pkg("b", "1", 50),
      pkg("a", "2", 20),
      pkg("a", "4", 5),
      pkg("b", "2", 40),
    ]);
    const plan = await planCleanup(client, rules({ keepLatest: 2 }), NOW);
    expect(versions(plan).sort()).toEqual(["a@1", "a@2"]);
    expect(plan).toMatchObject({ scanned: 6, matched: 6, kept: 4, truncated: false });
  });

  it("ranks the same name separately per package type", async () => {
    const { client } = fakeClient([pkg("lib", "2", 1), pkg("lib", "1", 2), pkg("lib", "1", 3, { package_type: "pypi" })]);
    const plan = await planCleanup(client, rules({ keepLatest: 1 }), NOW);
    expect(plan.toDelete.map((p) => [p.package_type, p.version])).toEqual([["npm", "1"]]);
  });

  it("older-than deletes only versions strictly older than the cutoff", async () => {
    const { client } = fakeClient([pkg("a", "new", 29), pkg("a", "edge", 30), pkg("a", "old", 31), pkg("b", "older", 90)]);
    const plan = await planCleanup(client, rules({ olderThanDays: 30 }), NOW);
    expect(versions(plan)).toEqual(["a@old", "b@older"]);
    expect(plan.kept).toBe(2);
  });

  it("combines rules: beyond the latest N AND older than the cutoff", async () => {
    const { client } = fakeClient([pkg("a", "4", 1), pkg("a", "3", 5), pkg("a", "2", 60), pkg("a", "1", 90), pkg("b", "1", 365)]);
    const plan = await planCleanup(client, rules({ keepLatest: 1, olderThanDays: 30 }), NOW);
    // a@3 is beyond the latest 1 but too new; b@1 is old but it is b's only (latest) version.
    expect(versions(plan)).toEqual(["a@2", "a@1"]);
    expect(plan).toMatchObject({ matched: 5, kept: 3 });
  });

  it("applies the name regex and package type filter", async () => {
    const { client } = fakeClient([
      pkg("@acme/ui", "1", 100),
      pkg("@acme/ui", "2", 50),
      pkg("@other/ui", "1", 100),
      pkg("@acme/core", "1", 100, { package_type: "maven" }),
    ]);
    const plan = await planCleanup(client, rules({ olderThanDays: 10, namePattern: "^@acme/", packageType: "npm" }), NOW);
    expect(versions(plan)).toEqual(["@acme/ui@2", "@acme/ui@1"]);
    expect(plan).toMatchObject({ scanned: 4, matched: 2, kept: 0 });
  });

  it("never deletes processing or pending_destruction versions, and they don't use a keep slot", async () => {
    const { client } = fakeClient([
      pkg("a", "5-uploading", 1, { status: "processing" }),
      pkg("a", "4", 2),
      pkg("a", "3-deleting", 3, { status: "pending_destruction" }),
      pkg("a", "2", 4),
      pkg("a", "1-broken", 5, { status: "error" }),
    ]);
    const plan = await planCleanup(client, rules({ keepLatest: 1 }), NOW);
    expect(versions(plan)).toEqual(["a@2", "a@1-broken"]);
    expect(plan).toMatchObject({ matched: 5, kept: 3 });
  });

  it("returns planned deletions with the fields needed to delete and audit", async () => {
    const p = pkg("a", "1", 100);
    const { client } = fakeClient([p]);
    const plan = await planCleanup(client, rules({ olderThanDays: 1 }), NOW);
    expect(plan.toDelete).toEqual([{ id: p.id, name: "a", version: "1", package_type: "npm", created_at: p.created_at }]);
  });

  it("flags a truncated scan when the listing hits MAX_SCAN", async () => {
    const many = Array.from({ length: MAX_SCAN }, (_, i) => pkg("a", String(i), 1));
    const { client } = fakeClient(many);
    const plan = await planCleanup(client, rules({ keepLatest: MAX_SCAN }), NOW);
    expect(plan).toMatchObject({ truncated: true, scanned: MAX_SCAN, toDelete: [] });
  });
});
