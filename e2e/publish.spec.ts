import { expect, test } from "@playwright/test";
import { livePackages } from "./helpers";

test("upload a generic file to a Developer project and open the new package", async ({ page }) => {
  await page.goto("/publish");
  await expect(page.getByRole("heading", { name: "Publish a package", level: 1 })).toBeVisible();

  // Only Developer+ projects are offered: public-sdk (Reporter) is not.
  await page.getByRole("button", { name: "Target project" }).click();
  const options = page.getByRole("option");
  await expect(options.filter({ hasText: "frontend/web-app" })).toBeVisible();
  await expect(options.filter({ hasText: "backend/public-sdk" })).toHaveCount(0);
  await options.filter({ hasText: "frontend/web-app" }).click();
  await expect(page.getByRole("button", { name: "Target project" })).toContainText("frontend/web-app");

  await expect(page.getByRole("radio", { name: /Generic/ })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Package name").fill("e2e-cli");
  await page.getByLabel("Version").fill("1.2.3");
  await page.getByLabel("Choose files").setInputFiles({
    name: "e2e-cli-linux-amd64.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello from the ombor e2e suite\n"),
  });
  await expect(page.getByRole("list", { name: "Files to publish" })).toContainText("e2e-cli-linux-amd64.txt");

  await page.getByRole("button", { name: "Publish 1 file" }).click();

  const result = page.getByRole("status").filter({ hasText: "Published 1 file to frontend/web-app" });
  await expect(result).toBeVisible();
  const created = (await livePackages()).find((p) => p.name === "e2e-cli" && p.version === "1.2.3");
  expect(created, "mock GitLab received the upload").toBeDefined();
  expect(created!.project_id).toBe(102);

  const link = result.getByRole("link", { name: /View e2e-cli@1\.2\.3/ });
  await expect(link).toHaveAttribute("href", `/packages/102/${created!.id}`);
  await link.click();

  await expect(page).toHaveURL(new RegExp(`/packages/102/${created!.id}$`));
  await expect(page.getByRole("heading", { name: "e2e-cli", level: 1 })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("frontend/web-app");
  await page.getByRole("navigation", { name: "Package sections" }).getByRole("link", { name: /Files/ }).click();
  await expect(page.locator("main tbody tr").first()).toContainText("e2e-cli-linux-amd64.txt");

  await page.goto("/audit?action=package.publish");
  const row = page.locator("main table tbody tr").filter({ hasText: "e2e-cli" });
  await expect(row).toContainText("Published package");
  await expect(row).toContainText("Success");
});
