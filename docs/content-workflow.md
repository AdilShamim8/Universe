# Content workflow — what publishes, and what review it needs

This platform serves two fundamentally different kinds of content. Getting
this distinction right is the whole game: it is what lets us ship a useful
site **today** without ever passing off unreviewed writing as science.

## The two content layers

### 1. Curated layer — publishes without scientific review

**What it is:** directories of *links to* authoritative external resources,
plus *imported numeric facts* from official sources, plus the metadata that
makes them findable (titles, providers, difficulty, license, description).

**Where it lives:** `content/curated/*.json`, wrapped in a provenance
envelope, read at build time by `apps/web/src/lib/curated.ts`.

**Why it needs no scientific review:** we make no scientific claims of our
own. The NASA fact sheet's mass for Jupiter is NASA's number; linking to it
—or parsing it verbatim — is attribution, not assertion. The curation
questions are editorial (is this the right resource for this level?) not
scientific.

**What it must have to ship:**

| Requirement | How it's enforced |
|---|---|
| Every item carries a source URL | Loader throws at build if the envelope is missing provenance |
| Every source URL was live at curation time | `scripts/verify-curated-urls.mjs` re-checks on demand |
| No invented titles, authors, dates, or numbers | Cross-checked against source at curation time (e.g. arXiv `citation_*` metadata) |
| Provenance envelope: method, date, pass rate | `content/curated/*.json` `provenance` block |
| Clear origin labeling in the UI | "Source: …" line under every curated item |

**Current curated datasets:**

- `library.json` — 79 external resources (verified 2026-11-18)
- `academy.json` — 11 pathways / 157 resource links (verified 2026-11-18)
- `timeline.json` — 77 events / 60 source URLs (verified 2026-11-18)
- `research.json` — 46 arXiv-verified papers + datasets/tools (2026-11-18)
- `explore.json` — NSSDC-parsed planet facts, missions, scale (2026-11-18)

### 2. Original layer — requires qualified human review

**What it is:** anything where *we* explain, interpret, or synthesize
science in our own words: lesson prose, concept explainers, claims about
evidence, "how we know" narratives.

**Where it lives:** the registry path (`content/modules/`, `content/experiences/`)
that existed before this rebuild. Nothing about that pipeline changed.

**Why:** an original explanation can be wrong in ways a link cannot be.
The fail-closed validation, draft/in-review/approved lifecycle, reviewer
attribution and the no-LLM-generated-science policy apply to this layer
exactly as before.

**Status:** zero approved original records. The site shows curated content
everywhere and never fakes a review state.

## What this means in practice

- **Never** use "awaiting scientific review" as a reason to show an empty
  page when curated links could fill it. Curated content is the default
  substance of this site.
- **Never** present a curated link's description as our own scientific
  claim. Descriptions describe the *resource*, not the universe.
- **Never** invent a reviewer, a review date, or an approval for either
  layer. The footer states plainly that original science is pending human
  review.
- **Do** re-verify curated URLs when the provenance date grows stale;
  the verifier script prints a pass rate and fails on hard errors.

## Adding or editing curated content

1. Edit the corresponding builder script in `/scripts` or the JSON directly.
2. Run `node scripts/verify-curated-urls.mjs` — all links must pass.
3. Update the `provenance.verification` block (date, counts).
4. Build (`npm run build`) — the loader validates envelopes at build time.
5. Review the rendered page — every item must show its source line.
