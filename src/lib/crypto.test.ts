import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, randomToken, sha256 } from "./crypto";

const SECRET = "a".repeat(32);
let previous: string | undefined;

beforeEach(() => {
  previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  if (previous === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previous;
});

/** Replaces one dot-separated part of a payload. */
function withPart(payload: string, index: number, value: string): string {
  const parts = payload.split(".");
  parts[index] = value;
  return parts.join(".");
}

function flipFirstByte(b64url: string): string {
  const buf = Buffer.from(b64url, "base64url");
  buf[0] ^= 0xff;
  return buf.toString("base64url");
}

describe("encrypt / decrypt", () => {
  it.each(["glpat-xxxxxxxxxxxxxxxxxxxx", "unicode ✓ ombor — тест", "x".repeat(10_000), ""])(
    "roundtrips %#",
    (plaintext) => {
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    },
  );

  it("produces v1.<iv>.<tag>.<data> with a fresh IV each time", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]*$/);
    expect(a).not.toBe(b);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });

  it("does not contain the plaintext", () => {
    expect(encrypt("super-secret-token")).not.toContain("super-secret-token");
  });

  it("rejects tampered ciphertext, tag or IV", () => {
    const payload = encrypt("hello world");
    expect(() => decrypt(withPart(payload, 3, flipFirstByte(payload.split(".")[3])))).toThrow();
    expect(() => decrypt(withPart(payload, 2, flipFirstByte(payload.split(".")[2])))).toThrow();
    expect(() => decrypt(withPart(payload, 1, flipFirstByte(payload.split(".")[1])))).toThrow();
  });

  it("rejects a truncated auth tag", () => {
    const payload = encrypt("hello world");
    const shortTag = Buffer.from(payload.split(".")[2], "base64url").subarray(0, 4).toString("base64url");
    expect(() => decrypt(withPart(payload, 2, shortTag))).toThrow();
  });

  it("rejects a wrong prefix or missing parts", () => {
    const payload = encrypt("hello");
    expect(() => decrypt(withPart(payload, 0, "v2"))).toThrow("Invalid encrypted payload");
    expect(() => decrypt("v1.onlyiv")).toThrow("Invalid encrypted payload");
    expect(() => decrypt("not-a-payload")).toThrow("Invalid encrypted payload");
  });

  it("fails to decrypt with a different secret", () => {
    const payload = encrypt("hello");
    process.env.SESSION_SECRET = "b".repeat(32);
    expect(() => decrypt(payload)).toThrow();
  });

  it("refuses a missing or short SESSION_SECRET", () => {
    process.env.SESSION_SECRET = "too-short";
    expect(() => encrypt("x")).toThrow(/SESSION_SECRET/);
    delete process.env.SESSION_SECRET;
    expect(() => encrypt("x")).toThrow(/SESSION_SECRET/);
  });
});

describe("randomToken / sha256", () => {
  it("randomToken is base64url of the requested size and unique", () => {
    const t = randomToken();
    expect(t).toMatch(/^[\w-]+$/);
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
    expect(Buffer.from(randomToken(16), "base64url")).toHaveLength(16);
    expect(randomToken()).not.toBe(t);
  });

  it("sha256 returns the hex digest", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
