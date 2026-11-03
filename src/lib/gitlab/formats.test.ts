import { describe, expect, it } from "vitest";
import { FORMATS, getFormat, PACKAGE_TYPES, type FormatKey } from "./formats";

describe("FORMATS", () => {
  it("every entry is keyed by its own key and has a label, badge and hex color", () => {
    for (const [key, info] of Object.entries(FORMATS)) {
      expect(info.key).toBe(key);
      expect(info.label).not.toBe("");
      expect(info.badge).toMatch(/\bbg-/);
      expect(info.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("has metadata for every packages-API type", () => {
    for (const t of PACKAGE_TYPES) expect(FORMATS[t as FormatKey]).toBeDefined();
  });

  it("PACKAGE_TYPES excludes container images (they live in the registry API)", () => {
    expect(PACKAGE_TYPES).not.toContain("container");
  });
});

describe("getFormat", () => {
  it("returns known formats", () => {
    expect(getFormat("golang").label).toBe("Go");
    expect(getFormat("terraform_module").label).toBe("Terraform");
  });

  it("treats missing types as generic", () => {
    expect(getFormat(null)).toBe(FORMATS.generic);
    expect(getFormat(undefined)).toBe(FORMATS.generic);
    expect(getFormat("")).toBe(FORMATS.generic);
  });

  it("falls back to generic styling but keeps the unknown type as label", () => {
    const f = getFormat("cargo");
    expect(f.label).toBe("cargo");
    expect(f.key).toBe("cargo");
    expect(f.badge).toBe(FORMATS.generic.badge);
    expect(f.color).toBe(FORMATS.generic.color);
  });
});
