# ADR 0002 — Review decisions bind to content hashes

**Status:** Accepted (2026-11-17)

## Context
A `status: approved` field must never count as proof of human review; agents must not be able to self-approve. Approval must survive workflow transitions but not content edits.

## Decision
A review decision records SHA-256 over the canonical serialization of the reviewed record's content fields, excluding only `status` (workflow metadata). Registry validation fails when an approved/published record lacks a valid, non-invalidated approving decision whose hash matches the current content. Any content change invalidates approval until re-review.

## Consequences
Lifecycle moves (draft→approved) don't silently break reviews; real edits do. Reviewer identities must be registered humans (registries/reviewers) — an empty roster keeps every module draft-only by design.
