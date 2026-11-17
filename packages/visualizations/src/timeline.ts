/**
 * Cosmic timeline engine — deterministic positioning and scale math.
 *
 * Design constraints (SYSTEM_DESIGN §7):
 * - Unknown time stays unknown: never coerced to zero or any epoch.
 * - Intervals render as intervals (bars), not fake points.
 * - Explicit scale modes: logarithmic (zero-safe), linear, schematic.
 *   Log mode uses a floor offset so zero/small values don't collapse to -∞.
 * - Cross-frame times never mix on one axis (frames checked per axis).
 * - No JavaScript Date anywhere: cosmic-time is a decimal string model.
 * - Everything is pure math → fully unit-testable without a browser.
 */
import type { TemporalValue, TemporalFrame } from "@universe/contracts";
import { parseTime, formatTime, type ParsedTime } from "@universe/registry";

export type ScaleMode = "logarithmic" | "linear" | "schematic";

/** A timeline event input (already registry-loaded or fixture). */
export interface TimelineEvent {
  id: string;
  title: string;
  track: string;
  time: TemporalValue;
  futureScenario?: boolean;
}

export interface PositionedEvent {
  id: string;
  title: string;
  track: string;
  /** Fractional position [0,1] along the axis; null when unknown. */
  pos: number | null;
  /** Interval span [0,1] when the time is an interval; null otherwise. */
  span: [number, number] | null;
  /** Rendered time label ("unknown" when unknown). */
  label: string;
  futureScenario: boolean;
  /** True when the event could not be placed (unknown time). */
  unplaced: boolean;
}

export interface TimelineLayout {
  mode: ScaleMode;
  frame: TemporalFrame;
  unit: string;
  /** Axis endpoints in display units (decimal strings). */
  axisMin: string;
  axisMax: string;
  events: PositionedEvent[];
  /** Events with unknown time, kept for the accessible list. */
  unknownEvents: PositionedEvent[];
}

/** Small offset added before taking log10 so zero/small values stay finite. */
const LOG_FLOOR = 1e-12;

function toNumber(s: string): number {
  // Decimal strings → number ONLY for pixel positioning (display), never for
  // storage or comparison semantics. Precision statements live in records.
  return Number(s);
}

/**
 * Compute axis bounds from events. Log mode spans [min*0.5, max*1.5] with a
 * floor; linear pads by 5%. Schematic uses fixed [0,1] band positions
 * derived from rank order, not physical values.
 */
