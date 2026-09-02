import { test, expect } from "@playwright/test";

// Full Team → Week → Person → Repo drill-down and deselect, over the solo
// fixture (auto-skips team-select).
test.describe("drill-down", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?data=/data/sample-solo");
    await expect(page.getByTestId("dashboard")).toBeVisible();
  });

  test("the latest week is focused by default", async ({ page }) => {
    await expect(page.getByTestId("week-detail")).toBeVisible();
    await expect(page.getByTestId("members-section")).toBeVisible();
    await expect(page.getByTestId("pr-relevance")).toBeVisible();
  });

  test("Team → Week → Person → Repo, then deselect back up", async ({ page }) => {
    // Person: click a member bar.
    await page.locator("[data-testid=members-section] .recharts-bar-rectangle").first().click();
    await expect(page).toHaveURL(/member=/);
    await expect(page.getByTestId("person-detail")).toBeVisible();

    // Repo: click a repo bar inside the person detail.
    await page.locator("[data-testid=person-detail] .recharts-bar-rectangle").first().click();
    await expect(page).toHaveURL(/repo=/);
    await expect(page.getByTestId("repo-detail")).toBeVisible();

    // Deselect repo.
    await page.getByTestId("clear-repo").click();
    await expect(page).not.toHaveURL(/repo=/);
    await expect(page.getByTestId("repo-detail")).toHaveCount(0);

    // Deselect person → back to team detail.
    await page.getByTestId("clear-person").click();
    await expect(page).not.toHaveURL(/member=/);
    await expect(page.getByText("Team detail")).toBeVisible();

    // Deselect the week → range overview.
    await page.getByTestId("clear-week").click();
    await expect(page).toHaveURL(/week=none/);
    await expect(page.getByTestId("range-overview")).toBeVisible();
    await expect(page.getByTestId("week-detail")).toHaveCount(0);

    // Re-select a week via the weekly bars.
    await page.locator("[data-testid=team-weekly-bars] .recharts-bar-rectangle").first().click();
    await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByTestId("week-detail")).toBeVisible();
  });

  test("selection survives a reload (URL state)", async ({ page }) => {
    await page.locator("[data-testid=members-section] .recharts-bar-rectangle").first().click();
    await expect(page).toHaveURL(/member=/);
    await page.reload();
    await expect(page.getByTestId("person-detail")).toBeVisible();
    await expect(page).toHaveURL(/member=/);
  });
});
