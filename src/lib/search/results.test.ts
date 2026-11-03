import { describe, expect, it } from "vitest";
import type { GitLabPackage } from "@/lib/gitlab/types";
import { countBy, groupPackages, projectOf, sortGroups, UNKNOWN_PROJECT } from "./results";

let nextId = 1;
function pkg(over: Partial<GitLabPackage>): GitLabPackage {
  return {
    id: nextId++,
    name: "lib",
    version: "1.0.0",
    package_type: "npm",
    status: "default",
    created_at: "2026-01-01T00:00:00Z",
    project_id: 1,
    project_path: "acme/app",
    _links: { web_path: "/x" },
    ...over,
  };
}

describe("projectOf", () => {
  it("falls back to a placeholder when the path is missing", () => {
    expect(projectOf(pkg({ project_path: "a/b" }))).toBe("a/b");
    expect(projectOf(pkg({ project_path: undefined }))).toBe(UNKNOWN_PROJECT);
  });
});

describe("groupPackages", () => {
  it("groups versions by project + type + name, newest first", () => {
    const v1 = pkg({ version: "1.0.0", created_at: "2026-01-01T00:00:00Z" });
    const v3 = pkg({ version: "3.0.0", created_at: "2026-03-01T00:00:00Z" });
    const v2 = pkg({ version: "2.0.0", created_at: "2026-02-01T00:00:00Z" });
    const [g, ...rest] = groupPackages([v1, v3, v2]);
    expect(rest).toHaveLength(0);
    expect(g).toMatchObject({ name: "lib", packageType: "npm", projectId: 1, projectPath: "acme/app", key: "1:npm:lib" });
    expect(g.latest).toBe(v3);
    expect(g.versions.map((v) => v.version)).toEqual(["3.0.0", "2.0.0", "1.0.0"]);
  });

  it("keeps same-named packages apart across types and projects", () => {
    const groups = groupPackages([
      pkg({ package_type: "npm" }),
      pkg({ package_type: "maven" }),
      pkg({ project_id: 2, project_path: "acme/other" }),
    ]);
    expect(groups.map((g) => g.key).sort()).toEqual(["1:maven:lib", "1:npm:lib", "2:npm:lib"]);
  });

  it("uses the project path for the key when project_id is missing", () => {
    const [g] = groupPackages([pkg({ project_id: undefined, project_path: "grp/proj" })]);
    expect(g.key).toBe("grp/proj:npm:lib");
    expect(g.projectId).toBeUndefined();
  });

  it("breaks created_at ties by version, highest first", () => {
    const at = "2026-01-01T00:00:00Z";
    const [g] = groupPackages([pkg({ version: "1.9.0", created_at: at }), pkg({ version: "1.10.0", created_at: at })]);
    expect(g.versions.map((v) => v.version)).toEqual(["1.10.0", "1.9.0"]);
  });

  it("treats invalid dates as oldest", () => {
    const bad = pkg({ version: "0.0.1", created_at: "not-a-date" });
    const good = pkg({ version: "0.0.2", created_at: "2026-01-01T00:00:00Z" });
    const [g] = groupPackages([bad, good]);
    expect(g.latest).toBe(good);
    expect(g.versions[0]).toBe(good);
  });

  it("returns no groups for no packages", () => {
    expect(groupPackages([])).toEqual([]);
  });
});

describe("sortGroups", () => {
  const groups = groupPackages([
    pkg({ name: "lodash-es", created_at: "2026-05-01T00:00:00Z" }),
    pkg({ name: "my-lodash-utils", created_at: "2026-06-01T00:00:00Z" }),
    pkg({ name: "@acme/lodash", created_at: "2026-02-01T00:00:00Z" }),
    pkg({ name: "lodash", created_at: "2026-01-01T00:00:00Z" }),
    pkg({ name: "react", created_at: "2026-07-01T00:00:00Z" }),
  ]);

  it("relevance: exact, last path segment, prefix, substring, then the rest", () => {
    expect(sortGroups(groups, "relevance", " LODASH ").map((g) => g.name)).toEqual([
      "lodash",
      "@acme/lodash",
      "lodash-es",
      "my-lodash-utils",
      "react",
    ]);
  });

  it("relevance with an empty needle falls back to newest", () => {
    expect(sortGroups(groups, "relevance", "").map((g) => g.name)).toEqual([
      "react",
      "my-lodash-utils",
      "lodash-es",
      "@acme/lodash",
      "lodash",
    ]);
  });

  it("newest ignores the needle", () => {
    expect(sortGroups(groups, "newest", "lodash")[0].name).toBe("react");
  });

  it("name sorts alphabetically, then by project path", () => {
    const g2 = groupPackages([
      pkg({ name: "b", project_id: 1, project_path: "z/proj" }),
      pkg({ name: "a" }),
      pkg({ name: "b", project_id: 2, project_path: "a/proj" }),
    ]);
    expect(sortGroups(g2, "name", "").map((g) => `${g.name}@${g.projectPath}`)).toEqual(["a@acme/app", "b@a/proj", "b@z/proj"]);
  });

  it("does not mutate the input", () => {
    const before = groups.map((g) => g.key);
    sortGroups(groups, "name", "");
    expect(groups.map((g) => g.key)).toEqual(before);
  });
});

describe("countBy", () => {
  it("counts and sorts by count desc, then value asc", () => {
    const items = ["npm", "maven", "npm", "pypi", "maven", "npm", "conan"];
    expect(countBy(items, (x) => x)).toEqual([
      { value: "npm", count: 3 },
      { value: "maven", count: 2 },
      { value: "conan", count: 1 },
      { value: "pypi", count: 1 },
    ]);
  });

  it("returns an empty list for no items", () => {
    expect(countBy([], String)).toEqual([]);
  });
});
