import { describe, expect, it } from "vitest";
import {
  compareVersions,
  describeVersionFilter,
  highlight,
  matchesVersion,
  parseQuery,
  searchHref,
  toggle,
  type SearchState,
} from "./query";

const SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const SHA1 = "da39a3ee5e6b4b0d3255bfef95601890afd80709";
const MD5 = "d41d8cd98f00b204e9800998ecf8427e";

describe("parseQuery: modes", () => {
  it("empty / whitespace input", () => {
    expect(parseQuery("").mode).toBe("empty");
    expect(parseQuery("   ")).toMatchObject({ mode: "empty", raw: "" });
  });

  it("plain name", () => {
    expect(parseQuery("  lodash ")).toMatchObject({ mode: "name", name: "lodash", version: null, raw: "lodash" });
  });

  it("multi-word name without a version stays one name", () => {
    expect(parseQuery("my cool lib")).toMatchObject({ mode: "name", name: "my cool lib", version: null });
  });

  it("scoped npm names are not split on the leading @", () => {
    expect(parseQuery("@acme/ui")).toMatchObject({ mode: "name", name: "@acme/ui", version: null });
  });

  it("name@version", () => {
    expect(parseQuery("lodash@4.17")).toMatchObject({
      mode: "version",
      name: "lodash",
      version: { op: "prefix", value: "4.17" },
    });
    expect(parseQuery("@acme/ui@2.0.1")).toMatchObject({ name: "@acme/ui", version: { op: "prefix", value: "2.0.1" } });
  });

  it("name@ with an operator", () => {
    expect(parseQuery("@acme/ui@>=2.0").version).toEqual({ op: ">=", value: "2.0" });
    expect(parseQuery("lib@<3").version).toEqual({ op: "<", value: "3" });
  });

  it("trailing @ is part of the name", () => {
    expect(parseQuery("lodash@")).toMatchObject({ mode: "name", name: "lodash@" });
  });

  it("name followed by a version-looking token", () => {
    expect(parseQuery("lodash 4.17.21")).toMatchObject({ name: "lodash", version: { op: "prefix", value: "4.17.21" } });
    expect(parseQuery("api v2")).toMatchObject({ name: "api", version: { op: "prefix", value: "v2" } });
    expect(parseQuery("api 1.0.0-rc.1")).toMatchObject({ name: "api", version: { value: "1.0.0-rc.1" } });
  });

  it("a lone version-looking token is a name", () => {
    expect(parseQuery("2.0")).toMatchObject({ mode: "name", name: "2.0", version: null });
  });

  it("version: / v: qualifiers", () => {
    expect(parseQuery("version:>1.0")).toMatchObject({ mode: "version", name: "", version: { op: ">", value: "1.0" } });
    expect(parseQuery("lodash v:=4.17.21")).toMatchObject({ name: "lodash", version: { op: "=", value: "4.17.21" } });
    expect(parseQuery("version:").mode).toBe("browse");
  });

  it("explicit version: qualifier wins over name@version", () => {
    expect(parseQuery("version:2 lodash@1").version).toEqual({ op: "prefix", value: "2" });
  });

  it("qualifiers only -> browse", () => {
    expect(parseQuery("format:npm")).toMatchObject({ mode: "browse", name: "", formats: ["npm"] });
  });
});

