import { defineConfig } from "astro/config";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The registry/contracts packages resolve their data directories from
// import.meta.url, which breaks under Astro's bundled prerender chunks
// (dist/.prerender/). Pin both to the real repo before anything imports them.
process.env.UNIVERSE_ROOT ??= REPO_ROOT;
process.env.UNIVERSE_CONTRACTS_DIR ??= join(REPO_ROOT, "packages", "contracts", "schema");

// Registry-driven redirects (registries/redirects/redirects.yaml): editorial
// slug renames. Withdrawn records get no redirect by design.
function loadRedirects() {
  const file = join(REPO_ROOT, "registries", "redirects", "redirects.yaml");
  if (!existsSync(file)) return {};
  try {
    const data = parseYaml(readFileSync(file, "utf8"));
    const list = Array.isArray(data?.redirects) ? data.redirects : [];
    const out = {};
    for (const r of list) {
      if (typeof r?.slug === "string" && typeof r?.target === "string") {
        out[`/${r.slug}`] = r.target.startsWith("/") ? r.target : `/${r.target}`;
      }
    }
    return out;
  } catch {
    return {};
  }
}

// Static-first build. No live external APIs, no SSR, no adapter: the site is
// a deterministic artifact built from the approved registry projection.
export default defineConfig({
  site: "https://universe-platform.example",
  output: "static",
  trailingSlash: "always",
  redirects: loadRedirects(),
  build: {
    inlineStylesheets: "auto",
  },
  // Pagefind indexes the build output post-build (see package scripts / CI);
  // fixture and draft pages are excluded via data attributes and noindex.
});
