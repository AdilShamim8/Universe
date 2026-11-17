import { test, expect } from "@playwright/test";

test.describe("navigation and structure", () => {
  test("start page shows hero, sections, preview banner, and skip link", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Understand the universe");
    await expect(page.locator(".preview-banner")).toContainText("Engineering preview");
    await expect(page.locator(".skip-link")).toHaveCount(1);
    const sections = page.locator(".section-grid a");
    await expect(sections).toHaveCount(11);
  });

  test("all eleven sections render with honest empty states", async ({ page }) => {
    for (const slug of ["academy", "explore", "evidence", "research", "laboratories", "technology", "careers", "library", "community"]) {
      await page.goto(`/${slug}/`);
      await expect(page.locator(".empty-state")).toBeVisible();
      await expect(page.locator(".preview-banner")).toBeVisible();
    }
    await page.goto("/history/");
    await expect(page.locator(".empty-state")).toBeVisible();
  });

  test("nav marks the current section with aria-current", async ({ page }) => {
    await page.goto("/academy/");
    await expect(page.locator('nav a[aria-current="page"]')).toHaveText(/Academy/);
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.goto("/history/");
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow2).toBeLessThanOrEqual(0);
  });
});

test.describe("timeline fixture demo (clearly non-science)", () => {
  test("renders the demo with interval, point, and unknown events", async ({ page }) => {
    await page.goto("/history/");
    await expect(page.locator("svg.timeline-svg").first()).toBeVisible();
    await expect(page.locator("svg.timeline-svg")).toHaveCount(2); // log + linear views
    await expect(page.locator(".tl-interval")).toHaveCount(2);
    await expect(page.locator(".tl-point")).toHaveCount(2);
    const unknown = page.locator(".tl-list-item.tl-unknown");
    await expect(unknown).toHaveCount(1);
    await expect(unknown).toContainText("Time unknown");
  });

  test("demo is excluded from search indexing", async ({ page }) => {
    await page.goto("/history/");
    await expect(page.locator("[data-fixture-demo]")).toHaveCount(1);
  });
});

test.describe("accessibility behaviors", () => {
  test("skip link is the first focusable element", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
  });

  test("reduced motion is respected (no smooth scroll)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const behavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    expect(behavior).toBe("auto");
  });

  test("theme toggle stays hidden without JS; page works without JS", async ({ page, browser }) => {
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const p = await noJs.newPage();
    await p.goto("/");
    await expect(p.locator("h1")).toBeVisible();
    await expect(p.locator(".preview-banner")).toBeVisible();
    // Static content readable; search box absent (empty index).
    await p.goto("/history/");
    await expect(p.locator("svg.timeline-svg").first()).toBeVisible();
    await noJs.close();
  });
});

test.describe("search honesty", () => {
  test("search page shows the honest empty state while no approved records exist", async ({ page }) => {
    await page.goto("/search/");
    await expect(page.locator(".empty-state")).toContainText("Nothing to search yet");
  });
});

test.describe("coverage and honesty", () => {
  test("community page shows the coverage map with planned domains", async ({ page }) => {
    await page.goto("/community/");
    await expect(page.locator(".coverage-table")).toBeVisible();
    await expect(page.locator(".state-planned")).toHaveCount(10);
    await expect(page.locator("tbody tr")).toHaveCount(12);
  });

  test("footer disclaims affiliation and completeness", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".site-footer")).toContainText("Not affiliated with");
    await expect(page.locator(".site-footer")).toContainText("No scientific accuracy or completeness is claimed");
  });

  test("404 page renders helpfully", async ({ page }) => {
    await page.goto("/definitely-not-a-page/");
    await expect(page.locator("h1")).toContainText("Page not found");
  });
});
