/**
 * Canonical serialization and content hashing for review binding.
 *
 * A review decision is bound to the SHA-256 of the reviewed record's
 * *content*. The lifecycle `status` field is excluded from the hash on
 * purpose: moving a record from draft → in-review → approved is a workflow
 * transition, not a content change, and must not silently invalidate the
 * review that approved the content. Every other field (including `revision`)
 * participates: any content or metadata change invalidates the decision.
 * See docs/architecture/adr/0002-review-hash-definition.md.
 */
import { createHash } from "node:crypto";

/** Deterministic JSON: object keys sorted lexicographically, no whitespace. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Fields excluded from the review-bound content hash (workflow metadata only). */
const HASH_EXCLUDED_FIELDS: ReadonlySet<string> = new Set(["status"]);

/** The exact content a review decision is bound to. */
export function contentForHash(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (!HASH_EXCLUDED_FIELDS.has(key)) out[key] = record[key];
  }
  return out;
}

/** SHA-256 hex digest over the canonical content serialization of a record. */
export function computeRecordHash(record: Record<string, unknown>): string {
  return createHash("sha256")
    .update(stableStringify(contentForHash(record)))
    .digest("hex");
}
