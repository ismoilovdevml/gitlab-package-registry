import "server-only";

import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { eq, inArray } from "drizzle-orm";
import { cache } from "react";

export interface AppSettings {
  gitlabUrl: string;
  clientId: string;
  clientSecret: string;
  setupComplete: boolean;
}

export function normalizeGitlabUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("GitLab URL must start with http:// or https://");
  }
  return trimmed;
}

async function readSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await db.select().from(settings).where(inArray(settings.key, keys));
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.key] = row.encrypted ? decrypt(row.value) : row.value;
  }
  return out;
}

export async function getSetting(key: string): Promise<string | null> {
  const values = await readSettings([key]);
  return values[key] ?? null;
}

export async function setSetting(key: string, value: string, encrypted = false) {
  const stored = encrypted ? encrypt(value) : value;
  await db
    .insert(settings)
    .values({ key, value: stored, encrypted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: stored, encrypted, updatedAt: new Date() },
    });
}

export async function deleteSetting(key: string) {
  await db.delete(settings).where(eq(settings.key, key));
}

export const getSettings = cache(async (): Promise<AppSettings | null> => {
  const values = await readSettings([
    "setup_complete",
    "gitlab_url",
    "oauth_client_id",
    "oauth_client_secret",
  ]);
  if (values.setup_complete !== "true") return null;

  const { gitlab_url, oauth_client_id, oauth_client_secret } = values;
  if (!gitlab_url || !oauth_client_id || !oauth_client_secret) return null;

  return {
    gitlabUrl: gitlab_url,
    clientId: oauth_client_id,
    clientSecret: oauth_client_secret,
    setupComplete: true,
  };
});

export const isSetupComplete = cache(async (): Promise<boolean> => {
  return (await getSetting("setup_complete")) === "true";
});

export async function saveSetupSettings(data: {
  gitlabUrl: string;
  clientId: string;
  clientSecret: string;
}) {
  // setup_complete is written last, so a partial failure leaves setup incomplete.
  await setSetting("gitlab_url", normalizeGitlabUrl(data.gitlabUrl));
  await setSetting("oauth_client_id", data.clientId.trim());
  await setSetting("oauth_client_secret", data.clientSecret.trim(), true);
  await setSetting("setup_complete", "true");
}