export function layoutTimeline(events: TimelineEvent[], mode: ScaleMode): TimelineLayout {
  if (events.length === 0) {
    return { mode, frame: "cosmic-age", unit: "Gyr", axisMin: "0", axisMax: "1", events: [], unknownEvents: [] };
  }
  // All events must share one frame (mixed-frame axes are forbidden).
  const frames = new Set(events.map((e) => e.time.frame));
  if (frames.size > 1) {
    throw new Error(
      `timeline axis cannot mix temporal frames: ${[...frames].join(", ")} (split by frame or convert with an explicit model)`,
    );
  }
  const frame = events[0]!.time.frame;

  const parsed = events.map((e) => ({ e, p: safeParse(e.time) }));
  const known = parsed.filter((x) => x.p !== null && !allUnknown(x.e.time)) as { e: TimelineEvent; p: ParsedTime }[];
  const unknown = parsed.filter((x) => x.p === null || allUnknown(x.e.time));

  const positionedUnknown: PositionedEvent[] = unknown.map(({ e }) => ({
    id: e.id,
    title: e.title,
    track: e.track,
    pos: null,
    span: null,
    label: formatTime(e.time),
    futureScenario: e.futureScenario === true,
    unplaced: true,
  }));

  if (known.length === 0) {
    return { mode, frame, unit: events[0]!.time.unit ?? "yr", axisMin: "0", axisMax: "1", events: [], unknownEvents: positionedUnknown };
  }

  // Collect all bound keys (values and interval endpoints).
  const keys: number[] = [];
  for (const { e } of known) {
    const v = e.time.value;
    const lo = e.time.lower_bound;
    const hi = e.time.upper_bound;
    if (v != null) keys.push(toNumber(v));
    if (lo != null) keys.push(toNumber(lo));
    if (hi != null) keys.push(toNumber(hi));
  }
  const unit = known[0]!.e.time.unit ?? "yr";

  let axisMinN: number;
  let axisMaxN: number;
  if (mode === "schematic") {
    // Schematic: rank-order band layout; endpoints are normalized 0..1.
    axisMinN = 0;
    axisMaxN = 1;
  } else {
    let min = Math.min(...keys);
    let max = Math.max(...keys);
    if (mode === "logarithmic") {
      // Zero-safe: shift by floor, and include a decade of headroom.
      min = Math.max(min, 0);
      const logMin = Math.log10(Math.max(min, LOG_FLOOR));
      const logMax = Math.log10(Math.max(max, LOG_FLOOR * 10));
      axisMinN = Math.pow(10, logMin - (logMax - logMin) * 0.05 - 0.01);
      axisMaxN = Math.pow(10, logMax + (logMax - logMin) * 0.05 + 0.01);
      if (!(axisMaxN > axisMinN)) {
        axisMaxN = axisMinN * 10;
      }
    } else {
      const pad = (max - min) * 0.05 || Math.abs(max || 1) * 0.1;
      axisMinN = min - pad;
      axisMaxN = max + pad;
    }
  }

  const scale = (v: number): number => {
    if (mode === "logarithmic") {
      const lo = Math.log10(Math.max(axisMinN, LOG_FLOOR));
      const hi = Math.log10(Math.max(axisMaxN, LOG_FLOOR * 10));
      const t = (Math.log10(Math.max(v, LOG_FLOOR)) - lo) / (hi - lo);
      return clamp01(t);
    }
    if (mode === "schematic") return clamp01(v);
    return clamp01((v - axisMinN) / (axisMaxN - axisMinN));
  };

  if (mode === "schematic") {
    // Rank-order by (parsed lower-or-value key), then distribute evenly with
    // interval widths preserved proportionally to their span share.
    const sorted = [...known].sort((a, b) => {
      const ka = a.p.key ?? a.p.lower ?? 0n;
      const kb = b.p.key ?? b.p.lower ?? 0n;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    const n = sorted.length;
    const events2: PositionedEvent[] = sorted.map(({ e }, i) => {
      const slot = n === 1 ? 0.5 : (i / (n - 1)) * 0.9 + 0.05;
      return {
        id: e.id,
        title: e.title,
        track: e.track,
        pos: slot,
        span: null,
        label: formatTime(e.time),
        futureScenario: e.futureScenario === true,
        unplaced: false,
      };
    });
    return {
      mode,
      frame,
      unit,
      axisMin: "0",
      axisMax: "1",
      events: events2,
      unknownEvents: positionedUnknown,
    };
  }

  const eventsOut: PositionedEvent[] = known.map(({ e }) => {
    if (e.time.value != null) {
      return {
        id: e.id,
        title: e.title,
        track: e.track,
        pos: scale(toNumber(e.time.value)),
        span: null,
        label: formatTime(e.time),
        futureScenario: e.futureScenario === true,
        unplaced: false,
      };
    }
    const lo = toNumber(e.time.lower_bound!);
    const hi = toNumber(e.time.upper_bound!);
    return {
      id: e.id,
      title: e.title,
      track: e.track,
      pos: (scale(lo) + scale(hi)) / 2,
      span: [scale(lo), scale(hi)],
      label: formatTime(e.time),
      futureScenario: e.futureScenario === true,
      unplaced: false,
    };
  });

  // Deterministic order: by position, then id.
  eventsOut.sort((a, b) => {
    const pa = a.pos ?? 2;
    const pb = b.pos ?? 2;
    return pa !== pb ? pa - pb : a.id < b.id ? -1 : 1;
  });

  return {
    mode,
    frame,
    unit,
    axisMin: numToString(axisMinN),
    axisMax: numToString(axisMaxN),
    events: eventsOut,
    unknownEvents: positionedUnknown,
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function numToString(v: number): string {
  if (!Number.isFinite(v)) return "0";
  // Prefer a compact decimal string; fall back to exponent for extremes.
  if (Math.abs(v) >= 1e-6 && Math.abs(v) < 1e15) {
    return String(Math.round(v * 1e9) / 1e9);
  }
  return v.toExponential(6);
}

function safeParse(t: TemporalValue): ParsedTime | null {
  try {
    return parseTime(t);
  } catch {
    return null;
  }
}

function allUnknown(t: TemporalValue): boolean {
  return t.value == null && t.lower_bound == null && t.upper_bound == null;
}

/**
 * Keyboard navigation model: returns the event id to focus given a key and
 * the current index. Unknown-time events participate in the list view only.
 */
export function navigateTimeline(
  layout: TimelineLayout,
  currentIndex: number,
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
): number {
  const list = [...layout.events, ...layout.unknownEvents];
  const n = list.length;
  if (n === 0) return -1;
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return n - 1;
    case "ArrowLeft":
      return Math.max(0, currentIndex - 1);
    case "ArrowRight":
      return Math.min(n - 1, currentIndex + 1);
  }
}

/** Ordered event list for the accessible flat view (known by position, unknown after). */
export function accessibleEventList(layout: TimelineLayout): PositionedEvent[] {
  return [...layout.events, ...layout.unknownEvents];
}
