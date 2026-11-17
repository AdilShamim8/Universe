/**
 * Decimal-safe temporal model — four distinct frames, never JS Date.
 *
 * The registry stores all cosmic/geological time as decimal strings. This
 * module implements the comparison and conversion rules from the system
 * design §7 (Temporal model):
 *
 * 1. cosmic-age: time elapsed since the modeled hot early universe.
 * 2. lookback: modeled present age minus age at an observation's redshift.
 * 3. geological: age relative to a stated reference (e.g. Ma before present).
 * 4. calendar: human calendar dates (discovery, launch, publication).
 *
 * Cross-frame comparison is rejected: comparing cosmic-age with lookback or
 * converting redshift→time requires an explicit cosmological model, which is
 * out of scope for the registry (a deterministic science tool may implement
 * it later with a pinned model). Frames are only comparable within
 * themselves; `geological` never mixes with `cosmic-age` because they count
 * from different reference points in opposite directions.
 *
 * Units are scaled by decimal-safe factors (powers of ten), never binary
 * floats: the largest cosmic-age in Gyr (13.8) must survive comparisons
 * exactly, and precision semantics ("1.5 Ma" vs "1500000 yr") must be
 * preserved losslessly. All arithmetic is done on scaled integer strings.
 */
import type { TemporalValue, TemporalFrame, TimePrecision } from "@universe/contracts";

export type { TemporalValue, TemporalFrame, TimePrecision };

/** Scale from each unit to the base unit of its frame family. */
const UNIT_SCALES: Record<string, bigint> = {
  s: 1n,
  yr: 1n,
  kyr: 1_000n,
  Myr: 1_000_000n,
  Gyr: 1_000_000_000n,
  ka: 1_000n,
  Ma: 1_000_000n,
};

/** Units valid per frame (geological uses ka/Ma; cosmic uses kyr/Myr/Gyr). */
const FRAME_UNITS: Record<TemporalFrame, readonly string[]> = {
  "cosmic-age": ["s", "yr", "kyr", "Myr", "Gyr"],
  lookback: ["s", "yr", "kyr", "Myr", "Gyr"],
  geological: ["yr", "ka", "Ma"],
  calendar: ["yr"],
};

/** Parse "-?\\d+(\\.\\d+)?" into [sign, integer digits, fraction digits] scaled to base units with fixed fractional digits. */
function parseDecimal(s: string): { neg: boolean; int: bigint; frac: string } {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`invalid decimal string: ${JSON.stringify(s)}`);
  const neg = m[1] === "-";
  const int = BigInt(m[2]!);
  const frac = m[3] ?? "";
  return { neg, int, frac };
}

/** Convert a decimal string in `unit` to a comparable integer-scaled key. */
function toScaledKey(value: string, unit: string): bigint {
  const { neg, int, frac } = parseDecimal(value);
  // Normalize fraction to 9 decimal places (max unit is Gyr=1e9; keep sub-unit precision).
  const FRAC_DIGITS = 9;
  const padded = (frac + "0".repeat(FRAC_DIGITS)).slice(0, FRAC_DIGITS);
  const scaled = int * 10n ** BigInt(FRAC_DIGITS) + BigInt(padded || "0");
  const unitScale = UNIT_SCALES[unit] ?? 1n;
  const total = scaled * unitScale;
  return neg ? -total : total;
}

/** Validate that a unit belongs to the frame. */
export function unitAllowedForFrame(frame: TemporalFrame, unit: string | undefined): boolean {
  if (unit === undefined) return true; // unit is optional for calendar/unknown
  return FRAME_UNITS[frame].includes(unit);
}

/** Error class carrying a machine-readable code. */
export class TemporalError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "TemporalError";
  }
}

