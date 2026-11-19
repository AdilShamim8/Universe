# Universe 101

**Status: v0.2 — curated product.** The site now serves real, useful content everywhere: a source-backed timeline of 77 events across 12 eras, 11 learning pathways with 157 verified resources, a research directory of 8 fields with 46 arXiv-verified papers, a library of 79 verified resources, and exploration tools built on live-parsed NASA fact-sheet data. Original scientific explanations (our own prose about the science) are still pending qualified human review — see [docs/content-workflow.md](docs/content-workflow.md) for the two-layer policy that lets curated content ship without ever faking a review state.

An open learning platform that takes people from their first question about the universe to research literacy: observational evidence, mathematical models, real datasets, and open research questions. *Universe* is the working title; the internal neutral package name is `universe-platform` (an existing space company operates as "Open Cosmos", so no branding decision is final until the owner clears a distinct public name).

## What works today

- **Versioned content contracts** (`packages/contracts`) — 14 portable JSON Schemas (module, concept, claim, source, evidence, lesson, dataset, visualization, history event, research question, path, career, review decision, release manifest) with JSON Schema Draft 2020-12, stable opaque record IDs, and TS types generated from the schemas.
- **Deterministic registry** (`packages/registry`) — discovers `modules/*/module.yaml` and `experiences/*`, enforces unique IDs, reference integrity, prerequisite DAG (semantic cycles allowed), decimal-safe temporal model, and a **fail-closed approved projection**: drafts, quarantined data, fixtures, and revoked records can never enter public output or the search index.
- **Static-first website** (`apps/web`) — Astro 7, semantic HTML, cinematic cosmic design (Space Grotesk / Inter / IBM Plex Mono, self-hosted), starfield backdrop, dark/light themes, reduced-motion support, no login, no WebGL required. 37 public pages: homepage, 12-era timeline, 11 academy pathways, 8 research fields, library, explore suite with 10 planet detail pages, search, 404.
- **Curated content layer** (`content/curated/`) — five provenance-enveloped datasets of verified links and imported facts (library, academy, timeline, research, explore), each individually URL-verified at curation time and re-checkable with `node scripts/verify-curated-urls.mjs`. 27 contract tests enforce the publishability invariants.
- **Cosmic timeline engine** (`packages/visualizations`) — decimal-safe time values (never `Date`), four temporal frames kept distinct, log/linear/schematic scale modes with zero handled separately, interval uncertainty, keyboard navigation, accessible event list, evidence drawer.
- **Bounded ingestion** (`tools/ingestion`) — Crossref bibliographic-metadata-only adapter (allowlisted fields, no abstracts, no full text, no LLM anywhere), SSRF-safe fetcher, retries with backoff, dedup by DOI + content hash, idempotent reruns, schema-drift quarantine, and a dry-run mode with fixture tests.
- **CI/release pipeline** — lint, typecheck, validate, unit/integration tests, build, browser e2e (320 px mobile included), source-scan workflow (weekly + manual), monthly release workflow with immutable manifest.
- **Governance docs** — editorial process, rights policy, security policy, contribution guide, ADRs, this README.

## Quick start

Requirements: Node.js 24 (see `.nvmrc`), npm 11.

```bash
npm ci        # clean install from the lockfile
npm run validate          # validate all modules and registry semantics
npm test                  # unit + integration tests (includes deliberately invalid records)
npm run lint              # oxlint
npm run typecheck         # TypeScript strict, noEmit
npm run build             # deterministic static build + search index
npm run dev               # local dev server (no secrets, no live sources)
npm run test:e2e          # Playwright browser tests (downloads Chromium on first run)
npm run ingest:dry-run    # bounded fixture-based adapter run, no writes, no network
```

## Repository layout

```text
apps/web/                  Astro static site (the only public surface)
packages/contracts/        Versioned JSON Schema contracts + generated types
packages/registry/         Deterministic module/record discovery + validation
packages/compiler/         Compiles approved projection -> site data (nav, coverage, redirects)
packages/ui/               Design tokens + accessible shared components/styles
packages/visualizations/   Timeline engine and deterministic renderers
packages/search/           Pagefind wrapper with fixture exclusion
tools/ingestion/           Crossref metadata-only adapter (dry-run, bounded)
tools/validation/          `npm run validate` CLI
tools/release/             Release manifest generator
modules/                   Scientific domain modules (currently: foundations, cosmology skeletons)
experiences/               Cross-domain experiences (cosmic-history)
registries/                sources, taxonomy, reviewers, redirects
tests/                     contracts, integration, fixtures, browser
docs/                      architecture, ADRs, editorial, operations, release notes
release/manifests/         Immutable release manifests
```

The twelve eventual ownership domains (foundations, cosmology, stars, compact objects, planetary science, exoplanets/astrobiology, earth/life, observational astronomy, space engineering, human spaceflight, history/society, galaxies) are listed as *planned* in the coverage map; only implemented modules exist on disk. No fake lessons, no empty-file padding.

## Non-negotiable principles

1. **No LLM-generated scientific content.** Software, UI copy and fixtures may be generated; scientific prose, claims, citations, research gaps, translations and scientific illustrations may not. Human editors supply or approve substantive learning material.
2. **Fail-closed publication.** Only records with a valid maintainer-controlled review decision tied to the exact record hash are "approved". A `status: approved` YAML field alone is never proof of review. Drafts, fixtures and quarantined candidates are excluded from public output and search.
3. **Rights before import.** Publicly readable ≠ redistributable. Unknown rights means link-only or no import. OpenStax Astronomy 2e is link-only (CC BY-NC-SA + AI-use restrictions). Crossref metadata is used under its documented policy, abstracts excluded.
4. **Evidence over effects.** Every claim keeps source ID, locator, retrieval date, rights, units, uncertainty, evidence status (established / model-dependent / contested / hypothesis / historical-superseded) and review decision.
5. **No invented precision.** Cosmic ages are intervals with model references, never exact birthdays; the hot Big Bang is not depicted as a point explosion into surrounding space.
6. **Honest reporting.** No claims of complete coverage, certified accessibility, security guarantees, or successful deployment without evidence. Tests listed in CI are the tests that exist.

## License

- Original code: **Apache-2.0** (see `LICENSE`), proposed by the engineering agent, pending owner ratification.
- Original human-authored content: **CC BY 4.0** proposed (see `CONTENT_LICENSE.md`), pending owner ratification.
- Third-party notices: `THIRD_PARTY_NOTICES.md`.

The owner has not yet ratified a license choice; these are engineering defaults proposed for an original-work repository with no prior license. Say the word and they change before any wider publication.

## Contributing

See `CONTRIBUTING.md` (code and content workflows), `docs/editorial/REVIEW_PROCESS.md` (how scientific review works), `SECURITY.md`, and `GOVERNANCE.md`. AI assistance is welcome for engineering, but **a human must review and own every final content diff** — no agent may self-approve scientific records or attest to review on anyone's behalf.
