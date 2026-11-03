import { expect, test, type ConsoleMessage } from "@playwright/test";

const ROUTES = [
  "/dashboard",
  "/packages",
  "/packages/101/1003",
  "/repositories",
  "/repositories/201",
  "/repositories/201/containers/501",
  "/search",
  "/search?q=acme",
  "/publish",
  "/publish?tab=ci",
  "/client-setup",
  "/security",
  "/cleanup",
  "/audit",
  "/admin",
  "/admin/users",
  "/admin/settings",
];

const ERROR_BOUNDARY = /Something went wrong|Application error|Unhandled Runtime Error|Internal Server Error/i;

for (const route of ROUTES) {
  test(`smoke ${route}`, async ({ page }) => {
    const errors: string[] = [];
    const onConsole = (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(msg.text());
    };
    page.on("console", onConsole);
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    const res = await page.goto(route);
    expect(res?.status(), `${route} HTTP status`).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
    expect(errors, `console errors on ${route}`).toEqual([]);
  });
}