describe("parseQuery: checksums", () => {
  it.each([
    [SHA256, "sha256"],
    [SHA1, "sha1"],
    [MD5, "md5"],
  ])("bare hex %s is detected as %s", (hex, algo) => {
    expect(parseQuery(hex)).toMatchObject({ mode: "checksum", checksum: { algo, value: hex }, name: "" });
  });

  it("bare uppercase hex is lowercased", () => {
    expect(parseQuery(SHA1.toUpperCase()).checksum).toEqual({ algo: "sha1", value: SHA1 });
  });

  it("hex of other lengths is a name", () => {
    expect(parseQuery(SHA1.slice(0, 39))).toMatchObject({ mode: "name", checksum: null });
    expect(parseQuery("deadbeef")).toMatchObject({ mode: "name", name: "deadbeef" });
  });

  it("bare hex next to other words is not a checksum", () => {
    expect(parseQuery(`${MD5} extra`).mode).toBe("name");
  });

  it("prefixed forms set the algorithm from the key, allowing partial digests", () => {
    expect(parseQuery(`sha256:${SHA256}`).checksum).toEqual({ algo: "sha256", value: SHA256 });
    expect(parseQuery("sha1:DA39A3").checksum).toEqual({ algo: "sha1", value: "da39a3" });
    expect(parseQuery("md5:d41d8cd9").checksum).toEqual({ algo: "md5", value: "d41d8cd9" });
  });

  it("checksum:/sha: infer the algorithm from the length, or leave it unknown", () => {
    expect(parseQuery(`checksum:${SHA256}`).checksum).toEqual({ algo: "sha256", value: SHA256 });
    expect(parseQuery(`sha:${MD5}`).checksum).toEqual({ algo: "md5", value: MD5 });
    expect(parseQuery("sha:abcdef12").checksum).toEqual({ algo: null, value: "abcdef12" });
  });

  it("strips a trailing ellipsis from copied short digests", () => {
    expect(parseQuery("sha256:abcdef1234...").checksum?.value).toBe("abcdef1234");
    expect(parseQuery("sha256:abcdef1234…").checksum?.value).toBe("abcdef1234");
  });

  it("invalid digests are reported as ignored", () => {
    expect(parseQuery("sha256:xyz")).toMatchObject({ mode: "browse", checksum: null, ignored: ["sha256:xyz"] });
    expect(parseQuery("sha1:abc").ignored).toEqual(["sha1:abc"]);
  });

  it("checksum mode wins over name/version", () => {
    const q = parseQuery(`lodash@1 md5:${MD5}`);
    expect(q.mode).toBe("checksum");
    expect(q.version).toBeNull();
  });
});

describe("parseQuery: qualifiers", () => {
  it("format: / type: accept lists and aliases, deduplicated", () => {
    expect(parseQuery("format:npm,docker type:go format:NPM gem").formats).toEqual(["npm", "container", "golang"]);
    expect(parseQuery("type:terraform").formats).toEqual(["terraform_module"]);
    expect(parseQuery("type:gem").formats).toEqual(["rubygems"]);
  });

  it("unknown formats are ignored, known ones kept", () => {
    const q = parseQuery("format:npm,cargo lodash");
    expect(q.formats).toEqual(["npm"]);
    expect(q.ignored).toEqual(["format:npm,cargo"]);
    expect(q.name).toBe("lodash");
  });

  it("group: / project: / namespace: are trimmed of slashes and lowercased", () => {
    expect(parseQuery("group:/Acme/Platform/ project:acme/app namespace:x").groups).toEqual([
      "acme/platform",
      "acme/app",
      "x",
    ]);
    expect(parseQuery("group:").groups).toEqual([]);
  });

  it("recognised-but-unsupported qualifiers are listed as ignored", () => {
    const q = parseQuery("cve:CVE-2024-1234 license:mit Severity:high lodash");
    expect(q.ignored).toEqual(["cve:CVE-2024-1234", "license:mit", "Severity:high"]);
    expect(q).toMatchObject({ mode: "name", name: "lodash" });
  });

  it("unknown key:value tokens are treated as part of the name", () => {
    expect(parseQuery("foo:bar")).toMatchObject({ mode: "name", name: "foo:bar", ignored: [] });
    expect(parseQuery("com.acme:app")).toMatchObject({ mode: "name", name: "com.acme:app" });
  });

  it("qualifier keys are case-insensitive", () => {
    expect(parseQuery("FORMAT:npm").formats).toEqual(["npm"]);
  });
});

