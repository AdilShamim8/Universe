# ADR 0004 — Fail-closed approved projection

**Status:** Accepted (2026-11-17)

## Context
Drafts, fixtures, quarantined candidates, restricted media, and unreviewed records must never leak into public output or the search index — under any error condition.

## Decision
Site data and Pagefind see only the projection built from approved/published records in owner-registered modules, excluding fixture-namespace IDs, withdrawn/deprecated records, and restricted media. Any registry validation error aborts projection and the build. Pagefind additionally gets data-pagefind-ignore on demo blocks and a post-index verification gate.

## Consequences
A broken registry stops the site rather than publishing partial content. The empty state is a feature: zero approved records → honest empty sections.
