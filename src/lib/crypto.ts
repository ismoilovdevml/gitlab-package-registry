import "server-only";

import crypto from "crypto";

// AES-256-GCM with a key derived from SESSION_SECRET. Output: v1.<iv>.<tag>.<ciphertext> (base64url).
const PREFIX = "v1";

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long");
  }
  return Buffer.from(crypto.hkdfSync("sha256", secret, "ombor", "ombor-encryption-key", 32));
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [prefix, iv, tag, data] = payload.split(".");
  // `data` may be "" (empty plaintext), so only reject it when the segment is missing.
  if (prefix !== PREFIX || !iv || !tag || data === undefined) {
    throw new Error("Invalid encrypted payload");
  }
  // Pin the tag length: without it older Node versions accept truncated (forgeable) GCM tags.
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"), {
    authTagLength: 16,
  });
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
