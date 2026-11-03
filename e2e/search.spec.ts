import { expect, test } from "@playwright/test";
import { findPackage } from "./helpers";

test.describe("search", () => {
  test("name query from the top bar", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("searchbox", { name: "Search packages" }).fill("billing");
    await page.getByRole("searchbox", { name: "Search packages" }).press("Enter");
    await expect(page).toHaveURL(/\/search\?q=billing$/);

    const main = page.getByRole("main");
    await expect(main).toContainText("Name search");
    await expect(main).toContainText("package names and container image paths containing billing");
    const results = page.getByRole("region", { name: "Results" });
    const pkg = results.locator("article").filter({ hasText: "com/acme/billing-core" });
    await expect(pkg).toContainText("2 matching versions");
    await expect(pkg).toContainText("Maven");
    // Container images whose path matches are listed too.
    await expect(results.locator("article").filter({ hasText: "backend/billing/api-gateway" })).toBeVisible();
  });

  test("name@version narrows to matching versions", async ({ page }) => {
    const pkg = await findPackage("@acme/ui-kit", "4.11.1");
    await page.goto("/search");
    const box = page.getByRole("searchbox", { name: "Search the registry" });
    await box.fill("@acme/ui-kit@4.11");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=%40acme%2Fui-kit%404\.11/);

    await expect(page.getByRole("main")).toContainText("Version search");
    await expect(page.getByRole("main")).toContainText("packages named like @acme/ui-kit");
    const results = page.getByRole("region", { name: "Results" }).locator("article");
    await expect(results).toHaveCount(1);
    await expect(results).toContainText("2 matching versions");
    await expect(results).toContainText("4.11.0");
    await expect(results).toContainText("4.11.1");
    await expect(results).not.toContainText("4.12.0");
    await expect(results).not.toContainText("4.10.0");
    await results.getByRole("link", { name: "4.11.1" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/packages/101/${pkg.id}$`));
  });

  test("a sha256 switches to checksum mode and finds the file", async ({ page }) => {
    const pkg = await findPackage("acme-ml-features", "0.19.3");
    const file = pkg.files[0];
    await page.goto(`/search?q=${file.file_sha256}`);

    const main = page.getByRole("main");
    await expect(main).toContainText("Checksum search (SHA256)");
    await expect(main).toContainText("matches package files by hash");
    const results = page.getByRole("region", { name: "Results" }).locator("article");
    await expect(results).toHaveCount(1);
    await expect(results).toContainText("acme-ml-features");
    await expect(results).toContainText(file.file_name);
    await expect(results).toContainText(`sha256: ${file.file_sha256}`);

    // A well-formed hash that matches nothing explains why.
    await page.goto(`/search?q=${"0".repeat(64)}`);
    await expect(main).toContainText("Checksum search (SHA256)");
    await expect(main).toContainText("most recent packages has this checksum");
  });
});
