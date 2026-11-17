/**
 * Validation CLI — `npm run validate`.
 *
 * Runs the full registry validation (schemas, references, lifecycle,
 * rights, review hashes, temporal constraints) plus the fail-closed
 * projection check. Exit 0 = clean; exit 1 = findings. Prints an honest
 * summary: module/record counts, warnings, and the approved-projection
 * exclusion stats.
 */
import { discoverRegistry, hasErrors, formatFindings, buildApprovedProjection } from "@universe/registry";
import { compileSiteData } from "@universe/compiler";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.UNIVERSE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const registry = discoverRegistry(repoRoot);

console.log(`validate: modules=${registry.stats.modules} experiences=${registry.stats.experiences} records=${registry.stats.records} reviewDecisions=${registry.stats.reviewDecisions} reviewers=${registry.reviewers.size} allowlistedSources=${registry.sourceAllowlist.size}`);

const warnings = registry.findings.filter((f) => f.severity === "warning");
if (warnings.length > 0) {
  console.log(`validate: ${warnings.length} warning(s):`);
  console.log(formatFindings(warnings));
}

const errors = registry.findings.filter((f) => f.severity === "error");
if (hasErrors(registry)) {
  console.error(`validate: FAILED — ${errors.length} error(s):`);
  console.error(formatFindings(errors));
  process.exit(1);
}

// Projection check: must succeed on a clean registry.
const projection = buildApprovedProjection(registry);
const siteData = compileSiteData(registry, projection, { repoRoot });
console.log(
  `validate: approved projection — ${projection.stats.records} record(s) public, excluded: ${JSON.stringify(projection.stats.excluded)}`,
);
console.log(
  `validate: site data — ${siteData.nav.length} sections, ${siteData.coverage.length} coverage rows, ${siteData.concepts.length} concepts, ${siteData.lessons.length} lessons, ${siteData.events.length} timeline events`,
);
if (siteData.emptyState) {
  console.log("validate: NOTE — zero approved records; the site renders honest empty states (engineering preview).");
}
console.log("validate: pass");
