import { expect, test } from "@playwright/test";
import { livePackages } from "./helpers";

test("overview shows package totals and the most recently published packages", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(page.getByText("All registries across 2 GitLab groups and 5 projects")).toBeVisible();

  const live = await livePackages();
  const packagesCard = page.locator("main div.rounded-xl", { has: page.getByText("Packages", { exact: true }) }).first();
  await expect(packagesCard).toContainText(String(live.length));
  await expect(packagesCard).toContainText("Name + version records in 3 scopes");

  // "Recently published" lists the newest 8 packages in order, each linking to its detail page.
  const recent = page.getByRole("region", { name: "Recently published" });
  const newest = [...live].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const rows = recent.locator("tbody tr");
  await expect(rows).toHaveCount(newest.length);
  for (const [i, p] of newest.entries()) {
    const row = rows.nth(i);
    await expect(row).toContainText(p.name);
    await expect(row).toContainText(p.version);
    await expect(row).toContainText(p.project_path);
    await expect(row.getByRole("link")).toHaveAttribute("href", `/packages/${p.project_id}/${p.id}`);
  }

  const health = page.getByRole("region", { name: "Registry health" });
  await expect(health).toContainText("Reachable");
  await expect(health).toContainText("17.5.2");
  await expect(health).toContainText("@doniyor");
  await expect(health).toContainText("Admin");

  await recent.getByRole("link", { name: "View all packages" }).click();
  await expect(page).toHaveURL(/\/packages$/);
});
