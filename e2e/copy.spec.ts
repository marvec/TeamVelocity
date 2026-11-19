import { test, expect, type Page } from "@playwright/test";

/** Read the clipboard's text/html payload from inside the page. */
async function clipboardHtml(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes("text/html")) return (await item.getType("text/html")).text();
    }
    return "";
  });
}

// Clipboard read/write permissions are Chromium-only in Playwright.
test.describe("copy as rich text", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "clipboard permissions are Chromium-only");

  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/?data=/data/sample-solo");
    await expect(page.getByTestId("dashboard")).toBeVisible();
  });

  test("Week detail copies a PR table with links", async ({ page }) => {
    const button = page.getByTestId("copy-week");
    await button.click();
    await expect(button).toHaveText("Copied");
    const html = await clipboardHtml(page);
    expect(html).toContain("<table");
    expect(html).toMatch(/href="https:\/\/github\.com\/[^"]+\/pull\/\d+"/);
  });

  test("Velocity of individuals and Person detail copy HTML for the selected member", async ({ page }) => {
    await page.locator('[data-testid=members-section] [data-testid^="stack-label-"]').first().click();
    await expect(page).toHaveURL(/member=/);
    const person = page.getByTestId("person-detail");
    await expect(person).toBeVisible();
    const name = (await person.locator("h2").first().textContent()) ?? "";
    expect(name).not.toBe("");

    // The members table (copyMembers) is name/velocity/counts only — no links by design.
    const members = page.getByTestId("copy-members");
    await members.click();
    await expect(members).toHaveText("Copied");
    const membersHtml = await clipboardHtml(page);
    expect(membersHtml).toContain("<table");
    expect(membersHtml).toContain(name);

    const personButton = page.getByTestId("copy-person");
    await personButton.click();
    await expect(personButton).toHaveText("Copied");
    const personHtml = await clipboardHtml(page);
    expect(personHtml).toContain(name);
    expect(personHtml).toContain("<a href=");
  });

  test("PR relevance has no Copy button", async ({ page }) => {
    const relevance = page.getByTestId("pr-relevance");
    await expect(relevance).toBeVisible();
    await expect(relevance.locator('[data-testid^="copy-"]')).toHaveCount(0);
    await expect(relevance.getByRole("button", { name: /copy/i })).toHaveCount(0);
  });
});
