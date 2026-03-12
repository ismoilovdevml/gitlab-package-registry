import "server-only";

import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cache } from "react";

export interface AppSettings {
  gitlabUrl: string;
  clientId: string;
  clientSecret: string;
  setupComplete: boolean;
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const result = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    return result[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function setSetting(key: string, value: string, encrypted = false) {
  await db
    .insert(settings)
    .values({ key, value, encrypted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, encrypted, updatedAt: new Date() },
    });
}

export const getSettings = cache(async (): Promise<AppSettings | null> => {
  const setupComplete = await getSetting("setup_complete");
  if (setupComplete !== "true") return null;

  const [gitlabUrl, clientId, clientSecret] = await Promise.all([
    getSetting("gitlab_url"),
    getSetting("oauth_client_id"),
    getSetting("oauth_client_secret"),
  ]);

  if (!gitlabUrl || !clientId || !clientSecret) return null;

  return {
    gitlabUrl,
    clientId,
    clientSecret,
    setupComplete: true,
  };
});

export const isSetupComplete = cache(async (): Promise<boolean> => {
  const result = await getSetting("setup_complete");
  return result === "true";
});

export async function saveSetupSettings(data: {
  gitlabUrl: string;
  clientId: string;
  clientSecret: string;
}) {
  await Promise.all([
    setSetting("gitlab_url", data.gitlabUrl),
    setSetting("oauth_client_id", data.clientId),
    setSetting("oauth_client_secret", data.clientSecret, true),
    setSetting("setup_complete", "true"),
  ]);
}
