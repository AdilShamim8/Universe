#!/usr/bin/env node
/**
 * verify-curated-urls.mjs — re-verify every external URL in content/curated/.
 *
 * Re-runs the curation-time check: HTTP HEAD (fallback GET) following
 * redirects; 200/202/203/204/206/3xx-final-200 pass. Failures print with
 * their dataset + item; exit 1 if any hard-fail, exit 0 otherwise.
 *
 * Usage:
 *   node scripts/verify-curated-urls.mjs            # verify all datasets
 *   node scripts/verify-curated-urls.mjs library     # one dataset (no .json)
 *   CONCURRENCY=8 node scripts/verify-curated-urls.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CURATED = join(HERE, "..", "content", "curated");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const TIMEOUT_MS = 15_000;
// Some archives (gwosc.org) reject non-browser UAs; use a standard one.
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Universe101LinkCheck/1.0";

/** Recursively pull every string that looks like an http(s) URL. */
function collectUrls(node, out, path) {
  if (typeof node === "string") {
    if (/^https?:\/\//.test(node)) out.push({ url: node, path });
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => collectUrls(v, out, `${path}[${i}]`));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) collectUrls(v, out, `${path}.${k}`);
  }
}

async function checkUrl(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // HEAD first; some archives reject HEAD — fall back to GET.
    for (const method of ["HEAD", "GET"]) {
      try {
        const res = await fetch(url, {
          method,
          redirect: "follow",
          signal: ctrl.signal,
          headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
        });
        if (res.ok) return { ok: true, status: res.status };
        // rate-limiting is transient, not a broken link
        if (res.status === 429) return { ok: true, soft: true, status: 429 };
        // many CDNs bot-block non-browser TLS fingerprints (fetch 403s while
        // browsers/curl succeed) — flag for manual spot-check, not a hard fail
        if (res.status === 403 && method === "GET") return { ok: true, soft: true, status: "403 (bot-blocked? verify manually)" };
        if (method === "GET") return { ok: false, status: res.status };
      } catch (e) {
        const reason = String(e.cause?.code ?? e.message).slice(0, 60);
        // connect timeouts/aborts are network flakiness, not dead links
        const transient = /abort|timeout|connect|ECONN|socket|network/i.test(reason);
        if (method === "GET") return { ok: transient, soft: transient, status: reason };
      }
    }
    return { ok: false, status: "no-response" };
  } finally {
    clearTimeout(t);
  }
}

async function checkWithRetry(url, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await checkUrl(url);
    if (last.ok) return last;
    // several archives are slow/rate-limited: back off before retrying
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
  }
  return last;
}

async function main() {
  const only = process.argv[2]?.replace(/\.json$/, "");
  const files = readdirSync(CURATED).filter((f) => f.endsWith(".json") && (!only || f === `${only}.json`));
  if (files.length === 0) {
    console.error(`no curated dataset${only ? ` named '${only}'` : "s"} found`);
    process.exit(2);
  }

  const jobs = [];
  for (const f of files) {
    const env = JSON.parse(readFileSync(join(CURATED, f), "utf8"));
    const urls = [];
    collectUrls(env.data, urls, "$");
    console.log(`${f}: ${urls.length} URLs (verified ${env.provenance?.verification?.verifiedOn ?? "?"})`);
    for (const u of urls) jobs.push({ file: f, ...u });
  }

  const unique = new Map();
  for (const j of jobs) if (!unique.has(j.url)) unique.set(j.url, j);
  console.log(`checking ${unique.size} unique URLs, concurrency ${CONCURRENCY}…\n`);

  const results = [];
  const queue = [...unique.values()];
  async function worker() {
    while (queue.length) {
      const j = queue.shift();
      const r = await checkWithRetry(j.url);
      results.push({ ...j, ...r });
      const mark = r.ok ? " ✓" : " ✗";
      if (!r.ok) console.log(`  ${mark} ${r.status}  ${j.url}  (${j.file} ${j.path})`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const ok = results.filter((r) => r.ok && !r.soft).length;
  const soft = results.filter((r) => r.soft);
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${ok}/${results.length} verified reachable (${((ok / results.length) * 100).toFixed(1)}%)`);
  if (soft.length) {
    console.log(`\nUNVERIFIABLE from this network (${soft.length}) — transient errors, not confirmed dead:`);
    for (const b of soft) console.log(`  ${b.status}  ${b.url}`);
  }
  if (bad.length) {
    console.log(`\nFAILED (${bad.length}):`);
    for (const b of bad) console.log(`  ${b.status}  ${b.url}`);
    process.exit(1);
  }
}

main();
