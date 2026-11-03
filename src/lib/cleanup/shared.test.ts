import { describe, expect, it } from "vitest";
import { asRunResult, describePolicy, MAX_PATTERN_LENGTH, patternError } from "./shared";

describe("patternError", () => {
  it("accepts empty and valid patterns", () => {
    expect(patternError(null)).toBeNull();
    expect(patternError(undefined)).toBeNull();
    expect(patternError("")).toBeNull();
    expect(patternError("^@acme/.*-snapshot$")).toBeNull();
  });

  it("rejects invalid regular expressions with the engine's message", () => {
    expect(patternError("([a-z")).toMatch(/Invalid regular expression/);
    expect(patternError("*abc")).not.toBeNull();
  });

  it("rejects patterns longer than the limit", () => {
    expect(patternError("a".repeat(MAX_PATTERN_LENGTH))).toBeNull();
    expect(patternError("a".repeat(MAX_PATTERN_LENGTH + 1))).toBe(`Pattern must be at most ${MAX_PATTERN_LENGTH} characters.`);
  });
});

describe("describePolicy", () => {
  it("describes keep-latest + older-than with type and pattern (slashes escaped)", () => {
    expect(describePolicy({ keepLatest: 5, olderThanDays: 30, packageType: "npm", namePattern: "^@acme/" })).toBe(
      "Keep latest 5 · delete older than 30d · npm · /^@acme\\//",
    );
  });

  it("keep-latest only deletes the rest", () => {
    expect(describePolicy({ keepLatest: 3, olderThanDays: null, packageType: null, namePattern: null })).toBe(
      "Keep latest 3 · delete the rest · all formats · all names",
    );
  });

  it("older-than only starts with a capital", () => {
    expect(describePolicy({ keepLatest: null, olderThanDays: 14, packageType: "golang", namePattern: null })).toBe(
      "Delete older than 14d · Go · all names",
    );
  });

  it("treats 0 as unset", () => {
    expect(describePolicy({ keepLatest: 0, olderThanDays: 7, packageType: null, namePattern: "" })).toBe(
      "Delete older than 7d · all formats · all names",
    );
  });
});

describe("asRunResult", () => {
  it("rejects non-objects and objects without finishedAt", () => {
    expect(asRunResult(null)).toBeNull();
    expect(asRunResult("x")).toBeNull();
    expect(asRunResult({ scanned: 1 })).toBeNull();
  });

  it("fills defaults for missing fields", () => {
    expect(asRunResult({ finishedAt: "2026-01-01T00:00:00Z" })).toEqual({
      scanned: 0,
      matched: 0,
      deleted: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      dryRun: false,
      finishedAt: "2026-01-01T00:00:00Z",
      truncated: false,
      sample: undefined,
      trigger: undefined,
      error: undefined,
    });
  });

  it("keeps valid fields and drops malformed arrays", () => {
    const r = asRunResult({
      finishedAt: "t",
      scanned: 10,
      matched: 4,
      deleted: 3,
      failed: 1,
      errors: "not-an-array",
      dryRun: 1,
      truncated: true,
      sample: [{ name: "a", version: "1" }],
      trigger: "scheduler",
      error: "boom",
    });
    expect(r).toMatchObject({
      scanned: 10,
      matched: 4,
      deleted: 3,
      failed: 1,
      errors: [],
      dryRun: true,
      truncated: true,
      sample: [{ name: "a", version: "1" }],
      trigger: "scheduler",
      error: "boom",
    });
  });
});
