import { test, expect } from "@playwright/test";
import { selectRange } from "./helpers";

test.describe("dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?data=/data/sample-solo");
    await expect(page.getByTestId("dashboard")).toBeVisible();
  });

  test("changing the date range updates the charts", async ({ page }) => {
    const bars = page.getByTestId("team-weekly-bars");
    await expect(bars).toBeVisible();

    await selectRange(page, "All time");
    await expect(page).toHaveURL(/range=all/);
    // The earliest week (04/27) is only in range when showing all time.
    await expect(bars.getByText("04/27")).toBeVisible();

    await selectRange(page, "Last month");
    await expect(page).toHaveURL(/range=1m/);
    await expect(bars.getByText("04/27")).toHaveCount(0);
  });

  test("a PR row links out to GitHub", async ({ page }) => {
    const link = page.getByTestId("pr-link").first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^https:\/\/github\.com\/.+\/pull\/\d+$/);
    await expect(link).toHaveAttribute("target", "_blank");
  });

  test("the velocity gauge renders a value and band", async ({ page }) => {
    const gauge = page.getByTestId("velocity-gauge");
    await expect(gauge).toBeVisible();
    await expect(gauge).toHaveAttribute("data-band", /red|yellow|green/);
  });

  test("the help popover explains the two scores", async ({ page }) => {
    await page.getByRole("button", { name: "How the scores work" }).click();
    await expect(page.getByRole("heading", { name: "How the scores work" })).toBeVisible();
    await expect(page.getByText("weekly rhythm")).toBeVisible();
    await expect(page.getByText("which PRs are worth a status-report mention")).toBeVisible();
  });

  test("warming-up weeks are flagged as provisional", async ({ page }) => {
    await selectRange(page, "All time");
    // Leftmost bar = earliest week, which is within the warming-up window.
    await page.locator("[data-testid=team-weekly-bars] .recharts-bar-rectangle").first().click();
    await expect(page.getByText("warming up")).toBeVisible();
  });
});