describe("compareVersions", () => {
  it("orders a pre-release before its release", () => {
    expect(compareVersions("1.0.0-rc1", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0-rc1")).toBe(1);
    expect(compareVersions("1.0.0+build.5", "1.0.0")).toBe(0);
  });

  it("compares numeric segments numerically", () => {
    expect(compareVersions("1.10.0", "1.9.2")).toBe(1);
    expect(compareVersions("1.9.2", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });

  it("ignores a leading v", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("V2", "v10")).toBe(-1);
  });

  it("a longer version with the same prefix sorts after", () => {
    expect(compareVersions("1.0", "1.0.1")).toBe(-1);
    expect(compareVersions("1.0.1", "1.0")).toBe(1);
  });

  it("compares non-numeric segments lexically", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    expect(compareVersions("1.0.0-rc2", "1.0.0-rc1")).toBe(1);
  });
});

describe("matchesVersion", () => {
  it("prefix matches with or without a leading v", () => {
    expect(matchesVersion("1.2.3", { op: "prefix", value: "1.2" })).toBe(true);
    expect(matchesVersion("v1.2.3", { op: "prefix", value: "1.2" })).toBe(true);
    expect(matchesVersion("1.2.3", { op: "prefix", value: "v1.2" })).toBe(true);
    expect(matchesVersion("2.0.0", { op: "prefix", value: "1" })).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(matchesVersion("1.0.0-RC1", { op: "prefix", value: "1.0.0-rc" })).toBe(true);
    expect(matchesVersion("1.0.0-RC1", { op: "=", value: "1.0.0-rc1" })).toBe(true);
  });

  it.each([
    ["=", "1.2.0", "1.2.0", true],
    ["=", "1.2.1", "1.2.0", false],
    [">=", "1.2.0", "1.2.0", true],
    [">=", "1.10.0", "1.9.0", true],
    [">", "1.2.0", "1.2.0", false],
    [">", "1.2.1", "1.2.0", true],
    ["<=", "1.2.0", "1.2.0", true],
    ["<", "1.9.0", "1.10.0", true],
    ["<", "1.10.0", "1.9.0", false],
  ] as const)("%s: %s vs %s -> %s", (op, version, value, expected) => {
    expect(matchesVersion(version, { op, value })).toBe(expected);
  });
});

describe("describeVersionFilter", () => {
  it("describes prefix and operator filters", () => {
    expect(describeVersionFilter({ op: "prefix", value: "1.2" })).toBe("starting with “1.2”");
    expect(describeVersionFilter({ op: ">=", value: "2" })).toBe(">= 2");
  });
});

describe("highlight", () => {
  it("returns the whole text unmarked for an empty needle", () => {
    expect(highlight("lodash", "  ")).toEqual([{ text: "lodash", match: false }]);
  });

  it("marks every case-insensitive occurrence, preserving original casing", () => {
    expect(highlight("Lodash-lodash.es", "LOD")).toEqual([
      { text: "Lod", match: true },
      { text: "ash-", match: false },
      { text: "lod", match: true },
      { text: "ash.es", match: false },
    ]);
  });

  it("handles a match at the end and no match at all", () => {
    expect(highlight("my-ui", "ui")).toEqual([
      { text: "my-", match: false },
      { text: "ui", match: true },
    ]);
    expect(highlight("abc", "z")).toEqual([{ text: "abc", match: false }]);
  });

  it("segments always reassemble to the original text", () => {
    const text = "aaAAaa";
    expect(
      highlight(text, "aa")
        .map((s) => s.text)
        .join(""),
    ).toBe(text);
  });
});

describe("searchHref / toggle", () => {
  const base: SearchState = { q: "", type: [], project: [], sort: "relevance", page: 1 };

  it("omits defaults", () => {
    expect(searchHref(base)).toBe("/search");
  });

  it("serialises all non-default fields, repeating list params", () => {
    expect(searchHref({ q: "lodash@4", type: ["npm", "maven"], project: ["acme/app"], sort: "newest", page: 3 })).toBe(
      "/search?q=lodash%404&type=npm&type=maven&project=acme%2Fapp&sort=newest&page=3",
    );
  });

  it("applies a patch over the state", () => {
    expect(searchHref({ ...base, q: "x", page: 4 }, { page: 1, sort: "name" })).toBe("/search?q=x&sort=name");
  });

  it("toggle adds a missing value and removes a present one without mutating", () => {
    const list = ["npm"];
    expect(toggle(list, "maven")).toEqual(["npm", "maven"]);
    expect(toggle(list, "npm")).toEqual([]);
    expect(list).toEqual(["npm"]);
  });
});
