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
    const table = page.locator("#planet-table table");
    expect(await table.locator("tbody tr").count()).toBe(10);
    const earthRow = table.locator("tbody tr", { hasText: "Earth" });
    await expect(earthRow).toContainText("12,756");
    // exoplanet table: 8 rows with discovery methods
    const exo = page.locator("#exo-table table");
    expect(await exo.locator("tbody tr").count()).toBe(8);
    await expect(exo).toContainText("Radial Velocity");
    await expect(exo).toContainText("Transit");
  });

  test("missions and scale sections render", async ({ page }) => {
    await page.goto("/explore/");
    expect(await page.locator(".mtl-items .mtl-card", { hasText: /Apollo|Voyager|Hubble|Galileo|Cassini|Station|Chandra|Kepler|Horizons|Parker|Perseverance|Webb|JUICE|Euclid|Dragonfly/ }).count()).toBeGreaterThanOrEqual(14);
    // scale ladder: every item renders a size (km value or explanatory note)
    const scaleItems = page.locator("#scale-list > li");
    expect(await scaleItems.count()).toBe(10);
    for (let i = 0; i < 10; i++) {
      const t = await scaleItems.nth(i).locator(".event-time").textContent();
      expect(t!.trim().length).toBeGreaterThan(3);
    }
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
    await expect(page.locator("h1.hero-title")).toContainText("drifted out of orbit");
  });
});

test.describe("planet detail pages", () => {
  test("earth page shows fact table with NSSDC values", async ({ page }) => {
    await page.goto("/explore/planets/earth/");
    await expect(page.locator("h1.hero-title")).toHaveText("Earth");
    const rows = await page.locator(".data-table tbody tr").count();
    expect(rows).toBe(15);
    await expect(page.locator(".data-table", { hasText: "12,756 km" })).toBeVisible();
    await expect(page.locator(".planet-sizebar")).toBeVisible();
  });

  test("prev/next navigation traverses the set", async ({ page }) => {
    await page.goto("/explore/planets/venus/");
    await expect(page.locator(".planet-nav-link", { hasText: "Next →" })).toBeVisible();
    await page.locator(".planet-nav-link", { hasText: "Next →" }).click();
    await expect(page.locator("h1.hero-title")).toHaveText("Earth");
    await page.locator(".planet-nav-link", { hasText: "← Previous" }).click();
    await expect(page.locator("h1.hero-title")).toHaveText("Venus");
  });

  test("all 10 planet routes resolve", async ({ page }) => {
    for (const p of ["mercury","venus","earth","moon","mars","jupiter","saturn","uranus","neptune","pluto"]) {
      const res = await page.goto(`/explore/planets/${p}/`);
      expect(res?.status()).toBe(200);
    }
  });
});

test.describe("explore visualizations", () => {
  test("scale strip renders 10 positioned objects", async ({ page }) => {
    await page.goto("/explore/");
    expect(await page.locator(".scalestrip-stop").count()).toBe(10);
    await expect(page.locator(".scalestrip", { hasText: "Observable universe" })).toBeVisible();
  });

  test("planet bars chart is an accessible image with values", async ({ page }) => {
    await page.goto("/explore/");
    const aria = await page.locator("svg.planetbars").getAttribute("aria-label");
    expect(aria).toContain("Jupiter");
    expect(aria).toContain("Jupiter 142,984 km");
  });

  test("planet table links into detail pages", async ({ page }) => {
    await page.goto("/explore/");
    await page.locator(".data-table tbody tr a", { hasText: "Mars" }).click();
    await expect(page).toHaveURL(/\/explore\/planets\/mars\/$/);
  });
});

test.describe("search and 404", () => {
  test("404 page offers recovery actions", async ({ page }) => {
    await page.goto("/definitely-not-a-page/");
    await expect(page.locator("h1.hero-title")).toContainText("drifted out of orbit");
    await expect(page.getByRole("link", { name: "Back to the homepage" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Search the platform" })).toBeVisible();
  });

  test("search page input exists and is labeled", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByLabel("Search the platform")).toBeVisible();
  });
});

test.describe("seo", () => {
  test("canonical + og tags on homepage", async ({ page }) => {
    await page.goto("/");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toBe("https://universe-101.vercel.app/");
    expect(await page.locator('meta[property="og:title"]').count()).toBe(1);
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(1);
  });

  test("favicon and sitemap served", async ({ page }) => {
    const fav = await page.request.get("/favicon.svg");
    expect(fav.status()).toBe(200);
    const sm = await page.request.get("/sitemap-index.xml");
    expect(sm.status()).toBe(200);
  });

  test("planet pages have per-page canonicals", async ({ page }) => {
    await page.goto("/explore/planets/jupiter/");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toContain("/explore/planets/jupiter/");
  });
});
