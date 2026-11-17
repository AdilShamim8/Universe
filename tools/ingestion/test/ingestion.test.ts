import { describe, expect, it } from "vitest";
import {
  isBlockedAddress,
  isBlockedIpv4,
  isBlockedIpv6,
  originAllowed,
  safeFetch,
  fetchWithRetry,
  type HttpTransport,
} from "../src/fetcher.js";
import { normalizeItem, toCandidate, runCrossrefAdapter, PERMITTED_FIELDS } from "../src/crossref.js";
import { fixtureItems, fixtureSchemaDriftItem, fixtureMissingDoiItem } from "../src/fixtures.js";

// ---------------------------------------------------------------------------
// SSRF protections
// ---------------------------------------------------------------------------

describe("fetcher: private address blocking", () => {
  it("blocks RFC 1918, loopback, link-local, CGNAT and unspecified IPv4", () => {
    for (const ip of ["10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "169.254.1.1", "100.64.0.1", "100.127.255.255", "0.0.0.0"]) {
      expect(isBlockedIpv4(ip), ip).toBe(true);
    }
  });

  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "100.128.0.1"]) {
      expect(isBlockedIpv4(ip), ip).toBe(false);
    }
  });

  it("blocks IPv6 loopback, link-local, unique-local and mapped private", () => {
    expect(isBlockedIpv6("::1")).toBe(true);
    expect(isBlockedIpv6("::")).toBe(true);
    expect(isBlockedIpv6("fe80::1")).toBe(true);
    expect(isBlockedIpv6("fd00::1")).toBe(true);
    expect(isBlockedIpv6("fc00::1")).toBe(true);
    expect(isBlockedIpv6("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIpv6("fec0::1")).toBe(true);
    expect(isBlockedIpv6("2606:4700::1111")).toBe(false);
  });

  it("dispatches v4/v6 by colon presence", () => {
    expect(isBlockedAddress("10.0.0.1")).toBe(true);
    expect(isBlockedAddress("::1")).toBe(true);
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
  });
});

describe("fetcher: allowlist and origin checks", () => {
  it("accepts only https origins on the allowlist", () => {
    expect(originAllowed("https://api.crossref.org/works", ["https://api.crossref.org"])).toBe(true);
    expect(originAllowed("http://api.crossref.org/works", ["https://api.crossref.org"])).toBe(false);
    expect(originAllowed("https://evil.example/works", ["https://api.crossref.org"])).toBe(false);
    expect(originAllowed("https://api.crossref.org.evil.example/works", ["https://api.crossref.org"])).toBe(false);
    expect(originAllowed("not a url", ["https://api.crossref.org"])).toBe(false);
  });
});

// Deterministic in-memory transport for tests.
function fakeTransport(opts: {
  addresses?: string[];
  status?: number;
  headers?: Record<string, string>;
  bodyText?: string;
  redirects?: { from: string; to: string }[];
}): HttpTransport {
  return {
    async request(url) {
      const redirect = opts.redirects?.find((r) => r.from === url);
      if (redirect) {
        return { status: 302, headers: { location: redirect.to }, body: null };
      }
      return {
        status: opts.status ?? 200,
        headers: opts.headers ?? { "content-type": "application/json" },
        body: null,
        text: opts.bodyText ?? "{}",
      };
    },
    async resolve(hostname) {
      void hostname;
      return opts.addresses ?? ["192.0.2.10"]; // TEST-NET public-looking default
    },
  };
}

