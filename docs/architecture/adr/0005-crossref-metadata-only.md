# ADR 0005 — Crossref adapter reads bibliographic metadata only

**Status:** Accepted (2026-11-17)

## Context
Crossref metadata is machine-readable, but abstracts are copyrighted and full text is out of scope. Ingested data must never feed an LLM and never become claims without human review.

## Decision
The adapter permit-lists exactly: DOI, title, author, container-title, issued, publisher, type, URL, ISSN, volume, issue, page. Any other field (notably abstract) quarantines the item. Fetches are allowlisted, SSRF-guarded, size-capped, retried only on transient errors; failures retain the last good store. Items become candidates only.

## Consequences
Safe, bounded, honest ingestion. Reviewers see candidate metadata, never auto-promoted content.
