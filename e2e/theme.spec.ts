import { test, expect } from "@playwright/test";

test.describe("theme switcher", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?data=/data/sample-solo");
    await expect(page.getByTestId("dashboard")).toBeVisible();
  });

  test("defaults to Daylight", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("data-theme", "daylight");
    await expect(page.getByTestId("theme-switcher")).toHaveText(/Daylight/);
  });

  test("offers all five themes", async ({ page }) => {
    await page.getByTestId("theme-switcher").click();
    const options = page.getByRole("option");
    await expect(options).toHaveCount(5);
    await expect(options.filter({ hasText: "Solarized" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("switching persists in localStorage and survives a reload", async ({ page }) => {
    await page.getByTestId("theme-switcher").click();
    await page.getByRole("option", { name: /Nightlight/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "nightlight");
    await expect(page.getByTestId("theme-switcher")).toHaveText(/Nightlight/);

    const stored = await page.evaluate(() => window.localStorage.getItem("teamvelocity.theme"));
    expect(stored).toBe("nightlight");

    await page.reload();
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "nightlight");
  });
});
