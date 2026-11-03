import fs from "node:fs";
import path from "node:path";
import { chromium, expect, request } from "@playwright/test";
import postgres from "postgres";
import { APP_URL, AUTH_FILE, DATABASE_URL, MOCK_URL } from "./env";

async function waitForHealthy(url: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = `${res.status} ${await res.text()}`;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not become healthy: ${last}`);
}

/**
 * Fresh state for every run: reset the mock GitLab, wipe Ombor's tables, run first-time setup,
 * then sign in once through the real OAuth flow and save the session for the "authenticated" project.
 */
export default async function globalSetup() {
  // The app applies its schema on startup; /api/health also waits for it.
  await waitForHealthy(`${APP_URL}/api/health`);
  await waitForHealthy(`${MOCK_URL}/__health`);

  const reset = await fetch(`${MOCK_URL}/__reset`, { method: "POST" });
  if (!reset.ok) throw new Error(`mock reset failed: ${reset.status}`);

  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`TRUNCATE settings, users, sessions, audit_log, cleanup_policies RESTART IDENTITY CASCADE`;
  } finally {
    await sql.end();
  }

  const api = await request.newContext({ baseURL: APP_URL });
  try {
    const res = await api.post("/api/setup", {
      data: { action: "save", gitlabUrl: MOCK_URL, clientId: "mock-client", clientSecret: "mock-secret" },
    });
    const body = await res.json();
    if (!res.ok() || body.ok !== true) throw new Error(`setup failed: ${res.status()} ${JSON.stringify(body)}`);
  } finally {
    await api.dispose();
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: APP_URL });
    await page.goto("/login");
    await page.getByRole("link", { name: "Sign in with GitLab" }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    await page.context().storageState({ path: AUTH_FILE });
  } finally {
    await browser.close();
  }
}
