import { expect, test } from "@playwright/test";
import { MOCK_URL } from "./env";

test.describe("admin", () => {
  test("users page lists the signed-in user as admin", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const row = page.locator("main table tbody tr").filter({ hasText: "@doniyor" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Doniyor Ismoilov");
    await expect(row).toContainText("(you)");
    await expect(row).toContainText("doniyor@example.com");
    await expect(row).toContainText("Admin");
    await expect(row).toContainText("Active");
  });

  test("settings page shows the GitLab connection", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByLabel("Instance URL")).toHaveValue(MOCK_URL);
    await expect(page.getByLabel("OAuth Application ID")).toHaveValue("mock-client");
    await expect(page.getByRole("main")).toContainText("Connected · GitLab 17.5.2");
    // The secret is never sent back to the browser.
    await expect(page.getByLabel("OAuth Client Secret")).not.toHaveValue("mock-secret");
  });

  test("audit log CSV export", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "Audit log", level: 1 })).toBeVisible();
    await expect(page.locator("main table tbody tr").filter({ hasText: "auth.login" }).first()).toContainText("Signed in");

    const href = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
    expect(href).toBe("/api/audit/export");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="ombor-audit-.+\.csv"$/);
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines[0]).toMatch(/^time_utc,actor,actor_name,/);
    expect(lines.slice(1).some((l) => l.includes("auth.login") && l.includes("doniyor"))).toBe(true);

    // The download link works through the browser too.
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^ombor-audit-.+\.csv$/);
  });
});
