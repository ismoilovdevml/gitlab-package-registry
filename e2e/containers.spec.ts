import { expect, test } from "@playwright/test";
import { mockState } from "./helpers";

test("delete a container tag from Repositories → project → image", async ({ page }) => {
  await page.goto("/repositories");
  await expect(page.getByRole("heading", { name: "Repositories", level: 1 })).toBeVisible();
  await page.locator('main a[href="/repositories/201"]').first().click();
  await expect(page).toHaveURL(/\/repositories\/201$/);
  await expect(page.getByRole("main")).toContainText("backend/billing");

  const images = page.locator("main table").filter({ hasText: "registry.mock.local/backend/billing/api-gateway" });
  await images.getByRole("link", { name: "api-gateway" }).click();
  await expect(page).toHaveURL(/\/repositories\/201\/containers\/501$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("api-gateway");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Owner");

  const tagsTable = page.locator("main table").filter({ hasText: "v1.29.0" });
  for (const t of ["v1.29.0", "v1.30.0", "v1.31.0", "latest"]) await expect(tagsTable).toContainText(t);

  await page.getByRole("button", { name: "Delete tag v1.29.0" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Delete tag v1.29.0?");
  await expect(dialog).toContainText("garbage collection");
  await dialog.getByRole("button", { name: "Delete tag" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("status").filter({ hasText: "storage pending GC" })).toContainText(
    "1 tag deleted · storage pending GC",
  );
  await expect(page.getByRole("button", { name: "Delete tag v1.29.0" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete tag v1.30.0" })).toBeVisible();

  const repo = (await mockState()).containerRepos.find((r) => r.id === 501);
  expect(repo?.tags).toEqual(["v1.30.0", "v1.31.0", "latest"]);

  await page.goto("/audit?action=container.tag_delete");
  await expect(page.locator("main table tbody tr").filter({ hasText: "v1.29.0" })).toContainText("Deleted image tag");
});
