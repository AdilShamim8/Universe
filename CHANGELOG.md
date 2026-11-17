# Changelog

All notable changes to the Universe Learning Platform. Format: Keep a Changelog; versioning: SemVer. Dates are UTC.

## [0.1.0] — 2026-11-17

Initial engineering preview. **Contains no approved scientific content**; all public sections render honest empty states.

### Added
- Monorepo foundation: npm workspaces, pinned lockfile, TypeScript 5.9 strict, oxlint, Vitest, Playwright e2e.
- `packages/contracts`: 14 versioned JSON Schemas (Draft 2020-12) for module, concept, claim, source, evidence, lesson, dataset, visualization, history event, research question, path, career, review decision, release manifest; generated TS types; Ajv validation helpers.
- `packages/registry`: deterministic discovery of `modules/*/module.yaml` and experiences; unique-ID enforcement; reference integrity; prerequisite DAG validation (semantic cycles allowed); decimal-safe temporal model with four frames; review-decision verification bound to record hashes; fail-closed approved projection.
- `packages/compiler`: approved projection → site data (navigation, coverage map, redirects, level index).
- `packages/ui`: design tokens, base stylesheet, accessible components (skip link, preview banner, status chips, empty states).
- `packages/visualizations`: cosmic timeline engine — interval-aware positioning, log (zero-safe)/linear/schematic scales, keyboard navigation, accessible list view, SVG renderer; tested only with labeled non-science fixtures.
- `apps/web`: Astro 7 static site — Start, Universe History, Academy, Explore, Evidence, Research Frontier, Laboratories, Space Technology, Careers, Library, Community; engineering-preview banner on all pages; fixture timeline demo (noindex, search-excluded); dark/light themes; reduced-motion respected.
- `packages/search`: Pagefind integration; fixture and draft pages excluded from the index.
- `tools/ingestion`: Crossref bibliographic-metadata-only adapter (no abstracts/full text/LLM), SSRF-safe bounded fetcher with conditional requests, retry/backoff, dedup by DOI + content hash, idempotent reruns, schema-drift quarantine; `npm run ingest:dry-run` runs against fixtures with no network.
- `tools/validation`: `npm run validate` CLI over modules, experiences, and registries.
- `tools/release`: release manifest generator (commit, schema versions, dependency versions, test summary, artifact digest).
- CI: lint/typecheck/validate/test/build/e2e with pinned action SHAs and least-privilege tokens; weekly source-scan workflow (manual dispatch included); monthly release workflow.
- Governance: README, AGENTS.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, GOVERNANCE.md, CITATION.cff, CONTENT_LICENSE.md, THIRD_PARTY_NOTICES.md; docs/architecture/SYSTEM_DESIGN.md; ADRs 0001–0006; editorial and operations guides.

### Owner decisions still open
- Public project name (working title only; "Open Cosmos" is an existing company).
- License ratification (Apache-2.0 code / CC BY 4.0 content proposed).
- Hosting choice for any public deployment (none configured).
- Scientific reviewers (none registered; registry is draft-only until then).
