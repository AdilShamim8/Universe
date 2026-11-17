# ADR 0003 — Decimal-safe four-frame temporal model; no JS Date for cosmic time

**Status:** Accepted (2026-11-17)

## Context
Cosmic, geological, and human calendar time have different reference points, units, precisions, and uncertainty semantics. Floating-point dates corrupt large-scale comparisons; conflating frames is scientifically meaningless without an explicit model.

## Decision
All time values are decimal strings in one of four frames (cosmic-age, lookback, geological, calendar) with unit, precision, interval bounds, model_ref, uncertainty notes. Comparisons/conversions happen on scaled BigInt keys (exact), never JS Date. Cross-frame comparison throws. Unknown time stays unknown (never zero). Log-scale rendering uses a zero-safe floor.

## Consequences
13.8 Gyr == 13,800,000,000 yr exactly. Redshift↔time conversion is out of scope until a pinned cosmology model tool exists (Astropy notebook path documented in the design).
