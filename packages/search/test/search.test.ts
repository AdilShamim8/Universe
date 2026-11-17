import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeIndexPolicy, verifyIndexExclusions } from "../src/index.js";

function makeDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "universe-search-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return dir;
}

describe("search: index policy", () => {
  it("includes normal pages and excludes 404s and noindex pages", () => {
    const dist = makeDist({
      "index.html": "<html><body>home</body></html>",
      "404.html": "<html><body>missing</body></html>",
      "search/index.html": '<html><head><meta name="robots" content="noindex, nofollow"></head><body>search</body></html>',
      "academy/index.html": "<html><body>academy</body></html>",
    });
    try {
      const policy = computeIndexPolicy(dist);
      expect(policy.include).toEqual(["academy/index.html", "index.html"]);
      expect(policy.excluded.map((e) => e.file)).toContain("404.html");
      expect(policy.excluded.map((e) => e.file)).toContain("search/index.html");
      expect(policy.excluded.find((e) => e.file === "search/index.html")?.reason).toBe("robots noindex");
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("returns empty policy for a missing directory", () => {
    const policy = computeIndexPolicy(join(tmpdir(), "does-not-exist-universe"));
    expect(policy.include).toEqual([]);
    expect(policy.excluded).toEqual([]);
  });

  it("keeps pages whose fixture demo block is only partially ignored (attribute-based exclusion)", () => {
    // The history page is public; only its demo block carries the ignore
    // attribute. Pagefind honors data-pagefind-ignore at block level, so the
    // page stays indexable for its real (empty-state) content.
    const dist = makeDist({
      "history/index.html": "<html><body><section data-pagefind-ignore>fixture demo</section><h1>Universe History</h1></body></html>",
    });
    try {
      const policy = computeIndexPolicy(dist);
      expect(policy.include).toEqual(["history/index.html"]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

describe("search: index verification", () => {
  it("passes when no pagefind index exists (empty site)", () => {
    const dist = makeDist({ "index.html": "<html></html>" });
    try {
      expect(verifyIndexExclusions(dist)).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("detects fixture markers leaked into pagefind fragments", () => {
    const dist = makeDist({});
    mkdirSync(join(dist, "pagefind"), { recursive: true });
    writeFileSync(join(dist, "pagefind", "index-0.json"), JSON.stringify({ content: "event.fixture.demo-epoch-alpha" }), "utf8");
    try {
      const violations = verifyIndexExclusions(dist);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain("fixture marker found");
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("passes a clean pagefind index", () => {
    const dist = makeDist({});
    mkdirSync(join(dist, "pagefind"), { recursive: true });
    writeFileSync(join(dist, "pagefind", "index-0.json"), JSON.stringify({ content: "clean approved content" }), "utf8");
    try {
      expect(verifyIndexExclusions(dist)).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