/** A parsed, validated temporal value. Callers never construct this directly. */
export interface ParsedTime {
  readonly frame: TemporalFrame;
  readonly raw: TemporalValue;
  /** Scaled comparable key (null when unknown). */
  readonly key: bigint | null;
  /** Lower bound key (null when absent/unknown). */
  readonly lower: bigint | null;
  /** Upper bound key (null when absent/unknown). */
  readonly upper: bigint | null;
  /** Precision actually resolved for ordering: refined from raw.precision. */
  readonly precision: TimePrecision;
}

/**
 * Parse and validate a temporal value. Throws TemporalError on any
 * inconsistency. Unknown time (all null) is valid and stays unknown — it is
 * never coerced to zero or any epoch.
 */
export function parseTime(t: TemporalValue): ParsedTime {
  const problems: string[] = [];
  if (t.frame === "calendar" && (t.value || t.lower_bound || t.upper_bound)) {
    // Calendar events carry their dates in dedicated record fields (e.g.
    // career.mission_milestones[].date, source.retrieved_at); the temporal
    // value marks the frame. A decimal year is allowed for calendar-year
    // precision (e.g. "1969").
    if (t.unit && t.unit !== "yr") {
      problems.push("calendar frame allows only unit 'yr' (calendar-year precision)");
    }
  }
  if (t.unit && !unitAllowedForFrame(t.frame, t.unit)) {
    problems.push(`unit '${t.unit}' is not valid for frame '${t.frame}'`);
  }
  if (t.precision === "unknown" && (t.value !== null || t.lower_bound !== null || t.upper_bound !== null)) {
    problems.push("precision 'unknown' requires null value and null bounds");
  }
  if (t.value === null && t.lower_bound === null && t.upper_bound === null && t.precision !== "unknown") {
    problems.push("all-null time requires precision 'unknown'");
  }
  const hasValue = t.value !== null && t.value !== undefined;
  const hasInterval = (t.lower_bound !== null && t.lower_bound !== undefined) || (t.upper_bound !== null && t.upper_bound !== undefined);
  if (hasValue && hasInterval) {
    problems.push("a nominal value and interval bounds are mutually exclusive");
  }
  if (hasInterval && t.precision !== "interval") {
    problems.push("interval bounds require precision 'interval'");
  }
  if (
    (t.lower_bound !== null && t.upper_bound === null) ||
    (t.lower_bound === null && t.upper_bound !== null)
  ) {
    problems.push("interval bounds must be provided as a pair");
  }
  const unit = t.unit ?? "yr";
  if (hasInterval && t.lower_bound !== null && t.upper_bound !== null) {
    if (toScaledKey(t.lower_bound, unit) > toScaledKey(t.upper_bound, unit)) {
      problems.push("lower_bound must be <= upper_bound");
    }
  }
  if (problems.length > 0) {
    throw new TemporalError("invalid-temporal-value", `invalid time: ${problems.join("; ")}`);
  }

  const key = hasValue ? toScaledKey(t.value!, unit) : null;
  const lower = t.lower_bound !== null && t.lower_bound !== undefined ? toScaledKey(t.lower_bound, unit) : null;
  const upper = t.upper_bound !== null && t.upper_bound !== undefined ? toScaledKey(t.upper_bound, unit) : null;
  const precision: TimePrecision = t.precision;
  return { frame: t.frame, raw: t, key, lower, upper, precision };
}

/** True when the time is fully unknown (no value, no bounds). */
export function isUnknown(t: TemporalValue): boolean {
  return (
    t.value === null &&
    t.lower_bound === null &&
    t.upper_bound === null
  );
}

/**
 * Compare two parsed times within the SAME frame. Cross-frame comparison
 * throws — mixing frames without an explicit cosmological model is
 * forbidden (design §7). Both unknown → equal. Unknown vs known →
 * "unordered" (null) so callers must handle it explicitly.
 */
