# ADR 0001 — Static-first modular monolith

**Status:** Accepted (2026-11-17)

## Context
The platform must serve reviewed scientific content cheaply, accessibly, and without runtime dependencies on external APIs, while allowing many independently maintained domain modules.

## Decision
One Astro static site in a monorepo (packages + apps/web). Content lives as versioned YAML/JSON records in Git; a deterministic compiler turns the approved projection into site data. No SSR, no database, no client-side rendering for core reading. React islands may be added later only where genuinely interactive.

## Alternatives considered
- Next.js full-stack app: runtime cost, hosting complexity, JS requirement.
- Per-domain microsites: duplicate infrastructure, drift, harder global reference integrity.
- Headless CMS: content escapes Git versioning and review.

## Consequences
Everything readable is build-time HTML: fast, cacheable, offline-friendly. Interactivity arrives as islands with static fallbacks. Content changes require a rebuild — acceptable at the current cadence.
