import { describe, expect, it } from "vitest";
import {
  GENERIC_MAX_BYTES,
  genericFileNameSchema,
  genericNameSchema,
  genericVersionSchema,
  HELM_MAX_BYTES,
  helmChannelSchema,
  helmFileNameSchema,
  isUploadFormat,
  maxBytesFor,
  publishRequestSchema,
  validationError,
} from "./validation";

describe("upload formats", () => {
  it("only generic and helm upload from the browser", () => {
    expect(isUploadFormat("generic")).toBe(true);
    expect(isUploadFormat("helm")).toBe(true);
    expect(isUploadFormat("npm")).toBe(false);
    expect(isUploadFormat("")).toBe(false);
  });

  it("per-format size caps", () => {
    expect(maxBytesFor("generic")).toBe(GENERIC_MAX_BYTES);
    expect(maxBytesFor("helm")).toBe(HELM_MAX_BYTES);
    expect(GENERIC_MAX_BYTES).toBe(5 * 1024 ** 3);
  });
});

describe("generic name", () => {
  it.each(["my-tool", "My_Tool.v2", "a+b", "x"])("accepts %s", (v) => {
    expect(validationError(genericNameSchema, v)).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(genericNameSchema.parse("  tool  ")).toBe("tool");
  });

  it.each([
    ["", "Package name is required."],
    ["   ", "Package name is required."],
    ["my tool", "Package name may only contain letters, digits, and . _ - +"],
    ["a/b", "Package name may only contain letters, digits, and . _ - +"],
    [".", "Package name can't be '.' or '..'."],
    ["..", "Package name can't be '.' or '..'."],
    ["a".repeat(256), "Package name is too long."],
  ])("rejects %j", (v, message) => {
    expect(validationError(genericNameSchema, v)).toBe(message);
  });
});

describe("generic version", () => {
  it.each(["1.0.0", "1.0.0-rc_1+build.5", "v2"])("accepts %s", (v) => {
    expect(validationError(genericVersionSchema, v)).toBeNull();
  });

  it.each([
    ["", "Version is required."],
    ["1.0 beta", "Version may only contain letters, digits, and . _ - +"],
    ["1..0", "Version can't contain '..'."],
  ])("rejects %j", (v, message) => {
    expect(validationError(genericVersionSchema, v)).toBe(message);
  });
});

describe("generic file name", () => {
  it.each(["tool.tar.gz", "a~b@c.zip", "v1+2"])("accepts %s", (v) => {
    expect(validationError(genericFileNameSchema, v)).toBeNull();
  });

  it.each([
    ["", "File name is required."],
    ["my file.txt", "File name may only contain letters, digits, and . _ - + ~ @ (no spaces)."],
    ["~tool", "File name can't start or end with ~ or @."],
    ["tool@", "File name can't start or end with ~ or @."],
    ["dir/file", "File name may only contain letters, digits, and . _ - + ~ @ (no spaces)."],
  ])("rejects %j", (v, message) => {
    expect(validationError(genericFileNameSchema, v)).toBe(message);
  });
});

describe("helm", () => {
  it.each(["stable", "dev-2", "a.b_c", "x"])("accepts channel %s", (v) => {
    expect(validationError(helmChannelSchema, v)).toBeNull();
  });

  it.each(["", "-stable", "stable-", "a..b", "a b"])("rejects channel %j", (v) => {
    expect(validationError(helmChannelSchema, v)).not.toBeNull();
  });

  it("requires a .tgz chart (case-insensitive)", () => {
    expect(validationError(helmFileNameSchema, "chart-1.0.0.tgz")).toBeNull();
    expect(validationError(helmFileNameSchema, "CHART.TGZ")).toBeNull();
    expect(validationError(helmFileNameSchema, "chart.tar.gz")).toBe("Helm charts must be packaged .tgz files (helm package).");
  });
});

describe("publishRequestSchema", () => {
  it("parses a generic request, coercing projectId", () => {
    expect(
      publishRequestSchema.parse({ format: "generic", projectId: "12", name: " tool ", version: "1.0", fileName: "t.bin" }),
    ).toEqual({ format: "generic", projectId: 12, name: "tool", version: "1.0", fileName: "t.bin" });
  });

  it("parses a helm request", () => {
    expect(publishRequestSchema.parse({ format: "helm", projectId: 3, channel: "stable", fileName: "c.tgz" })).toEqual({
      format: "helm",
      projectId: 3,
      channel: "stable",
      fileName: "c.tgz",
    });
  });

  it("rejects other formats with a friendly message", () => {
    expect(validationError(publishRequestSchema, { format: "npm", projectId: 1 })).toBe(
      "Only Generic files and Helm charts can be uploaded from the browser.",
    );
  });

  it.each([undefined, "0", "-1", "abc", "1.5"])("rejects projectId %j", (projectId) => {
    const res = publishRequestSchema.safeParse({ format: "helm", projectId, channel: "stable", fileName: "c.tgz" });
    expect(res.success).toBe(false);
  });
});
