import { expect, test, type Page } from "@playwright/test";
import { findPackage, livePackages } from "./helpers";

function list(page: Page) {
  return page.getByRole("region", { name: "Package list" });
}
function rows(page: Page) {
  return list(page).locator("table tbody tr");
}

test.describe("packages list", () => {
  test("format chips filter by package type", async ({ page }) => {
    await page.goto("/packages");
    const live = await livePackages();
    await expect(page.getByRole("main")).toContainText(`${live.length} packages across all projects you can read`);
    await expect(page.getByRole("button", { name: "All formats", pressed: true })).toBeVisible();

    await page.getByRole("group", { name: "Filter by format" }).getByRole("button", { name: "Maven" }).click();
    await expect(page).toHaveURL(/\/packages\?type=maven$/);
    await expect(page.getByRole("button", { name: "Maven", pressed: true })).toBeVisible();
    const maven = live.filter((p) => p.package_type === "maven");
    await expect(rows(page)).toHaveCount(maven.length);
    for (const p of maven) await expect(list(page)).toContainText(p.version);
    await expect(rows(page).filter({ hasNotText: "com/acme/billing-core" })).toHaveCount(0);
    await expect(page.getByRole("main")).toContainText(`${maven.length} packages · Maven across`);
  });

  test("name search narrows the list and reports empty results", async ({ page }) => {
    await page.goto("/packages");
    const search = page.getByRole("searchbox", { name: "Filter by name" });
    await search.fill("ui-kit");
    await expect(page).toHaveURL(/\/packages\?q=ui-kit$/);
    await expect(rows(page)).toHaveCount(4);
    await expect(rows(page).filter({ hasNotText: "@acme/ui-kit" })).toHaveCount(0);
    for (const v of ["4.10.0", "4.11.0", "4.11.1", "4.12.0"]) await expect(list(page)).toContainText(v);

    await search.fill("does-not-exist");
    await search.press("Enter");
    await expect(page).toHaveURL(/q=does-not-exist/);
    await expect(list(page)).toContainText("No packages match these filters");
    await expect(list(page)).toContainText("Nothing named like “does-not-exist”");
    await list(page).getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/packages$/);
    await expect(rows(page)).toHaveCount(25);
  });

  test("pagination and scope selection", async ({ page }) => {
    const live = await livePackages();
    expect(live.length).toBeGreaterThan(25);

    await page.goto("/packages");
    await expect(rows(page)).toHaveCount(25);
    await expect(list(page)).toContainText(`Showing 1–25 of ${live.length}`);
    const pager = page.getByRole("navigation", { name: "Pagination" });
    await expect(pager).toContainText("Page 1 of 2");

    await pager.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/\/packages\?page=2$/);
    await expect(pager).toContainText("Page 2 of 2");
    await expect(rows(page)).toHaveCount(live.length - 25);
    await expect(list(page)).toContainText(`Showing 26–${live.length} of ${live.length}`);
    // Oldest fixtures sort last (newest first).
    await expect(rows(page).last()).toContainText("fixture-24");

    // Scope: the backend group only.
    await page.getByRole("complementary", { name: "Filters" }).getByRole("radio", { name: /^backend\s*group$/ }).click();
    await expect(page).toHaveURL(/\/packages\?group=11$/);
    const backend = live.filter((p) => p.project_path.startsWith("backend/"));
    await expect(rows(page)).toHaveCount(backend.length);
    await expect(page.getByRole("main")).toContainText(`${backend.length} packages in backend`);
    await expect(rows(page).filter({ hasNotText: "backend/" })).toHaveCount(0);
    await expect(pager).toHaveCount(0);
  });
});

test.describe("package detail", () => {
  test("overview, versions, files and pipelines tabs", async ({ page }) => {
    const pkg = await findPackage("@acme/ui-kit", "4.12.0");
    await page.goto("/packages?q=ui-kit");
    await rows(page).filter({ hasText: "4.12.0" }).getByRole("link", { name: "@acme/ui-kit" }).click();
    await expect(page).toHaveURL(new RegExp(`/packages/101/${pkg.id}$`));

    await expect(page.getByRole("heading", { name: "@acme/ui-kit", level: 1 })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("frontend/design-system");
    const nav = page.getByRole("navigation", { name: "Package sections" });
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");

    // Overview: install snippet for this exact version, with tabs per client.
    const install = page.locator("section", { has: page.getByRole("heading", { name: "Install" }) });
    await expect(install.locator("pre").first()).toHaveText("npm install @acme/ui-kit@4.12.0");
    await install.getByRole("tab", { name: "pnpm" }).click();
    await expect(install.locator("pre").first()).toHaveText("pnpm add @acme/ui-kit@4.12.0");
    const file = pkg.files[0];
    await expect(page.getByRole("main")).toContainText(file.file_sha256!);
    await expect(page.getByRole("main")).toContainText("latest");

    // Versions
    await nav.getByRole("link", { name: /Versions/ }).click();
    await expect(page).toHaveURL(/\?tab=versions$/);
    await expect(nav.getByRole("link", { name: /Versions/ })).toContainText("· 4");
    const versions = page.locator("section", { has: page.getByRole("heading", { name: "All versions" }) }).locator("tbody tr");
    await expect(versions).toHaveCount(4);
    await expect(versions.filter({ hasText: "current" })).toContainText("4.12.0");
    await expect(versions.filter({ hasText: "4.10.0" }).getByRole("link", { name: "4.10.0" })).toBeVisible();

    // Files with sha256
    await nav.getByRole("link", { name: /Files/ }).click();
    await expect(page).toHaveURL(/\?tab=files$/);
    const files = page.locator("section", { has: page.getByRole("heading", { name: "Files" }) });
    await expect(files.locator("tbody tr").first()).toContainText(file.file_name);
    await expect(files).toContainText(`${file.file_sha256!.slice(0, 16)}…`);
    await files.getByRole("button", { name: `Show checksums for ${file.file_name}` }).click();
    await expect(files).toContainText(file.file_sha256!);
    await expect(files).toContainText(file.file_sha1!);
    await expect(files).toContainText(file.file_md5!);

    // Pipelines
    await nav.getByRole("link", { name: /Pipelines/ }).click();
    await expect(page).toHaveURL(/\?tab=pipelines$/);
    const pipelines = page.locator("section", { has: page.getByRole("heading", { name: "Pipelines" }) });
    await expect(pipelines.locator("tbody tr")).toHaveCount(1);
    await expect(pipelines).toContainText(`#${88000 + pkg.id}`);
    await expect(pipelines).toContainText("main");
    await expect(pipelines).toContainText("success");
    await expect(pipelines).toContainText("Doniyor Ismoilov");
  });

  test("a package published outside CI has no pipelines", async ({ page }) => {
    const pkg = await findPackage("scratch-tool", "0.0.1");
    await page.goto(`/packages/301/${pkg.id}?tab=pipelines`);
    await expect(page.getByRole("main")).toContainText("No pipelines");
    await expect(page.getByRole("main")).toContainText("This version was published outside CI");
  });

  test("an unknown package shows the not-found page", async ({ page }) => {
    await page.goto("/packages/101/999999");
    await expect(page.getByRole("main")).toContainText(/not found/i);
  });
});
