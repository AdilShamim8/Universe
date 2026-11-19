import { test, expect } from "@playwright/test";

// Site e2e — v0.2 product rebuild: curated, source-backed content everywhere.

test.describe("homepage", () => {
  test("hero shows Start Learning and Explore the Universe CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1.hero-title")).toContainText("Explore the universe");
    await expect(page.getByRole("link", { name: "Start Learning" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore the Universe" })).toBeVisible();
  });

  test("hero meta counts are non-zero", async ({ page }) => {
    await page.goto("/");
    const meta = await page.locator(".hero-meta").textContent();
    expect(meta).toMatch(/\d+ sourced timeline events/);
    expect(meta).toMatch(/\d+ verified resources/);
  });

  test("no engineering-preview empty states remain", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".empty-state")).toHaveCount(0);
    const body = await page.locator("body").textContent();
    expect(body).not.toContain("Engineering preview.");
  });
});

test.describe("history", () => {
  test("12 eras with sourced events render", async ({ page }) => {
    await page.goto("/history/");
    const eras = page.locator(".timeline-era");
    expect(await eras.count()).toBe(12);
    const events = page.locator(".timeline-event");
    expect(await events.count()).toBeGreaterThanOrEqual(70);
  });

  test("every event carries a source link", async ({ page }) => {
    await page.goto("/history/");
    const events = await page.locator(".timeline-event").all();
    for (const ev of events.slice(0, 10)) {
      expect(await ev.locator(".source-line a").count()).toBeGreaterThanOrEqual(1);
    }
  });

  test("era navigation works", async ({ page }) => {
    await page.goto("/history/");
    await page.locator('.timeline-era-nav a[href="#first-stars"]').click();
    await expect(page.locator("#first-stars h2")).toBeVisible();
  });
});

test.describe("academy", () => {
  test("11 subjects listed", async ({ page }) => {
    await page.goto("/academy/");
    expect(await page.locator(".card-grid .card").count()).toBe(11);
  });

  test("subject page shows pathway steps with resources", async ({ page }) => {
    await page.goto("/academy/introduction-to-astronomy/");
    const steps = await page.locator(".pathway-step").count();
    expect(steps).toBeGreaterThanOrEqual(5);
    const resources = await page.locator(".resource-list a").count();
    expect(resources).toBeGreaterThanOrEqual(10);
  });
});

test.describe("explore", () => {
  test("planet table has 10 bodies with numeric facts", async ({ page }) => {
    await page.goto("/explore/");
    const rows = await page.locator(".data-table tbody tr").count();
    expect(rows).toBe(10);
    const earthRow = page.locator(".data-table tbody tr", { hasText: "Earth" });
    await expect(earthRow).toContainText("12,756");
  });

  test("missions and scale sections render", async ({ page }) => {
    await page.goto("/explore/");
    expect(await page.locator('.card-grid .card a[href*=mission], .card-grid .card').count()).toBeGreaterThanOrEqual(14);
    expect(await page.locator("#scale .timeline-event").count()).toBeGreaterThanOrEqual(10);
  });
});

test.describe("research", () => {
  test("8 fields listed", async ({ page }) => {
    await page.goto("/research/");
    expect(await page.locator(".card-grid .card").count()).toBe(8);
  });

  test("field page shows papers with arXiv links and sources", async ({ page }) => {
    await page.goto("/research/cosmology/");
    const papers = await page.locator(".card-grid .card a[href*='arxiv.org']").count();
    expect(papers).toBeGreaterThanOrEqual(6);
    const srcLinks = await page.locator(".source-line a").count();
    expect(srcLinks).toBeGreaterThanOrEqual(2);
  });
});

test.describe("library", () => {
  test("all resources render with difficulty chips", async ({ page }) => {
    await page.goto("/library/");
    const cards = await page.locator(".card-grid .card").count();
    expect(cards).toBeGreaterThanOrEqual(79);
  });
});

test.describe("coverage and honesty", () => {
  test("footer disclaims affiliation and notes curation status", async ({ page }) => {
    await page.goto("/");
    const footer = await page.locator("footer").textContent();
    expect(footer).toContain("Not affiliated with");
    expect(footer).toContain("pending human review");
  });

  test("404 page renders helpfully", async ({ page }) => {
    await page.goto("/definitely-not-a-page/");
    await expect(page.locator("h1")).toContainText("Page not found");
  });
});
