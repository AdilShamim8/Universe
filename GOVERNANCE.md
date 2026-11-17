# Governance

## Roles

- **Owner (Adil Shamim)** — product direction, final decisions on name/licensing/hosting/publication, appoints maintainers. Initially also engineering maintainer.
- **Engineering maintainers** — merge code PRs, own CI/release infrastructure, uphold AGENTS.md.
- **Domain reviewers** — qualified humans (astronomers, educators, domain scientists) who review records in their module. Registered in `registries/reviewers/` **only with their consent**, with role, scope, and review history.
- **Content maintainers** — run the editorial pipeline: candidate triage, rights checks, scheduling reviews.
- **Contributors** — everyone else; see `CONTRIBUTING.md`.

## Decision rights

| Decision | Who |
|---|---|
| Public project name, branding | Owner (explicitly; never delegated to an agent) |
| License changes | Owner |
| Public deployment / hosting | Owner |
| Repository settings, visibility, branch protection | Owner |
| Schema changes (breaking) | Maintainers via ADR + migration script |
| Scientific record approval | Registered domain reviewers (humans only) |
| Module activation (owners populated + review capacity) | Owner + maintainers |
| Code merges | Maintainers |

## Scientific integrity rules

1. An agent may never self-approve scientific content, and no `status` field alone constitutes approval — a maintainer-recorded review decision bound to the record's content hash is required (enforced in `packages/registry`).
2. Review is invalidated when the reviewed record, its sources, its rights basis, or dependent claims change.
3. Publication is fail-closed: on any doubt about rights, review validity, or reference integrity, the record stays out of public output.
4. Reviewer identity fraud is grounds for immediate removal of the records involved.

## Process

- Architecture changes: ADR in `docs/adr/` (context, decision, alternatives, consequences).
- Breaking schema changes: ADR + migration script + compatibility tests.
- Quarterly: coverage review, source health, backlog reprioritization. Annually: taxonomy, governance, roadmap.
- The owner's AI-engineering capacity does not substitute for scientific domain expertise; recruiting domain reviewers is a prerequisite for any public scientific release.

## Succession / sustainability

The owner maintains a backup strategy (Git + release artifacts). If the project goes inactive, the last approved release stays available and the coverage map marks stagnation honestly.
