import { expect, test } from "@playwright/test";
import { livePackages } from "./helpers";

test("create a dry-run policy, preview it and record a run", async ({ page }) => {
  const before = (await livePackages()).filter((p) => p.name === "@acme/ui-kit").length;

  await page.goto("/cleanup");
  await expect(page.getByRole("heading", { name: "Cleanup policies", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New policy" }).first().click();

  const dialog = page.getByRole("dialog", { name: "New cleanup policy" });
  await dialog.getByLabel("Name", { exact: true }).fill("ui-kit keep 2");
  // Only projects where the user is Maintainer+ are offered.
  const projects = dialog.getByRole("listbox", { name: "Projects" });
  await expect(projects.getByRole("option", { name: "frontend/design-system" })).toBeVisible();
  await expect(projects.getByRole("option", { name: "frontend/web-app" })).toHaveCount(0);
  await projects.getByRole("option", { name: "frontend/design-system" }).click();
  await expect(dialog).toContainText("Selected: frontend/design-system");

  await dialog.getByLabel("Format").selectOption("npm");
  await dialog.getByLabel("Package name matches (regex)").fill("^@acme/ui-kit$");
  await dialog.getByLabel("Number of newest versions to keep per package").fill("2");
  await dialog.getByLabel("Minimum age in days").fill("");
  await expect(dialog.getByRole("switch", { name: "Dry run" })).toBeChecked();
  await dialog.getByRole("button", { name: "Create policy" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/cleanup\?policy=\d+$/);

  const main = page.getByRole("main");
  await expect(main).toContainText("ui-kit keep 2");
  await expect(main).toContainText("Never run");

  // Preview: the two oldest ui-kit versions would go, the two newest are kept.
  await main.getByRole("button", { name: "Preview" }).click();
  const preview = page.getByRole("dialog", { name: "Preview · ui-kit keep 2" });
  await expect(preview).toBeVisible();
  const rows = preview.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(preview).toContainText("4.10.0");
  await expect(preview).toContainText("4.11.0");
  await expect(rows.filter({ hasText: "4.12.0" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "4.11.1" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();

  // Run now in dry-run mode records the result and deletes nothing.
  await main.getByRole("button", { name: "Run now" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Record a dry run?");
  await confirm.getByRole("button", { name: "Record dry run" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText("Dry run recorded: 2 versions would be deleted.")).toBeVisible();
  await expect(main).toContainText("Dry run: 2 versions");
  await expect(main).toContainText("Nothing was deleted.");
  await expect(main).toContainText("@acme/ui-kit@4.10.0");

  expect((await livePackages()).filter((p) => p.name === "@acme/ui-kit").length).toBe(before);

  await page.goto("/audit?action=cleanup.run");
  await expect(page.locator("main table tbody tr").filter({ hasText: "ui-kit keep 2" })).toContainText("Ran cleanup policy");
});
