/**
 * Post-build search indexing: runs Pagefind over the built site and verifies
 * the exclusion policy (fixtures/drafts/noindex pages must stay out).
 * Exits non-zero on violations — search is a release gate.
 *
 * Run with tsx (imports the TS search package directly).
 */
import { computeIndexPolicy, verifyIndexExclusions } from "@universe/search/src/index.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "apps", "web", "dist");

const policy = computeIndexPolicy(dist);
console.log(`search: ${policy.include.length} page(s) eligible, ${policy.excluded.length} excluded:`);
for (const e of policy.excluded) console.log(`  - ${e.file} (${e.reason})`);

if (policy.include.length === 0) {
  console.log("search: no eligible pages — skipping Pagefind (honest empty search state).");
  process.exit(0);
}

// Run the pagefind CLI via the workspace-local bin (the runner resolves the
// platform binary; PAGEFIND_BINARY_PATH can override in CI).
const { execFileSync } = await import("node:child_process");
const bin = join(here, "..", "node_modules", ".bin", "pagefind");
execFileSync(bin, ["--site", dist], { stdio: "inherit" });

const violations = verifyIndexExclusions(dist);
if (violations.length > 0) {
  console.error("search: EXCLUSION VIOLATIONS:");
  for (const v of violations) console.error(`  ! ${v}`);
  process.exit(1);
}
console.log("search: exclusion verification passed.");
