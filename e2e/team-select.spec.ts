import { test, expect } from "@playwright/test";

// Every spec names its dataset explicitly: the SPA default can be redirected by
// VITE_DATA_DIR in a developer's .env (e.g. to real pulled data with one team),
// and e2e must stay hermetic over the committed sample fixtures.
test.describe("team select", () => {
  test("shows a card per team when several are configured", async ({ page }) => {
    await page.goto("/?data=/data/sample");
    await expect(page.getByTestId("team-select")).toBeVisible();
    await expect(page.getByTestId("team-card")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Choose team" })).toBeVisible();
  });

  test("selecting a team opens its dashboard and updates the URL", async ({ page }) => {
    await page.goto("/?data=/data/sample");
    await page.getByRole("button", { name: /Aurora/ }).click();
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page).toHaveURL(/team=aurora/);
    await expect(page.getByRole("heading", { name: /Aurora/ })).toBeVisible();
  });

  test("auto-skips the select screen when only one team is configured", async ({ page }) => {
    await page.goto("/?data=/data/sample-solo");
    // No team-select screen; straight to the dashboard.
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page.getByTestId("team-select")).toHaveCount(0);
    await expect(page).toHaveURL(/team=nimbus/);
  });
});
