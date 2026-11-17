/**
 * Crossref bibliographic-metadata adapter.
 *
 * Strictly allowlisted fields ONLY (SYSTEM_DESIGN §9 / ADR 0005):
 * DOI, title, author, container-title, issued, publisher, type, URL, ISSN,
 * volume, issue, page. Abstracts are NEVER read or stored (copyrighted).
 * No full text, no LLM, no automated interpretation.
 *
 * Incoming items become review CANDIDATES — never claims. The candidate
 * store is local (gitignored); reruns are idempotent via DOI + content-hash
 * dedup. Schema drift (unexpected fields in the allowlist response) is
 * quarantined, not dropped silently.
 */
import { createHash } from "node:crypto";
import type { FetchResult, FetchFailure } from "./fetcher.js";
import { fetchWithRetry, type HttpTransport } from "./fetcher.js";

/** The only Crossref fields this adapter may read. */
export const PERMITTED_FIELDS = [
  "DOI",
  "title",
  "author",
  "container-title",
  "issued",
  "publisher",
  "type",
  "URL",
  "ISSN",
  "volume",
  "issue",
  "page",
] as const;

export type PermittedField = (typeof PERMITTED_FIELDS)[number];

export interface CandidateMetadata {
  doi: string;
  title: string;
  authors: string[];
  containerTitle: string | null;
  issuedYear: number | null;
  publisher: string | null;
  type: string | null;
  url: string | null;
  issn: string[];
  volume: string | null;
  issue: string | null;
  page: string | null;
}

export interface Candidate {
  id: string;
  source: "crossref.metadata";
  doi: string;
  /** SHA-256 over the normalized permitted fields — revision detection. */
  contentHash: string;
  metadata: CandidateMetadata;
  firstSeen: string;
  lastSeen: string;
  status: "candidate";
}

export interface QuarantinedItem {
  reason: "schema-drift" | "missing-doi" | "malformed";
  raw: string;
  detail: string;
}

export interface AdapterRun {
  fetched: number;
  candidates: Candidate[];
  /** Updated = DOI seen before with CHANGED content hash (revision flag). */
  revisions: string[];
  unchanged: string[];
  quarantined: QuarantinedItem[];
  failure: FetchFailure | null;
}

export interface AdapterConfig {
  /** Maintainer-configured query (e.g. a subject filter). */
  query: string;
  maxItems: number;
  /** Dry-run: no network at all. */
  dryRun: boolean;
  today: string;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Normalize one Crossref work item into permitted fields. */
export function normalizeItem(item: unknown): { ok: true; candidate: CandidateMetadata } | { ok: false; reason: QuarantinedItem["reason"]; detail: string } {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return { ok: false, reason: "malformed", detail: "item is not an object" };
  }
  const obj = item as Record<string, unknown>;
  // Schema-drift check: any field beyond the permitted set (plus the
  // response-envelope fields we tolerate at item level: none) is flagged.
  const tolerated = new Set<string>(PERMITTED_FIELDS);
  const extra = Object.keys(obj).filter((k) => !tolerated.has(k));
  if (extra.length > 0) {
    // 'abstract' presence is a rights red line — treat explicitly.
    return { ok: false, reason: "schema-drift", detail: `unexpected fields: ${extra.join(", ")}` };
  }
  const doi = typeof obj.DOI === "string" ? obj.DOI.trim().toLowerCase() : "";
  if (doi.length === 0) return { ok: false, reason: "missing-doi", detail: "no DOI" };
  const title = Array.isArray(obj.title) && typeof obj.title[0] === "string" ? obj.title[0] : typeof obj.title === "string" ? obj.title : "";
  if (title.length === 0) return { ok: false, reason: "malformed", detail: "no title" };
  const authors = Array.isArray(obj.author)
    ? obj.author
        .map((a) => (a !== null && typeof a === "object" ? [ (a as Record<string, unknown>).given, (a as Record<string, unknown>).family ] : []))
        .map((parts) => parts.filter((p) => typeof p === "string" && p.length > 0).join(" "))
        .filter((n) => n.length > 0)
    : [];
  const issuedRaw = (obj.issued as { "date-parts"?: number[][] } | undefined)?.["date-parts"];
  const issuedYear = Array.isArray(issuedRaw) && Array.isArray(issuedRaw[0]) && typeof issuedRaw[0]![0] === "number" ? issuedRaw[0]![0] : null;
  const issn = Array.isArray(obj.ISSN) ? obj.ISSN.filter((s): s is string => typeof s === "string") : [];
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  return {
    ok: true,
    candidate: {
      doi,
      title,
      authors,
      containerTitle: str((obj["container-title"] as unknown[] | undefined)?.[0]),
      issuedYear,
      publisher: str(obj.publisher),
      type: str(obj.type),
      url: str(obj.URL),
      issn,
      volume: str(obj.volume),
      issue: str(obj.issue),
      page: str(obj.page),
    },
  };
}

