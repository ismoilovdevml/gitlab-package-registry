import { expect, test, type Page } from "@playwright/test";
import { findPackage, mockState } from "./helpers";

function auditRow(page: Page, action: string, target: string) {
  return page.locator("main table tbody tr").filter({ hasText: action }).filter({ hasText: target });
}

test.describe("deleting packages", () => {
  test("a Maintainer deletes a version via type-to-confirm and it is audited", async ({ page }) => {
    const old = await findPackage("@acme/legacy-widgets", "0.1.0");
    const keep = await findPackage("@acme/legacy-widgets", "0.2.0");
    const ref = "@acme/legacy-widgets@0.1.0";

    await page.goto(`/packages/101/${old.id}`);
    await page.getByRole("button", { name: "Delete version", exact: true }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(`Delete ${ref}?`);
    await expect(dialog).toContainText(`Type ${ref} to confirm.`);
    const confirm = dialog.getByRole("button", { name: "Delete version" });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("textbox").fill("@acme/legacy-widgets@0.1");
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("textbox").fill(ref);
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // Lands on the remaining version; the deleted one is gone everywhere.
    await expect(page).toHaveURL(new RegExp(`/packages/101/${keep.id}$`));
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Deleted ${ref}`)).toBeVisible();
    expect((await findPackage("@acme/legacy-widgets", "0.1.0")).status).toBe("deleted");

    await page.goto(`/packages/101/${keep.id}?tab=versions`);
    const versions = page.locator("section", { has: page.getByRole("heading", { name: "All versions" }) }).locator("tbody tr");
    await expect(versions).toHaveCount(1);
    await expect(versions).toContainText("0.2.0");

    await page.goto(`/packages/101/${old.id}`);
    await expect(page.getByRole("main")).toContainText("Package not found");

    await page.goto("/audit");
    const row = auditRow(page, "package.delete", ref);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Deleted package");
    await expect(row).toContainText("frontend/design-system");
    await expect(row).toContainText("Success");
    await expect(row).toContainText("doniyor");
  });

  test("bulk delete two packages from the list", async ({ page }) => {
    await page.goto("/packages?q=bulk-target");
    const list = page.getByRole("region", { name: "Package list" });
    await expect(list.locator("table tbody tr")).toHaveCount(2);

    await list.getByRole("checkbox", { name: "Select bulk-target-a 1.0.0" }).check();
    await list.getByRole("checkbox", { name: "Select bulk-target-b 1.0.0" }).check();
    await expect(list.getByText("2 selected")).toBeVisible();
    await list.getByRole("button", { name: "Delete" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Delete 2 packages?");
    await expect(dialog).toContainText("bulk-target-a@1.0.0");
    await expect(dialog).toContainText("bulk-target-b@1.0.0");
    await dialog.getByRole("button", { name: "Delete 2 packages" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText("Deleted 2 packages")).toBeVisible();
    await expect(list).toContainText("No packages match these filters");

    const state = await mockState();
    for (const name of ["bulk-target-a", "bulk-target-b"]) {
      expect(state.packages.find((p) => p.name === name)?.status).toBe("deleted");
    }

    await page.goto("/audit?action=package.bulk_delete");
    await expect(auditRow(page, "package.bulk_delete", "2 packages")).toHaveCount(1);
  });
});

test.describe("permission denial for Reporters", () => {
  test("delete controls are hidden on a Reporter project", async ({ page }) => {
    const pkg = await findPackage("Acme.Logging", "6.0.2");
    await page.goto(`/packages/202/${pkg.id}`);
    await expect(page.getByRole("heading", { name: "Acme.Logging", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);

    await page.goto(`/packages/202/${pkg.id}?tab=versions`);
    await expect(page.locator("main tbody tr")).toContainText("6.0.2");
    await expect(page.getByRole("button", { name: /Delete version/ })).toHaveCount(0);

    await page.goto(`/packages/202/${pkg.id}?tab=files`);
    await expect(page.locator("main tbody tr").first()).toContainText(pkg.files[0].file_name);
    await expect(page.getByRole("button", { name: /Delete file/ })).toHaveCount(0);
  });

  test("bulk delete on a Reporter project is rejected with a clear message", async ({ page }) => {
    await page.goto("/packages?q=Acme.Logging");
    const list = page.getByRole("region", { name: "Package list" });
    await expect(list.locator("table tbody tr")).toHaveCount(1);
    await list.getByRole("checkbox", { name: "Select Acme.Logging 6.0.2" }).check();
    await list.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete 1 package" }).click();

    const summary = list.getByRole("status");
    await expect(summary).toContainText("0 packages deleted, 1 failed");
    await expect(summary).toContainText("Acme.Logging@6.0.2");
    await expect(summary).toContainText("You need Maintainer access to delete packages (you have Reporter).");
    await expect(list.locator("table tbody tr")).toHaveCount(1);
    expect((await findPackage("Acme.Logging", "6.0.2")).status).toBe("default");

    await page.goto("/audit?status=failure");
    const row = page.locator("main table tbody tr").filter({ hasText: "Acme.Logging@6.0.2" }).filter({ hasText: "package.delete" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Failure");
  });
});
