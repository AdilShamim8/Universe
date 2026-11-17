# Security Policy

## Supported versions

This is a pre-1.0 engineering preview. Security fixes target the latest `main` only.

## Reporting a vulnerability

**Do not open public issues for security vulnerabilities.** Use GitHub's private vulnerability reporting on this repository, or contact the repository owner directly. Please include reproduction steps and affected paths. We will acknowledge and keep you informed of remediation.

Please keep **rights infringement** and **scientific accuracy** reports out of the security channel — those belong in content issues (see `CONTRIBUTING.md`), unless they are also a security problem.

## Threat model (summary)

- **Untrusted inputs**: remote source metadata, Markdown, YAML records, dependency updates, and fork PRs are all treated as untrusted.
- **Content boundaries**: only sanitized, schema-valid, review-approved records reach the static build. Executable MDX, raw HTML, unsafe URLs, arbitrary iframes, and dangerous SVG are rejected at validation, not at render time.
- **Ingestion**: the Crossref adapter is allowlist-only, blocks private/internal network destinations (SSRF), revalidates redirects, caps response sizes, checks content types, and never receives credentials.
- **CI**: fork PRs run without secrets and without deployment privileges. Third-party Actions are pinned to full commit SHAs. Least-privilege `permissions:` blocks on every workflow.
- **Secrets**: no secrets in the browser bundle, the repo, or logs. `.env` files are gitignored. If a secret is accidentally committed, rotate it immediately — history rewriting is a maintainer decision.
- **Static output**: the public artifact is a static site; there is no database, login, or server-side execution in v0.1.

## What this project does NOT claim

No security certification, no audit, no guarantee. WCAG 2.2 AA and hardening are design targets, not attestations.
