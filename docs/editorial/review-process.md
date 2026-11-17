# Editorial and review process

## Who may approve
Only registered, consenting human reviewers (registries/reviewers/registry.yaml). Each approval is a review-decision record bound to the exact content hash (ADR 0002). Agents never write review decisions; agents never self-approve.

## Lifecycle
draft → in-review → approved → published; withdrawn/deprecated are terminal-with-history. Moving draft→in-review needs an editor; in-review→approved needs the module's review policy satisfied (science-and-education: one subject + one educational reviewer; science-only: subject reviewer).

## Invalidation
Any content change to a reviewed record invalidates its approval (hash mismatch). Changes to sources, rights, or dependent claims invalidate downstream approvals as recorded by maintainers via the `invalidated` field.

## Contradictions and uncertainty
Claims carry evidence_status (established / model-dependent / contested / hypothesis / historical-superseded) separate from lifecycle. Competing evidence links via relation: supports|challenges|context. Uncertainty renders as intervals/notes, never point values.

## Currently
The reviewer roster is empty by design — every module is draft-only and the site shows honest empty states.
