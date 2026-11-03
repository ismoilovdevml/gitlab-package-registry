import { expect, test } from "@playwright/test";
import { MOCK_URL } from "./env";

// Runs in the "public" project: no stored session.

test.describe("setup and authentication", () => {
  test("unauthenticated pages redirect to /login with next, which names the GitLab host", async ({ page }) => {
    await page.goto("/dashboard?range=30d");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%3Frange%3D30d$/);
    await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();
    const host = new URL(MOCK_URL).host;
    await expect(page.getByText(`Connected instance · ${host}`)).toBeVisible();
    await expect(page.getByText(/You.ll be redirected to/)).toContainText(host);
    // Next.js adds its own (empty) route-announcer alert, so look for ours by text.
    await expect(page.getByRole("alert").filter({ hasText: "Sign-in failed" })).toHaveCount(0);

    // API routes answer 401 instead of redirecting.
    const res = await page.request.get("/api/audit/export");
    expect(res.status()).toBe(401);
  });

  test("a forged OAuth state is rejected with an inline error", async ({ page }) => {
    await page.goto("/api/auth/callback?code=stolen-code&state=forged-state");
    await expect(page).toHaveURL(/\/login\?error=/);
    const alert = page.getByRole("alert").filter({ hasText: "Sign-in failed" });
    await expect(alert).toContainText("Sign-in failed");
    await expect(alert).toContainText("Login session expired or CSRF check failed. Please try again.");
    // No session was created.
    await page.goto("/packages");
    await expect(page).toHaveURL(/\/login\?next=%2Fpackages$/);
  });

  test("an OAuth error from GitLab is shown inline", async ({ page }) => {
    await page.goto(
      "/api/auth/callback?error=access_denied&error_description=The%20resource%20owner%20or%20authorization%20server%20denied%20the%20request.",
    );
    await expect(page).toHaveURL(/\/login\?error=/);
    await expect(page.getByRole("alert").filter({ hasText: "Sign-in failed" })).toContainText("The resource owner or authorization server denied the request.");
  });

  test("sign in lands on next, sign out returns to /login and re-protects pages", async ({ page }) => {
    await page.goto("/packages?type=npm");
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByRole("link", { name: "Sign in with GitLab" }).click();

    await expect(page).toHaveURL(/\/packages\?type=npm$/);
    await expect(page.getByRole("heading", { name: "Packages", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "npm", pressed: true })).toBeVisible();

    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menu")).toContainText("@doniyor");
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("link", { name: "Sign in with GitLab" })).toBeVisible();

    for (const path of ["/dashboard", "/admin/users"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/\//g, "%2F")}$`));
    }
  });

  test("first-run setup cannot be repeated", async ({ page, request }) => {
    const body = { action: "save", gitlabUrl: "https://evil.example.com", clientId: "x", clientSecret: "y" };

    // Anonymous callers are refused outright.
    const anon = await request.post("/api/setup", { data: body });
    expect(anon.status()).toBe(403);
    expect(await anon.json()).toMatchObject({ ok: false, error: "Setup is already complete" });

    // Even an admin cannot re-run first-time setup (settings change via /admin/settings).
    await page.goto("/login");
    await page.getByRole("link", { name: "Sign in with GitLab" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const admin = await page.request.post("/api/setup", { data: body });
    expect(admin.status()).toBe(409);
    expect(await admin.json()).toMatchObject({ ok: false, error: "Setup is already complete" });

    // The setup wizard itself is no longer reachable.
    await page.goto("/setup");
    await expect(page).not.toHaveURL(/\/setup$/);

    // The stored GitLab URL is unchanged.
    const info = await request.post("/api/setup", { data: { action: "info" } });
    expect(await info.json()).toMatchObject({ gitlabUrl: MOCK_URL, setupComplete: true });
  });
});
