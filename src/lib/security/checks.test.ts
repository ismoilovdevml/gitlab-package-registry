import { describe, expect, it } from "vitest";
import type { GitLabPackage, GitLabPackageFile, GitLabPipelineRef, GitLabProject } from "@/lib/gitlab/types";
import {
  checkChecksums,
  checkExposure,
  checkPackageStatus,
  checkProvenance,
  checkStale,
  filterFindings,
  hasPipeline,
  isActivePackage,
  parseCheck,
  parseSeverity,
  runChecks,
  sortFindings,
  STUCK_PROCESSING_MS,
  summarize,
  type Finding,
} from "./checks";

const NOW = Date.parse("2026-06-01T12:00:00Z");
const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const PIPELINE: GitLabPipelineRef = { id: 9, ref: "main", sha: "abc", status: "success" };

let nextId = 100;
function pkg(over: Partial<GitLabPackage> = {}): GitLabPackage {
  return {
    id: nextId++,
    name: "lib",
    version: "1.0.0",
    package_type: "generic",
    status: "default",
    created_at: iso(DAY),
    project_id: 1,
    project_path: "acme/app",
    _links: { web_path: "/x" },
    pipeline: PIPELINE,
    ...over,
  };
}

function file(over: Partial<GitLabPackageFile> = {}): GitLabPackageFile {
  return {
    id: nextId++,
    package_id: 1,
    file_name: "f.tgz",
    size: 10,
    file_md5: "m",
    file_sha1: "s1",
    file_sha256: "s256",
    created_at: iso(DAY),
    ...over,
  };
}

function project(id: number, visibility: GitLabProject["visibility"]): GitLabProject {
  return {
    id,
    name: `p${id}`,
    name_with_namespace: `acme / p${id}`,
    path: `p${id}`,
    path_with_namespace: `acme/p${id}`,
    description: null,
    avatar_url: null,
    web_url: `https://gl/acme/p${id}`,
    visibility,
    namespace: { id: 1, name: "acme" },
  } as GitLabProject;
}

