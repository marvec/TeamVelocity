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

  test("clicking a focused week again deselects it (range overview)", async ({ page }) => {
    const bar = page.locator("[data-testid=team-weekly-bars] .recharts-bar-rectangle").first();
    await bar.click();
    await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/);
    // Clicking the same (now focused) week toggles it off.
    await bar.click();
    await expect(page).toHaveURL(/week=none/);
    await expect(page.getByTestId("range-overview")).toBeVisible();
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

test.describe("week layout", () => {
  test("Week detail and PR relevance span the full width, stacked", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?data=/data/sample-solo");
    const weekly = page.getByTestId("weekly-activity");
    const weekDetail = page.getByTestId("week-detail");
    const relevance = page.getByTestId("pr-relevance");
    await expect(weekDetail).toBeVisible();
    await expect(relevance).toBeVisible();

    const w = await weekly.boundingBox();
    const d = await weekDetail.boundingBox();
    const r = await relevance.boundingBox();
    if (!w || !d || !r) throw new Error("missing bounding box");
    expect(d.width).toBeCloseTo(w.width, 0);
    expect(r.width).toBeCloseTo(w.width, 0);
    expect(r.y).toBeGreaterThanOrEqual(d.y + d.height);
  });

  test("the Week detail PR table fits without horizontal scrolling at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?data=/data/sample-solo");
    const scroller = page.getByTestId("week-detail").getByTestId("pr-table-scroll");
    await expect(scroller).toBeVisible();
    const { scrollWidth, clientWidth } = await scroller.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("Velocity of individuals and Person detail sit side by side at xl", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?data=/data/sample-solo");
    await page.locator('[data-testid=members-section] [data-testid^="stack-label-"]').first().click();
    await expect(page).toHaveURL(/member=/);
    const members = page.getByTestId("members-section");
    const person = page.getByTestId("person-detail");
    await expect(person).toBeVisible();

    const m = await members.boundingBox();
    const p = await person.boundingBox();
    if (!m || !p) throw new Error("missing bounding box");
    expect(p.y).toBeCloseTo(m.y, 0);
    expect(p.x).toBeGreaterThan(m.x + m.width - 1);
  });
});
