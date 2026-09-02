import type { Page } from "@playwright/test";

/** Open the date-range Base UI Select and pick an option by its label. */
export async function selectRange(page: Page, label: string): Promise<void> {
  await page.getByTestId("date-range").locator("button").first().click();
  await page.getByRole("option", { name: label }).click();
}