/** Deterministic candidate from normalized metadata. */
export function toCandidate(meta: CandidateMetadata, today: string): Candidate {
  const hash = sha256(JSON.stringify(meta));
  return {
    id: `candidate.crossref.${meta.doi.replace(/[^a-z0-9.-]/g, "-")}`,
    source: "crossref.metadata",
    doi: meta.doi,
    contentHash: hash,
    metadata: meta,
    firstSeen: today,
    lastSeen: today,
    status: "candidate",
  };
}

/**
 * Run the adapter. In dry-run mode it processes fixture items with NO
 * network. In live mode it fetches one bounded, allowlisted request.
 * A failed fetch NEVER deletes existing candidates (transient ≠ removal).
 */
export async function runCrossrefAdapter(
  config: AdapterConfig,
  transport: HttpTransport,
  existing: Candidate[] = [],
  fixtureItems?: unknown[],
): Promise<AdapterRun> {
  const byDoi = new Map(existing.map((c) => [c.doi, c]));
  const out: AdapterRun = { fetched: 0, candidates: [], revisions: [], unchanged: [], quarantined: [], failure: null };
  let items: unknown[];
  if (config.dryRun) {
    items = fixtureItems ?? [];
  } else {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(config.query)}&rows=${config.maxItems}`;
    const res = await fetchWithRetry(url, transport, {
      allowlist: ["https://api.crossref.org"],
      expectedContentTypes: ["application/json"],
    });
    if (!res.ok) {
      out.failure = res;
      return out; // retain last good candidates — caller keeps `existing`
    }
    const body = res as FetchResult;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.body);
    } catch (e) {
      out.failure = { ok: false, kind: "network", detail: `JSON parse failure: ${(e as Error).message}` };
      return out;
    }
    const message = (parsed as { message?: { items?: unknown[] } }).message;
    items = Array.isArray(message?.items) ? message!.items! : [];
  }

  for (const item of items.slice(0, config.maxItems)) {
    out.fetched += 1;
    const norm = normalizeItem(item);
    if (!norm.ok) {
      out.quarantined.push({ reason: norm.reason, raw: JSON.stringify(item).slice(0, 500), detail: norm.detail });
      continue;
    }
    const cand = toCandidate(norm.candidate, config.today);
    const prior = byDoi.get(cand.doi);
    if (prior) {
      if (prior.contentHash !== cand.contentHash) {
        out.revisions.push(cand.doi);
        const revised = { ...cand, firstSeen: prior.firstSeen };
        out.candidates.push(revised);
        byDoi.set(cand.doi, revised);
      } else {
        out.unchanged.push(cand.doi);
        const refreshed = { ...prior, lastSeen: config.today };
        // Replace (not append) so a DOI repeated within one response stays deduplicated.
        const idx = out.candidates.findIndex((c) => c.doi === prior.doi);
        if (idx >= 0) out.candidates[idx] = refreshed;
        else out.candidates.push(refreshed);
        byDoi.set(prior.doi, refreshed);
      }
    } else {
      out.candidates.push(cand);
      // Register immediately so a repeated DOI later in the same response
      // deduplicates against this run's own output.
      byDoi.set(cand.doi, cand);
    }
  }
  return out;
}
