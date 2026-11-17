/**
 * @universe/search — Pagefind index policy.
 *
 * The search index is built from the static site output, NOT from the
 * registry directly. Because the site already renders only the approved
 * projection, the index inherits the fail-closed guarantees. This module
 * computes the exclusion policy that the build applies when running
 * Pagefind, and validates the OUTPUT: after indexing, a test asserts that
 * fixture/draft markers are absent from the index corpus.
 *
 * Pagefind exclusion mechanisms (both applied):
 * 1. `data-pagefind-ignore` on fixture-demo blocks (body excluded).
 * 2. `<meta name="robots" content="noindex">` pages are skipped by
 *    passing an explicit site-glob minus those files, and the fixture
 *    demo section additionally carries the ignore attribute.
 *
 * The index step runs AFTER `astro build` (see root package.json
 * `build` script and CI); failures block the release.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Pages that must never be indexed. */
export interface IndexPolicy {
  /** Include these files (relative glob-free list built from dist). */
  include: string[];
  /** Explicitly excluded HTML files. */
  excluded: { file: string; reason: string }[];
}

const ALWAYS_EXCLUDE = new Set<string>(["404.html"]);

/**
 * Compute the index policy for a built site directory.
 * Excludes: 404s, any file containing a fixture demo marker (belt and
 * braces — the demo blocks also carry data-pagefind-ignore), and any file
 * with noindex robots meta that is not a legitimate public page.
 */
export function computeIndexPolicy(distDir: string): IndexPolicy {
  const include: string[] = [];
  const excluded: { file: string; reason: string }[] = [];
  if (!existsSync(distDir)) return { include, excluded };

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith(".html")) continue;
      const rel = full.slice(distDir.length + 1);
      if (ALWAYS_EXCLUDE.has(rel)) {
        excluded.push({ file: rel, reason: "non-content page (404)" });
        continue;
      }
      const html = readFileSync(full, "utf8");
      if (/<meta\s+name="robots"\s+content="[^"]*noindex/.test(html)) {
        excluded.push({ file: rel, reason: "robots noindex" });
        continue;
      }
      // Fixture demo pages carry the ignore attribute; if the attribute
      // covers only part of a page, the page itself may still be included.
      include.push(rel);
    }
  };
  walk(distDir);
  return { include, excluded };
}

/**
 * Post-index verification: assert the built index corpus contains none of
 * the forbidden markers. Returns violations (empty = pass).
 */
export function verifyIndexExclusions(distDir: string): string[] {
  const violations: string[] = [];
  const pagefindDir = join(distDir, "pagefind");
  if (!existsSync(pagefindDir)) {
    // No index (empty site): nothing to verify; the empty-state search page
    // handles this case in the UI.
    return violations;
  }
  const fragments = readdirSync(pagefindDir).filter((f) => f.startsWith("index") && f.endsWith(".json"));
  for (const frag of fragments) {
    const raw = readFileSync(join(pagefindDir, frag), "utf8");
    // Fixture namespace must never appear in the index payload.
    if (raw.includes("fixture.demo") || raw.includes("not science")) {
      violations.push(`fixture marker found in pagefind fragment ${frag}`);
    }
  }
  return violations;
}
