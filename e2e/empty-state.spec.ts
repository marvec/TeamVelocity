import { test, expect } from "@playwright/test";

test.describe("empty state", () => {
  test("shows a 'no data yet' screen when no dataset is present", async ({ page }) => {
    await page.goto("/?data=/data/does-not-exist");
    await expect(page.getByTestId("no-data")).toBeVisible();
    await expect(page.getByText("No data yet")).toBeVisible();
    await expect(page.getByText(/bun run pull/)).toBeVisible();
  });
});
