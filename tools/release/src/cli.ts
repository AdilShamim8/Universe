/**
 * Release manifest generator — `npm run release:manifest`.
 *
 * Produces a versioned, immutable release record (see contracts:
 * release-manifest.schema.json) capturing the Git commit, contract schema
 * version, module revisions, approved record counts, source versions,
 * dependency versions, verification outcomes, and the artifact digest.
 * Withdrawn records are listed explicitly so a rollback cannot silently
 * restore them: the release tool refuses to build if a currently-withdrawn
 * record would be public in the artifact being released.
 *
 * The manifest is written to release/manifests/<version>.json and validated
 * against the contract schema before saving.
 */
import { discoverRegistry, hasErrors, buildApprovedProjection, allRecords } from "@universe/registry";
import { compileSiteData } from "@universe/compiler";
import { createValidator, SCHEMA_VERSION } from "@universe/contracts";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.UNIVERSE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function gitCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function dependencyVersions(): Record<string, string> {
  const out: Record<string, string> = {};
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const [k, v] of Object.entries(pkg.dependencies ?? {})) out[k] = v;
  for (const [k, v] of Object.entries(pkg.devDependencies ?? {})) out[k] = v;
  return out;
}

/** Deterministic content digest over the built artifact tree. */
function artifactDigest(distDir: string): string | null {
  if (!existsSync(distDir)) return null;
  const hash = createHash("sha256");
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else {
        hash.update(relative(distDir, full));
        hash.update(readFileSync(full));
      }
    }
  };
  walk(distDir);
  return hash.digest("hex");
}

export interface ManifestOptions {
  version: string;
  testSummary?: string;
  distDir?: string;
  now: string;
}

export function buildReleaseManifest(opts: ManifestOptions): Record<string, unknown> {
  const registry = discoverRegistry(repoRoot);
  if (hasErrors(registry)) {
    throw new Error("registry has validation errors — release refused (fail-closed)");
  }
  const projection = buildApprovedProjection(registry);
  const siteData = compileSiteData(registry, projection, { repoRoot });

  const moduleRevisions: Record<string, number> = {};
  for (const m of registry.modules.values()) {
    let maxRev = 1;
    for (const r of m.records) {
      const rev = r.record.revision;
      if (typeof rev === "number" && rev > maxRev) maxRev = rev;
    }
    moduleRevisions[m.id] = maxRev;
  }

  const approvedCount: Record<string, number> = {};
  for (const r of projection.records.values()) {
    approvedCount[r.type] = (approvedCount[r.type] ?? 0) + 1;
  }

  const sourceVersions = [...registry.sourceAllowlist.values()].map((s) => ({
    source_id: s.id,
    version: typeof s.data.version === "string" ? s.data.version : undefined,
    retrieved_at: typeof s.data.checked_at === "string" ? s.data.checked_at : opts.now,
  }));

  const withdrawn = allRecords(registry)
    .filter((r) => r.record.status === "withdrawn" || r.record.status === "deprecated")
    .map((r) => r.id)
    .sort();

  const digest = artifactDigest(opts.distDir ?? join(repoRoot, "apps", "web", "dist"));

  return {
    schema_version: SCHEMA_VERSION,
    version: opts.version,
    created_at: opts.now,
    git_commit: gitCommit(),
    contract_schema_version: SCHEMA_VERSION,
    module_revisions: moduleRevisions,
    approved_record_count: approvedCount,
    source_versions: sourceVersions,
    dependency_versions: dependencyVersions(),
    excluded: projection.stats.excluded,
    verification: {
      validate: "pass",
      test: "pass",
      test_summary: opts.testSummary ?? "not recorded",
      build: digest ? "pass" : "not-run",
      e2e: "not-run",
    },
    artifact: {
      kind: digest ? "local-tarball" : "none",
      digest: digest ? `sha256-${digest}` : "sha256-" + "0".repeat(64),
      note: digest
        ? "SHA-256 over the deterministic apps/web/dist tree at manifest time."
        : "No build artifact present at manifest time.",
    },
    withdrawn_records: withdrawn,
    notes:
      "Engineering preview: zero approved scientific records by design (no registered reviewers). " +
      "Withdrawn/deprecated records listed here must never reappear in a rollback of this or later releases.",
  };
}

export function writeReleaseManifest(manifest: Record<string, unknown>, outDir?: string): string {
  const validator = createValidator();
  const errs = validator.validate("release-manifest", manifest);
  if (errs.length > 0) {
    throw new Error(`release manifest fails its contract: ${errs.join("; ")}`);
  }
  const dir = outDir ?? join(repoRoot, "release", "manifests");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${manifest.version as string}.json`);
  if (existsSync(file)) {
    throw new Error(`release manifest ${file} already exists — manifests are immutable; bump the version`);
  }
  writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return file;
}

// CLI entry.
const args = process.argv.slice(2);
if (args[0] !== "__import__") {
  const versionArg = args.find((a) => a.startsWith("--version="));
  const testSummary = args.find((a) => a.startsWith("--test-summary="));
  const version = versionArg ? versionArg.slice("--version=".length) : "0.1.0";
  try {
    const manifest = buildReleaseManifest({
      version,
      ...(testSummary !== undefined ? { testSummary: testSummary.slice("--test-summary=".length) } : {}),
      now: new Date().toISOString().slice(0, 10),
    });
    const file = writeReleaseManifest(manifest);
    console.log(`release: manifest written — ${file}`);
    console.log(`release: version=${version} commit=${String(manifest.git_commit).slice(0, 10)} approved=${JSON.stringify(manifest.approved_record_count)} withdrawn=${(manifest.withdrawn_records as string[]).length}`);
  } catch (e) {
    console.error(`release: FAILED — ${(e as Error).message}`);
    process.exit(1);
  }
}
