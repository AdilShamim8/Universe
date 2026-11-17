# Operations runbook

## Local commands
- `npm ci` — clean install
- `npm run dev` — Astro dev server
- `npm run validate` — registry validation + projection + site-data summary
- `npm test` — unit/integration (must build first for e2e)
- `npm run build` — static build + Pagefind index + exclusion verification
- `npm run test:e2e` — Playwright over the built artifact (server on :4173)
- `npm run ingest:dry-run` — fixture ingestion, zero network
- `npm run release:manifest` — immutable manifest into release/manifests/

## Cadences (GitHub Actions)
- CI on every push/PR: lint→typecheck→validate→test→dry-run ingest→build→e2e.
- Weekly source scan: dry-run only until a maintainer enables live mode in the allowlist; schedules may be delayed/disabled by GitHub — check run history for actual freshness.
- Release: manual dispatch; manifest committed by release-bot after all gates pass.

## Failure handling
- Registry validation error: build refuses (fail-closed). Fix records; never bypass.
- Fetch failure: candidate store retained; source marked stale in the next report; never delete on transient errors.
- Withdrawal: mark record withdrawn; regenerate; the release manifest lists withdrawn IDs so rollback cannot silently restore them.

## Rollback
Rebuild the previous release manifest's commit; the withdrawn-records list is checked against the projection before that artifact may be promoted (release tool refuses otherwise).
