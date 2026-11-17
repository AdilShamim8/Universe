# AGENTS.md — instructions for coding agents working in this repository

These rules govern every automated agent (AI coding assistants, CI bots, ingestion automation) operating here. They override convenience. Where project docs conflict, the stricter security, rights, accuracy, and publication rule wins. Human maintainers may grant exceptions in writing; agents may not grant exceptions to themselves.

## 1. Role boundaries

- Agents are **engineering agents**. Permitted: software, technical documentation, non-scientific UI copy, test fixtures, deterministic format conversions, build/CI/tooling.
- Prohibited: generating scientific prose, claims, citations, observations, research gaps, translations, or scientific illustrations; inventing data, identities, approvals, dates, or sources; impersonating reviewers.
- **A human must review and own every final content diff.** Never attest to human review on anyone's behalf. An agent never self-approves a scientific record, and `status: approved` in YAML is never proof of review — only a maintainer-protected review decision tied to the exact record hash counts (see `packages/contracts/schema/review-decision.schema.json`).
- Never claim runtime reproduction, measurements, or test results you did not actually perform. Report what ran, what failed, what was skipped.

## 2. Evidence and provenance

- Distinguish observations, derivations, inferences, and unknowns in every report and commit message.
- Every scientific value eventually published must carry: source ID, locator (section/figure/table/DOI/row), retrieval date, version, rights, units, uncertainty, evidence status, and review decision bound to the exact record revision.
- Unknown stays unknown: never substitute zero, a fabricated date, or a plausible-looking value. Unknown event time renders as "unknown", never as an epoch.
- Do not use JavaScript `Date` for cosmic time. Use the decimal-safe temporal model in `packages/registry` (frames: cosmic-age, lookback, geological, calendar).

## 3. Repository discipline

- Work on short-lived feature branches; small, meaningful, conventional commits. No empty commits, no commit-count quotas, no force-push, no history rewrites, no branch deletion.
- Never commit: credentials, tokens, `.env` files, raw candidate stores, large datasets, binaries, `node_modules/`, build output. If a secret lands in history, stop and tell the maintainer.
- Preserve the worktree contract: `apps/` is the only public surface; everything under `modules/`, `experiences/`, `registries/` is source material filtered by the approved projection. Fixtures live only under `tests/fixtures/` and must be clearly labeled non-science (`fixture.example` IDs).
- Fail-closed by default: when validation, rights, or review status is uncertain, block publication rather than guess.
- Fix bugs at the producing boundary; search sibling adapters for the same failure mode before finishing.

## 4. Rights and ingestion

- Publicly readable is not redistributable. Unknown rights = link-only or no import. Never bypass paywalls, authentication, robots policy, or rate limits.
- The Crossref adapter reads allowlisted bibliographic metadata only: no abstracts, no full text, no feeding fetched data into any model.
- Incoming metadata creates **review candidates**, never automatic claims. A transient fetch error or empty response is never a deletion.
- Fetcher safety (see `tools/ingestion/src/fetcher.ts`): allowlist-only destinations, no private/internal addresses, redirect revalidation, size caps, content-type checks, timeouts, bounded retries with backoff.

## 5. Verification workflow

Before declaring work done, run and actually observe: `npm run lint`, `npm run typecheck`, `npm run validate`, `npm test`, `npm run build`, and (for site changes) `npm run test:e2e`. Report each with pass/fail/skipped. If the environment blocks a check, say so — do not imply it passed.

- Do not merge with failing gates. Do not weaken a test to make it pass; fix the producing behavior.
- CI results do not establish human review or merge permission for scientific content.

## 6. Scope and authorization

- Do not: change repository visibility/settings, rename the repository, register domains, purchase anything, deploy publicly, add public secrets, or modify branch protection — without explicit owner instruction.
- Do not deploy to a public production site until name, license, hosting, and publication controls are owner-approved. Local preview and PR previews are fine.
- Ask (in the PR/issue, once) only when an essential owner decision, credential, or permission is genuinely missing; otherwise proceed with safe infrastructure and draft-only states.

## 7. Commit style

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `content:` for record changes). Subject describes the verified change. Body reports verification actually performed, e.g. "validate: pass; test: 214 passed, 3 skipped (network)". Never write "all tests pass" without having run them.