describe("isActivePackage / hasPipeline", () => {
  it("only default and hidden packages are active", () => {
    expect(["default", "hidden", "error", "processing", "pending_destruction"].map((status) => isActivePackage(pkg({ status })))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("detects pipeline or pipelines", () => {
    expect(hasPipeline(pkg({ pipeline: PIPELINE }))).toBe(true);
    expect(hasPipeline(pkg({ pipeline: null, pipelines: [PIPELINE] }))).toBe(true);
    expect(hasPipeline(pkg({ pipeline: null, pipelines: [] }))).toBe(false);
    expect(hasPipeline(pkg({ pipeline: undefined }))).toBe(false);
  });
});

describe("checkPackageStatus", () => {
  it("error -> high", () => {
    const p = pkg({ status: "error" });
    const [f] = checkPackageStatus([p], NOW);
    expect(f).toMatchObject({ id: `status:${p.id}`, check: "package_status", severity: "high" });
    expect(f.target).toMatchObject({ kind: "package", projectId: 1, packageId: p.id, name: "lib", version: "1.0.0" });
  });

  it("processing is fine until it is older than the stuck threshold", () => {
    expect(checkPackageStatus([pkg({ status: "processing", created_at: iso(STUCK_PROCESSING_MS - 1000) })], NOW)).toEqual([]);
    const [f] = checkPackageStatus([pkg({ status: "processing", created_at: iso(3 * 3_600_000) })], NOW);
    expect(f).toMatchObject({ severity: "medium", title: "Stuck in processing" });
    expect(f.detail).toContain("3 h after upload");
    const [old] = checkPackageStatus([pkg({ status: "processing", created_at: iso(2 * DAY) })], NOW);
    expect(old.detail).toContain("2 d after upload");
  });

  it("processing with an unparseable date is skipped", () => {
    expect(checkPackageStatus([pkg({ status: "processing", created_at: "garbage" })], NOW)).toEqual([]);
  });

  it("pending_destruction -> low", () => {
    expect(checkPackageStatus([pkg({ status: "pending_destruction" })], NOW)[0].severity).toBe("low");
  });

  it("ignores healthy packages and packages without a project", () => {
    expect(checkPackageStatus([pkg(), pkg({ status: "hidden" }), pkg({ status: "error", project_id: undefined })], NOW)).toEqual([]);
  });
});

describe("checkProvenance", () => {
  it("flags active packages without a pipeline as medium", () => {
    const manual = pkg({ pipeline: null });
    const findings = checkProvenance([manual, pkg(), pkg({ pipeline: null, status: "error" })]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: `provenance:${manual.id}`, severity: "medium", check: "provenance" });
  });
});

describe("checkChecksums", () => {
  it("no finding when every file has SHA-256 or when there are no files", () => {
    expect(checkChecksums([{ pkg: pkg(), files: [file(), file()] }, { pkg: pkg(), files: [] }])).toEqual([]);
  });

  it("files with only MD5/SHA-1 -> low", () => {
    const p = pkg();
    const [f] = checkChecksums([{ pkg: p, files: [file({ file_sha256: null }), file()] }]);
    expect(f).toMatchObject({ id: `checksum:${p.id}`, severity: "low", title: "No SHA-256 checksum" });
    expect(f.detail).toContain("1 of 2 files");
  });

  it("files with no checksum at all -> medium", () => {
    const [f] = checkChecksums([
      { pkg: pkg(), files: [file({ file_sha256: null, file_sha1: null, file_md5: null })] },
    ]);
    expect(f).toMatchObject({ severity: "medium", title: "Files without any checksum" });
    expect(f.detail).toContain("1 of 1 file lack");
  });

  it("skips packages without a project", () => {
    expect(checkChecksums([{ pkg: pkg({ project_id: undefined }), files: [file({ file_sha256: null })] }])).toEqual([]);
  });
});

describe("checkExposure", () => {
  const projects = new Map([
    [1, project(1, "public")],
    [2, project(2, "internal")],
    [3, project(3, "private")],
  ]);

  it("public -> high, internal -> medium, private/unknown -> nothing; one finding per project", () => {
    const findings = checkExposure(
      [pkg({ project_id: 1 }), pkg({ project_id: 1 }), pkg({ project_id: 2 }), pkg({ project_id: 3 }), pkg({ project_id: 4 })],
      projects,
    );
    expect(findings.map((f) => [f.id, f.severity])).toEqual([
      ["exposure:1", "high"],
      ["exposure:2", "medium"],
    ]);
    expect(findings[0].target).toEqual({
      kind: "project",
      projectId: 1,
      path: "acme/p1",
      webUrl: "https://gl/acme/p1",
      packageCount: 2,
    });
    expect(findings[0].detail).toMatch(/^2 packages downloadable by anyone/);
    expect(findings[1].detail).toMatch(/^1 package downloadable by every signed-in user/);
  });
});

describe("checkStale", () => {
  it("flags old, never-downloaded packages", () => {
    const [f] = checkStale([pkg({ created_at: iso(120 * DAY), last_downloaded_at: null })], NOW);
    expect(f).toMatchObject({ severity: "low", title: "Never downloaded" });
    expect(f.detail).toContain("120 d ago");
  });

  it("flags packages last downloaded beyond the threshold", () => {
    const [f] = checkStale([pkg({ created_at: iso(400 * DAY), last_downloaded_at: iso(91 * DAY) })], NOW);
    expect(f).toMatchObject({ title: "Not downloaded recently" });
    expect(f.detail).toBe("Last downloaded 91 d ago.");
  });

  it("skips recent uploads, recent downloads, unknown download data and non-default statuses", () => {
    expect(
      checkStale(
        [
          pkg({ created_at: iso(10 * DAY), last_downloaded_at: null }),
          pkg({ created_at: iso(200 * DAY), last_downloaded_at: iso(5 * DAY) }),
          pkg({ created_at: iso(200 * DAY), last_downloaded_at: undefined }),
          pkg({ created_at: iso(200 * DAY), last_downloaded_at: null, status: "hidden" }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it("honours a custom threshold", () => {
    expect(checkStale([pkg({ created_at: iso(40 * DAY), last_downloaded_at: null })], NOW, 30)).toHaveLength(1);
  });
});

describe("sortFindings / runChecks", () => {
  it("orders by severity, then check order, then id", () => {
    const f = (id: string, check: Finding["check"], severity: Finding["severity"]): Finding => ({
      id,
      check,
      severity,
      title: "",
      detail: "",
      action: "",
      target: { kind: "project", projectId: 1, path: "", webUrl: "", packageCount: 0 },
    });
    const sorted = sortFindings([
      f("stale:1", "stale", "low"),
      f("provenance:2", "provenance", "medium"),
      f("exposure:1", "exposure", "high"),
      f("status:2", "package_status", "medium"),
      f("status:1", "package_status", "medium"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["exposure:1", "status:1", "status:2", "provenance:2", "stale:1"]);
  });

  it("runChecks combines every check, sorted", () => {
    const broken = pkg({ status: "error", project_id: 1 });
    const manual = pkg({ pipeline: null, project_id: 2 });
    const findings = runChecks({
      packages: [broken, manual],
      projects: new Map([[1, project(1, "public")]]),
      checksumScan: [{ pkg: manual, files: [file({ file_sha256: null })] }],
      now: NOW,
    });
    expect(findings.map((x) => [x.id, x.severity])).toEqual([
      [`status:${broken.id}`, "high"],
      ["exposure:1", "high"],
      [`provenance:${manual.id}`, "medium"],
      [`checksum:${manual.id}`, "low"],
    ]);
  });
});

describe("summarize", () => {
  it("counts findings, affected packages (via project findings too) and clean packages", () => {
    const a = pkg({ project_id: 1 });
    const b = pkg({ project_id: 1 });
    const c = pkg({ project_id: 2, pipeline: null });
    const d = pkg({ project_id: 3 });
    const packages = [a, b, c, d];
    const findings = runChecks({
      packages,
      projects: new Map([[1, project(1, "public")]]),
      checksumScan: [],
      now: NOW,
    });
    const s = summarize(findings, packages);

    expect(s.total).toBe(2);
    expect(s.byCheck).toEqual({ package_status: 0, exposure: 1, checksum: 0, provenance: 1, stale: 0 });
    expect(s.bySeverity.high).toEqual({ findings: 1, packages: 2, projects: 1 });
    expect(s.bySeverity.medium).toEqual({ findings: 1, packages: 1, projects: 1 });
    expect(s.bySeverity.low).toEqual({ findings: 0, packages: 0, projects: 0 });
    expect(s).toMatchObject({ affectedPackages: 3, cleanPackages: 1, sampledPackages: 4 });
  });

  it("deduplicates packages hit by several findings and duplicate sample entries", () => {
    const p = pkg({ status: "error", pipeline: null });
    const s = summarize(checkPackageStatus([p], NOW), [p, p]);
    expect(s).toMatchObject({ total: 1, affectedPackages: 1, cleanPackages: 0, sampledPackages: 1 });
  });

  it("all zero for no findings", () => {
    const s = summarize([], [pkg()]);
    expect(s).toMatchObject({ total: 0, affectedPackages: 0, cleanPackages: 1, sampledPackages: 1 });
  });
});

describe("parseSeverity / parseCheck / filterFindings", () => {
  it("parses only known values", () => {
    expect(parseSeverity("high")).toBe("high");
    expect(parseSeverity("critical")).toBeUndefined();
    expect(parseSeverity(1)).toBeUndefined();
    expect(parseCheck("stale")).toBe("stale");
    expect(parseCheck("cve")).toBeUndefined();
  });

  it("filters by severity and/or check", () => {
    const findings = runChecks({
      packages: [pkg({ status: "error" }), pkg({ pipeline: null }), pkg({ status: "pending_destruction" })],
      projects: new Map(),
      checksumScan: [],
      now: NOW,
    });
    expect(filterFindings(findings, {})).toHaveLength(3);
    expect(filterFindings(findings, { severity: "high" }).map((f) => f.check)).toEqual(["package_status"]);
    expect(filterFindings(findings, { check: "package_status" })).toHaveLength(2);
    expect(filterFindings(findings, { severity: "medium", check: "package_status" })).toEqual([]);
  });
});
