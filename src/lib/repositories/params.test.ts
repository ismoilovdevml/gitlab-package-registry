import { describe, expect, it } from "vitest";
import { parsePage, parsePositiveInt, parseRepositoryListParams, repositoriesHref } from "./params";

describe("parsePositiveInt", () => {
  it("accepts positive integers, using the first array value", () => {
    expect(parsePositiveInt("42")).toBe(42);
    expect(parsePositiveInt(["7", "8"])).toBe(7);
    expect(parsePositiveInt("000123")).toBe(123);
  });

  it.each([undefined, "", "0", "-1", "1.5", "1e3", " 5", "abc", "1234567890123"])("rejects %j", (v) => {
    expect(parsePositiveInt(v)).toBeNull();
  });
});

describe("parsePage", () => {
  it("defaults to 1 and clamps to 10000", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(parsePage("999999")).toBe(10_000);
  });
});

describe("parseRepositoryListParams", () => {
  it("returns defaults for empty params", () => {
    expect(parseRepositoryListParams({})).toEqual({ q: "", sort: "activity", group: null, page: 1 });
  });

  it("parses, trims and caps values", () => {
    expect(parseRepositoryListParams({ q: "  api ", sort: "storage", group: "12", page: "2" })).toEqual({
      q: "api",
      sort: "storage",
      group: 12,
      page: 2,
    });
    expect(parseRepositoryListParams({ q: "x".repeat(500) }).q).toHaveLength(200);
  });

  it("falls back for unknown sort and invalid group", () => {
    expect(parseRepositoryListParams({ sort: "evil", group: "-3" })).toMatchObject({ sort: "activity", group: null });
  });
});

describe("repositoriesHref", () => {
  it("omits default values", () => {
    expect(repositoriesHref({})).toBe("/repositories");
    expect(repositoriesHref({ q: "", sort: "activity", page: 1, group: null })).toBe("/repositories");
  });

  it("serialises non-default values", () => {
    expect(repositoriesHref({ q: "my api", group: 4, sort: "name", page: 2 })).toBe(
      "/repositories?q=my+api&group=4&sort=name&page=2",
    );
  });

  it("roundtrips through parseRepositoryListParams", () => {
    const params = { q: "svc", sort: "storage" as const, group: 9, page: 5 };
    const sp = Object.fromEntries(new URLSearchParams(repositoriesHref(params).split("?")[1]));
    expect(parseRepositoryListParams(sp)).toEqual(params);
  });
});
