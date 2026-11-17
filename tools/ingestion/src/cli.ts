/**
 * Ingestion CLI — `npm run ingest:dry-run`.
 *
 * Dry-run (default in CI): processes fixtures with zero network access and
 * prints a bounded report. Live mode (`--live`) requires explicit opt-in and
 * an allowlisted destination; failures retain the last good candidate store.
 * The candidate store lives under .data/ (gitignored) — never in Git.
 */
import { runCrossrefAdapter } from "./crossref.js";
import type { HttpTransport } from "./fetcher.js";
import { fixtureItems, fixtureSchemaDriftItem, fixtureMissingDoiItem } from "./fixtures.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const storePath = join(repoRoot, ".data", "ingestion", "candidates.json");

const args = process.argv.slice(2);
const dryRun = !args.includes("--live");

// Load adapter config from the source allowlist registry.
const allowlistPath = join(repoRoot, "registries", "sources", "allowlist.yaml");
const allowlist = parseYaml(readFileSync(allowlistPath, "utf8")) as {
  sources: { id: string; base_url: string; endpoint: string; request_budget: { max_items_per_run: number; timeout_ms: number; max_response_bytes: number; retries: number; backoff_ms: number }; refresh: { enabled: boolean } }[];
};
const crossref = allowlist.sources.find((s) => s.id === "crossref.metadata");
if (!crossref) {
  console.error("ingest: crossref.metadata missing from registries/sources/allowlist.yaml");
  process.exit(1);
}
if (!dryRun && crossref.refresh.enabled !== true) {
  console.error("ingest: live mode is disabled in the allowlist (refresh.enabled=false). Dry-run only.");
  process.exit(1);
}

// Existing candidates (idempotency base). A missing store = empty list.
type Stored = Parameters<typeof runCrossrefAdapter>[2];
const existing: Stored = existsSync(storePath) ? JSON.parse(readFileSync(storePath, "utf8")) : [];

// Transport: dry-run never touches the network (fixture items are used);
// live mode uses Node fetch with a DNS-resolving transport.
const transport: HttpTransport = {
  async request(url: string, init: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }) {
    const res = await fetch(url, { ...init, redirect: "manual" });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return { status: res.status, headers, body: res.body };
  },
  async resolve(hostname: string) {
    const { lookup } = await import("node:dns/promises");
    const result = await lookup(hostname, { all: true });
    return result.map((r) => r.address);
  },
};

const today = new Date().toISOString().slice(0, 10);

const run = await runCrossrefAdapter(
  {
    query: "astronomy cosmology review",
    maxItems: crossref.request_budget.max_items_per_run,
    dryRun,
    today,
  },
  transport,
  existing,
  // Dry-run fixture set: two valid items plus one schema-drift and one
  // missing-DOI item to exercise quarantine paths on every run.
  dryRun ? [...fixtureItems, fixtureSchemaDriftItem, fixtureMissingDoiItem] : undefined,
);

console.log(`ingest: mode=${dryRun ? "dry-run (no network)" : "live"}`);
console.log(`ingest: fetched=${run.fetched} candidates=${run.candidates.length} revisions=${run.revisions.length} unchanged=${run.unchanged.length} quarantined=${run.quarantined.length}`);
for (const q of run.quarantined) {
  console.log(`  quarantined: ${q.reason} — ${q.detail}`);
}
for (const rev of run.revisions) {
  console.log(`  revision: ${rev}`);
}
if (run.failure) {
  console.error(`ingest: fetch failure (${run.failure.kind}): ${run.failure.detail}`);
  console.error("ingest: retaining previous candidate store; nothing deleted.");
  process.exit(2);
}

// Persist the candidate store (gitignored, local only).
mkdirSync(dirname(storePath), { recursive: true });
writeFileSync(storePath, JSON.stringify(run.candidates, null, 2), "utf8");
console.log(`ingest: candidate store updated (${storePath}) — review candidates only, never claims.`);
if (dryRun) {
  console.log("ingest: dry-run complete. No network requests were made; no source was scanned.");
}