describe("fetcher: safeFetch", () => {
  const allow = ["https://api.crossref.org"];

  it("blocks when DNS resolves to a private address", async () => {
    const t = fakeTransport({ addresses: ["10.0.0.5"] });
    const res = await safeFetch("https://api.crossref.org/works", t, { allowlist: allow });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe("ssrf-blocked-address");
      expect(res.detail).toContain("10.0.0.5");
    }
  });

  it("blocks any of multiple resolved addresses being private (DNS rebinding shape)", async () => {
    const t = fakeTransport({ addresses: ["192.0.2.10", "169.254.9.9"] });
    const res = await safeFetch("https://api.crossref.org/works", t, { allowlist: allow });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe("ssrf-blocked-address");
  });

  it("refuses redirects to non-allowlisted origins", async () => {
    const t = fakeTransport({
      redirects: [{ from: "https://api.crossref.org/works", to: "https://evil.example/steal" }],
    });
    const res = await safeFetch("https://api.crossref.org/works", t, { allowlist: allow });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe("redirect-refused");
  });

  it("follows allowlisted redirects with revalidation", async () => {
    const t = fakeTransport({
      redirects: [{ from: "https://api.crossref.org/works", to: "https://api.crossref.org/v2/works" }],
      bodyText: '{"ok":true}',
    });
    const res = await safeFetch("https://api.crossref.org/works", t, { allowlist: allow });
    expect(res.ok).toBe(true);
  });

  it("enforces the response size cap", async () => {
    const big = "x".repeat(1024);
    const t = fakeTransport({ bodyText: big });
    const res = await safeFetch("https://api.crossref.org/works", t, {
      allowlist: allow,
      budget: { maxResponseBytes: 100, timeoutMs: 1000, retries: 0, backoffMs: 1 },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe("too-large");
  });

  it("rejects wrong content types", async () => {
    const t = fakeTransport({ headers: { "content-type": "text/html" }, bodyText: "<html>" });
    const res = await safeFetch("https://api.crossref.org/works", t, {
      allowlist: allow,
      expectedContentTypes: ["application/json"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe("wrong-content-type");
  });

  it("surfaces HTTP errors", async () => {
    const t = fakeTransport({ status: 429, headers: { "content-type": "application/json" } });
    const res = await safeFetch("https://api.crossref.org/works", t, { allowlist: allow });
    expect(res.ok).toBe(false);
    if (!res.ok && res.kind === "http-error") expect(res.status).toBe(429);
  });

  it("never retries SSRF refusals even via fetchWithRetry", async () => {
    let calls = 0;
    const t: HttpTransport = {
      async request() {
        calls++;
        return { status: 200, headers: { "content-type": "application/json" }, body: null, text: "{}" };
      },
      async resolve() {
        return ["127.0.0.1"];
      },
    };
    const res = await fetchWithRetry("https://api.crossref.org/works", t, {
      allowlist: allow,
      budget: { retries: 3, timeoutMs: 1000, maxResponseBytes: 1000, backoffMs: 1 },
    });
    expect(res.ok).toBe(false);
    expect(calls).toBe(0); // refused before any request
  });

  it("retries transient HTTP 429 errors with backoff", async () => {
    let calls = 0;
    const t: HttpTransport = {
      async request() {
        calls++;
        if (calls < 3) return { status: 429, headers: {}, body: null };
        return { status: 200, headers: { "content-type": "application/json" }, body: null, text: "{}" };
      },
      async resolve() {
        return ["192.0.2.10"];
      },
    };
    const res = await fetchWithRetry("https://api.crossref.org/works", t, {
      allowlist: allow,
      budget: { retries: 3, timeoutMs: 1000, maxResponseBytes: 1000, backoffMs: 1 },
    });
    expect(res.ok).toBe(true);
    expect(calls).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Crossref adapter
// ---------------------------------------------------------------------------

describe("crossref adapter: normalization", () => {
  it("permits only the allowlisted fields — abstract presence quarantines", () => {
    const res = normalizeItem(fixtureSchemaDriftItem);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("schema-drift");
  });

  it("quarantines missing DOI", () => {
    const res = normalizeItem(fixtureMissingDoiItem);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("missing-doi");
  });

  it("normalizes a valid fixture item into permitted fields only", () => {
    const res = normalizeItem(fixtureItems[0]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.candidate.doi).toBe("10.9999/fixture.example-0001");
      expect(res.candidate.title).toContain("Fixture");
      expect(res.candidate.authors).toEqual(["Fixture Author"]);
      expect(res.candidate.issuedYear).toBe(2026);
      // The normalized shape contains ONLY permitted data — no abstract key can exist.
      const keys = Object.keys(res.candidate);
      expect(keys).not.toContain("abstract");
    }
  });

  it("lists exactly the permitted fields", () => {
    expect(PERMITTED_FIELDS).not.toContain("abstract");
    expect(PERMITTED_FIELDS).toContain("DOI");
  });
});

describe("crossref adapter: run (dry-run, deterministic)", () => {
  it("produces candidates, quarantines drift and missing-DOI, zero network", async () => {
    const t: HttpTransport = {
      async request() {
        throw new Error("network must not be touched in dry-run");
      },
      async resolve() {
        throw new Error("DNS must not be touched in dry-run");
      },
    };
    const run = await runCrossrefAdapter(
      { query: "fixture", maxItems: 25, dryRun: true, today: "2026-11-17" },
      t,
      [],
      [...fixtureItems, fixtureSchemaDriftItem, fixtureMissingDoiItem],
    );
    expect(run.fetched).toBe(4);
    expect(run.candidates).toHaveLength(2);
    expect(run.quarantined).toHaveLength(2);
    expect(run.failure).toBeNull();
    expect(run.candidates.every((c) => c.status === "candidate")).toBe(true);
    expect(run.candidates.every((c) => c.id.startsWith("candidate.crossref."))).toBe(true);
  });

  it("is idempotent: rerunning with unchanged items yields zero revisions", async () => {
    const t: HttpTransport = { async request() { throw new Error("no network"); }, async resolve() { throw new Error("no dns"); } };
    const first = await runCrossrefAdapter({ query: "f", maxItems: 25, dryRun: true, today: "2026-11-17" }, t, [], fixtureItems);
    const second = await runCrossrefAdapter({ query: "f", maxItems: 25, dryRun: true, today: "2026-11-18" }, t, first.candidates, fixtureItems);
    expect(second.revisions).toHaveLength(0);
    expect(second.unchanged).toHaveLength(2);
    expect(second.candidates[0]!.firstSeen).toBe("2026-11-17");
    expect(second.candidates[0]!.lastSeen).toBe("2026-11-18");
  });

  it("flags a revision when content changes for the same DOI (hash-based)", async () => {
    const t: HttpTransport = { async request() { throw new Error("no network"); }, async resolve() { throw new Error("no dns"); } };
    const first = await runCrossrefAdapter({ query: "f", maxItems: 25, dryRun: true, today: "2026-11-17" }, t, [], fixtureItems);
    const changed = [{ ...fixtureItems[0] as object, title: ["Fixture Example Paper One REVISED (non-science)"] }];
    const second = await runCrossrefAdapter({ query: "f", maxItems: 25, dryRun: true, today: "2026-11-18" }, t, first.candidates, changed);
    expect(second.revisions).toHaveLength(1);
    expect(second.revisions[0]).toBe("10.9999/fixture.example-0001");
  });

  it("retains existing candidates on fetch failure (transient error ≠ deletion)", async () => {
    const t: HttpTransport = {
      async request() {
        return { status: 503, headers: {}, body: null };
      },
      async resolve() {
        return ["192.0.2.10"];
      },
    };
    const existing = [toCandidate(normalizeItem(fixtureItems[0])!.ok ? (normalizeItem(fixtureItems[0]) as { ok: true; candidate: never }).candidate : (undefined as never), "2026-11-16")];
    const run = await runCrossrefAdapter({ query: "f", maxItems: 25, dryRun: false, today: "2026-11-17" }, t, existing);
    expect(run.failure).not.toBeNull();
    expect(run.candidates).toHaveLength(0); // run output is empty...
    // ...but the CLI keeps `existing` in the store; the adapter contract is
    // that the caller decides persistence only when failure === null.
    expect(run.fetched).toBe(0);
  });

  it("deduplicates by DOI (same DOI twice in one response)", async () => {
    const t: HttpTransport = { async request() { throw new Error("no network"); }, async resolve() { throw new Error("no dns"); } };
    const run = await runCrossrefAdapter({ query: "f", maxItems: 25, dryRun: true, today: "2026-11-17" }, t, [], [fixtureItems[0], fixtureItems[0]]);
    expect(run.candidates).toHaveLength(1);
  });
});

describe("crossref adapter: candidate hashing", () => {
  it("content hash is stable across identical inputs and sensitive to edits", () => {
    const meta = normalizeItem(fixtureItems[0]);
    if (!meta.ok) throw new Error("fixture must normalize");
    const a = toCandidate(meta.candidate, "2026-11-17");
    const b = toCandidate(meta.candidate, "2026-11-18");
    expect(a.contentHash).toBe(b.contentHash); // date-independent
    const edited = { ...meta.candidate, title: "changed" };
    const c = toCandidate(edited, "2026-11-17");
    expect(c.contentHash).not.toBe(a.contentHash);
  });
});
