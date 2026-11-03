import { describe, expect, it } from "vitest";
import type { GitLabPackage, GitLabPipelineRef } from "@/lib/gitlab/types";
import {
  bucketLabel,
  buildActivity,
  countByFormat,
  DEFAULT_RANGE,
  isPipelinePublished,
  parseRange,
  publisherOf,
  rangeLabel,
  rangeWindow,
  tickLabel,
} from "./range";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-06-10T10:30:00Z");
const PIPELINE: GitLabPipelineRef = { id: 77, ref: "main", sha: "abc", status: "success" };

let nextId = 1;
function pkg(createdAt: string | number, over: Partial<GitLabPackage> = {}): GitLabPackage {
  return {
    id: nextId++,
    name: "lib",
    version: "1.0.0",
    package_type: "npm",
    status: "default",
    created_at: typeof createdAt === "number" ? new Date(createdAt).toISOString() : createdAt,
    _links: { web_path: "/x" },
    ...over,
  };
}

describe("parseRange / rangeLabel", () => {
  it("accepts known ranges, the first of an array, and defaults otherwise", () => {
    expect(parseRange("24h")).toBe("24h");
    expect(parseRange(["7d", "24h"])).toBe("7d");
    expect(parseRange("1y")).toBe(DEFAULT_RANGE);
    expect(parseRange(undefined)).toBe(DEFAULT_RANGE);
    expect(parseRange([])).toBe(DEFAULT_RANGE);
    expect(DEFAULT_RANGE).toBe("30d");
  });

  it("labels each range", () => {
    expect(rangeLabel("24h")).toBe("last 24 hours");
    expect(rangeLabel("7d")).toBe("last 7 days");
    expect(rangeLabel("30d")).toBe("last 30 days");
  });
});

describe("rangeWindow", () => {
  it("24h: 24 hourly buckets ending with the current partial hour", () => {
    const w = rangeWindow("24h", NOW);
    expect(w).toMatchObject({ bucketMs: HOUR, buckets: 24, end: NOW });
    expect(new Date(w.start).toISOString()).toBe("2026-06-09T11:00:00.000Z");
  });

  it("7d: 28 six-hour buckets aligned to UTC 6h boundaries", () => {
    const w = rangeWindow("7d", NOW);
    expect(w).toMatchObject({ bucketMs: 6 * HOUR, buckets: 28 });
    expect(new Date(w.start).toISOString()).toBe("2026-06-03T12:00:00.000Z");
  });

  it("30d: 30 daily buckets aligned to UTC midnight", () => {
    const w = rangeWindow("30d", NOW);
    expect(w).toMatchObject({ bucketMs: DAY, buckets: 30 });
    expect(new Date(w.start).toISOString()).toBe("2026-05-12T00:00:00.000Z");
  });
});

describe("isPipelinePublished / publisherOf", () => {
  it("detects CI-published packages", () => {
    expect(isPipelinePublished(pkg(NOW, { pipeline: PIPELINE }))).toBe(true);
    expect(isPipelinePublished(pkg(NOW, { pipelines: [PIPELINE] }))).toBe(true);
    expect(isPipelinePublished(pkg(NOW, { pipeline: null, pipelines: [] }))).toBe(false);
  });

  it("names the pipeline user, falls back to CI, or a dash without a pipeline", () => {
    const user = { id: 1, username: "jane", name: "Jane", avatar_url: "" };
    expect(publisherOf(pkg(NOW, { pipeline: { ...PIPELINE, user } }))).toEqual({ label: "@jane", pipelineId: 77 });
    expect(publisherOf(pkg(NOW, { pipelines: [{ ...PIPELINE, id: 5 }] }))).toEqual({ label: "CI", pipelineId: 5 });
    expect(publisherOf(pkg(NOW))).toEqual({ label: "—", pipelineId: null });
  });
});

describe("buildActivity", () => {
  it("buckets packages in range into CI vs direct", () => {
    const { start } = rangeWindow("24h", NOW);
    const a = buildActivity(
      [
        pkg(start, { pipeline: PIPELINE }), // first bucket, inclusive
        pkg(start + 30 * 60_000), // first bucket
        pkg(NOW, { pipeline: PIPELINE }), // last (current) bucket
        pkg(NOW - 10 * 60_000), // last bucket
        pkg(start - 1), // before range
        pkg(NOW + 1), // in the future
        pkg("not-a-date"),
      ],
      "24h",
      NOW,
    );
    expect(a.buckets).toHaveLength(24);
    expect(a.buckets[0]).toEqual({ start, ci: 1, direct: 1 });
    expect(a.buckets[23]).toMatchObject({ start: start + 23 * HOUR, ci: 1, direct: 1 });
    expect(a).toMatchObject({ ci: 2, direct: 2, total: 4, max: 2, start, bucketMs: HOUR });
  });

  it("returns empty buckets and max 0 with no packages", () => {
    const a = buildActivity([], "7d", NOW);
    expect(a.buckets).toHaveLength(28);
    expect(a).toMatchObject({ ci: 0, direct: 0, total: 0, max: 0 });
  });
});

describe("countByFormat", () => {
  it("counts per type, most common first, ties alphabetical", () => {
    const list = [
      pkg(NOW, { package_type: "npm" }),
      pkg(NOW, { package_type: "maven" }),
      pkg(NOW, { package_type: "npm" }),
      pkg(NOW, { package_type: "conan" }),
    ];
    expect(countByFormat(list)).toEqual([
      { type: "npm", count: 2 },
      { type: "conan", count: 1 },
      { type: "maven", count: 1 },
    ]);
  });
});

describe("bucketLabel / tickLabel", () => {
  const ts = Date.parse("2026-06-09T18:00:00Z");

  it("formats labels in UTC per bucket size", () => {
    expect(bucketLabel(ts, HOUR)).toBe("18:00");
    expect(bucketLabel(ts, 6 * HOUR)).toBe("Jun 9 18:00");
    expect(bucketLabel(ts, DAY)).toBe("Jun 9");
  });

  it("ticks show time for hourly buckets and dates otherwise", () => {
    expect(tickLabel(ts, HOUR)).toBe("18:00");
    expect(tickLabel(ts, 6 * HOUR)).toBe("Jun 9");
    expect(tickLabel(ts, DAY)).toBe("Jun 9");
  });
});
