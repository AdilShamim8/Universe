# Third-Party Notices

This project uses open-source software and public services. Original code is Apache-2.0. This file records third-party components and their licenses. **As of v0.1.0 no third-party content, data, or media is redistributed by this repository** — the notices below cover build-time software dependencies and linked services only.

## Build and runtime dependencies

| Component | Version | License | Use |
|---|---|---|---|
| Astro | 7.4.12 | MIT | Static site framework |
| TypeScript | 5.9.3 | Apache-2.0 | Language/toolchain |
| Ajv + ajv-formats | 8.20.0 / 3.0.1 | MIT | JSON Schema validation |
| yaml | 2.9.1 | ISC | YAML parsing |
| Pagefind | 1.6.0 | MIT | Static search index |
| Vitest | 3.2.7 | MIT | Test runner |
| Playwright | 1.65.1 | Apache-2.0 | Browser e2e tests |
| oxlint | 1.94.0 | MIT | Linter |
| tsx | 4.23.15 | MIT | TypeScript execution |
| prettier | 3.10.1 | MIT | Formatter |
| Node.js | 24.x | MIT | Runtime |

Verify versions against `package-lock.json`; this table is regenerated at release time (see `tools/release`).

## Services referenced (metadata or links only — no content imported)

| Service | What we use | Policy reference |
|---|---|---|
| Crossref REST API | Bibliographic metadata for allowlisted fields (DOI, title, container, authors, dates, type, publisher, license URL, references count). **No abstracts, no full text.** | https://www.crossref.org/documentation/retrieve-metadata/rest-api/ |

## Referenced but NOT copied (link-only or inspiration)

- NASA Science (universe overview, cosmic timeline, early universe, image rights pages) — public reference material; no text or media copied. https://www.nasa.gov/nasa-brand-center/images-and-media/
- ESA Planck mission pages — reference links only.
- International Commission on Stratigraphy chart — referenced by version; not redistributed.
- Unified Astronomy Thesaurus — CC BY-SA 3.0; not redistributed in v0.1. Taxonomy mapping is by external identifier reference.
- OpenStax Astronomy 2e — link-only reading recommendation (CC BY-NC-SA 4.0, AI-use restrictions).
- OpenSpace (GitHub) — architecture reference; its repository expressly excludes data; no code copied.
- WorldWide Telescope web engine — MIT code; not copied in v0.1.
- NASA Eyes — inspiration only; proprietary, not open source, nothing copied.

## Trademark note

"Open Cosmos" is an existing space-industry company (https://open-cosmos.com/). This project's working title is unrelated and no affiliation or endorsement is implied. The internal package name is `universe-platform`; the public name is an open owner decision.