export function compareTimes(a: ParsedTime, b: ParsedTime): -1 | 0 | 1 | null {
  if (a.frame !== b.frame) {
    throw new TemporalError(
      "frame-mismatch",
      `cannot compare temporal frames '${a.frame}' and '${b.frame}' without an explicit model`,
    );
  }
  const aU = a.key === null && a.lower === null && a.upper === null;
  const bU = b.key === null && b.lower === null && b.upper === null;
  if (aU && bU) return 0;
  if (aU || bU) return null;
  const aKey = a.key ?? a.lower!; // interval: compare by lower bound first
  const bKey = b.key ?? b.lower!;
  if (aKey < bKey) return -1;
  if (aKey > bKey) return 1;
  const aHi = a.key ?? a.upper!;
  const bHi = b.key ?? b.upper!;
  if (aHi < bHi) return -1;
  if (aHi > bHi) return 1;
  return 0;
}

/** Sort key for deterministic ordering within a frame (unknown sorts last). */
export function timeSortKey(t: ParsedTime): { unknown: boolean; key: bigint } {
  const unknown = t.key === null && t.lower === null && t.upper === null;
  return { unknown, key: t.key ?? t.lower ?? t.upper ?? 0n };
}

/**
 * Convert a time to a target unit within the same frame family. Returns a
 * new TemporalValue with the same semantics, rescaled. Throws on frame or
 * unit mismatch. Calendar values are never converted (they are not quantities).
 *
 * Exact decimal rescaling: the value is represented as unsigned digits plus a
 * decimal-point position, and the point is shifted by the difference of the
 * units' power-of-ten exponents. No binary floats anywhere.
 */
export function convertUnit(t: TemporalValue, toUnit: string): TemporalValue {
  if (t.frame === "calendar") {
    throw new TemporalError("calendar-not-convertible", "calendar dates are not convertible quantities");
  }
  if (!unitAllowedForFrame(t.frame, toUnit)) {
    throw new TemporalError("unit-not-allowed", `unit '${toUnit}' is not valid for frame '${t.frame}'`);
  }
  const fromUnit = t.unit ?? "yr";
  if (fromUnit === toUnit) return { ...t };

  const exponentOf = (u: string): number => Number((UNIT_SCALES[u] ?? 1n).toString(10).length) - 1;
  const shift = BigInt(exponentOf(fromUnit) - exponentOf(toUnit)); // >0: value grows in target unit

  const rescale = (s: string | null): string | null => {
    if (s === null) return null;
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
    if (!m) throw new TemporalError("invalid-decimal", `invalid decimal string: ${JSON.stringify(s)}`);
    const neg = m[1] === "-";
    const int = m[2]!;
    const frac = m[3] ?? "";
    // Value = digits / 10^pointPlaces; unit change moves the point by `shift`.
    const pointPlaces = BigInt(frac.length) - shift;
    const digits = (int + frac).replace(/^0+(?=\d)/, "");
    let out: string;
    if (pointPlaces <= 0n) {
      out = digits + "0".repeat(Number(-pointPlaces));
    } else if (BigInt(digits.length) > pointPlaces) {
      const cut = Number(BigInt(digits.length) - pointPlaces);
      const frac2 = digits.slice(cut).replace(/0+$/, "");
      out = frac2 === "" ? digits.slice(0, cut) : `${digits.slice(0, cut)}.${frac2}`;
    } else {
      const frac2 = "0".repeat(Number(pointPlaces) - digits.length) + digits;
      out = `0.${frac2}`;
    }
    if (out === "" || out === "0") return "0";
    return neg && out !== "0" ? `-${out}` : out;
  };

  return {
    ...t,
    unit: toUnit as NonNullable<TemporalValue["unit"]>,
    value: rescale(t.value),
    lower_bound: rescale(t.lower_bound),
    upper_bound: rescale(t.upper_bound),
  };
}

/** Human-safe rendering of a temporal value for UI copy (English). */
export function formatTime(t: TemporalValue): string {
  const unit = t.unit ? ` ${t.unit}` : "";
  if (isUnknown(t)) return "unknown";
  if (t.value !== null && t.value !== undefined) return `${t.value}${unit}`;
  const lo = t.lower_bound ?? "?";
  const hi = t.upper_bound ?? "?";
  return `${lo}–${hi}${unit}`;
}
