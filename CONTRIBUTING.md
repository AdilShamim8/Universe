# Contributing to the Universe Learning Platform

Thank you for helping build an open scientific learning infrastructure. This project has two very different kinds of contribution — **engineering** and **scientific content** — with different rules.

## Engineering contributions

1. Fork/branch: `feat/<slug>`, `fix/<slug>`, `chore/<slug>` from `main`.
2. Implement, keeping the boundaries: shared packages (`packages/*`) never import individual domain modules; `apps/web` only consumes the compiled approved projection; fixtures stay in `tests/fixtures/`.
3. Run the gates and make them pass:
   ```bash
   npm run lint && npm run typecheck && npm run validate && npm test && npm run build
   ```
   Browser-touching changes also need `npm run test:e2e`.
4. Open a PR describing what changed and which checks you ran (actually run them — see AGENTS.md §1). A human maintainer reviews and owns the final diff.

Code style: TypeScript strict; Prettier defaults; Conventional Commits. Keep PRs small and reviewable.

## Curated content contributions (links & imported facts)

The fastest safe way to improve the site. Curated datasets
(`content/curated/*.json`) hold verified external links, imported
numeric facts, and their metadata — see [docs/content-workflow.md](docs/content-workflow.md)
for why this publishes without scientific review.

1. Pick a dataset: `library` (resources), `academy` (pathways),
   `timeline` (events), `research` (papers/datasets/tools), `explore` (planets/missions/scale).
2. Add or edit entries. Every entry needs a real source URL — never
   invent a title, author, date, or number; copy them from the source.
   For arXiv papers, take titles/authors from the abstract page's
   citation metadata, not from memory.
3. Re-verify: `node scripts/verify-curated-urls.mjs` — all links must
   pass (transient network errors are reported as unverifiable, not
   failed; bot-blocked 403s need a manual browser check).
4. Update the dataset's `provenance.verification` block: date, counts,
   pass rate.
5. Gates: `npm test` (the curated contract tests enforce the schema)
   and `npm run build` (the loader rejects missing provenance).
6. PR with the verification output pasted in.

Good contributions: more verified resources in an existing category;
a new category for an underserved topic; replacing a dead link with
the live canonical one; fixing a metadata typo against the source.
Bad contributions: paraphrasing science into your own words inside a
curated file (that is the reviewed layer), bumping a verification
date without re-running the verifier, or adding a link you have not
opened.

## Scientific content contributions

Scientific records are the heart of the project and the most dangerous to get wrong. The full process is in `docs/editorial/REVIEW_PROCESS.md`; the essentials:

1. **Propose a module or record** via the content issue template. Scope, sources, rights, and a qualified reviewer must be identified first.
2. **Draft records** in the owning module with stable IDs; every claim carries source ID, locator, retrieval date, rights, units, uncertainty, and evidence status. Start as `draft`.
3. **Never paste text** from sources whose license does not permit redistribution. Link-only or metadata-only records exist for this. Do not feed restricted sources into AI tools.
4. **Human review**: a qualified subject reviewer + editorial reviewer examine meaning, sources, uncertainty, pedagogy, and rights. The review decision is recorded against the exact record hash by a maintainer.
5. **Merge** after both reviews pass; the approved projection then (and only then) includes the record in public output.

### Hard prohibitions for all contributors

- No LLM-generated scientific text, claims, citations, gaps, translations, or scientific illustrations — including "placeholder" science.
- No scraping that bypasses terms, robots, paywalls, or rate limits.
- No committing credentials, raw candidate stores, or unredactable personal data.
- No self-approval of scientific records; no fabricated reviewer identities.

## Reporting problems

- Security vulnerabilities: `SECURITY.md` (private disclosure).
- Scientific errors / rights problems: content issue template (public).
- Bugs: bug issue template with reproduction steps.

## Code of conduct

See `CODE_OF_CONDUCT.md` — contributor covenant; enforcement by the maintainers.
