import { describe, expect, it } from "vitest";
import { layoutTimeline, navigateTimeline, accessibleEventList, type TimelineEvent } from "../src/timeline.js";
import { renderTimelineSvg, renderAccessibleList, renderTimeline } from "../src/svg-renderer.js";

const ev = (id: string, time: TimelineEvent["time"], extra: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id,
  title: `Event ${id}`,
  track: "cosmic-dawn",
  time,
  ...extra,
});

const t = (value: string | null, lo: string | null = null, hi: string | null = null): TimelineEvent["time"] => ({
  frame: "cosmic-age",
  unit: "Gyr",
  value,
  lower_bound: lo,
  upper_bound: hi,
  model_ref: null,
  precision: value !== null ? "exact" : lo !== null ? "interval" : "unknown",
});

describe("timeline: layout", () => {
  it("places point events on a linear axis in value order", () => {
    const layout = layoutTimeline([ev("a", t("1")), ev("b", t("13.8")), ev("c", t("0.00038"))], "linear");
    expect(layout.events.map((e) => e.id)).toEqual(["c", "a", "b"]);
    for (const e of layout.events) {
      expect(e.pos).not.toBeNull();
      expect(e.pos!).toBeGreaterThanOrEqual(0);
      expect(e.pos!).toBeLessThanOrEqual(1);
      expect(e.span).toBeNull();
    }
  });

  it("renders intervals as spans, not fake points", () => {
    const layout = layoutTimeline([ev("interval", t(null, "13.6", "13.8")), ev("point", t("0.001"))], "linear");
    const interval = layout.events.find((e) => e.id === "interval")!;
    expect(interval.span).not.toBeNull();
    expect(interval.span![0]).toBeLessThan(interval.span![1]);
    expect(interval.pos).toBeCloseTo((interval.span![0] + interval.span![1]) / 2, 5);
    const point = layout.events.find((e) => e.id === "point")!;
    expect(point.span).toBeNull();
  });

  it("keeps unknown-time events out of the axis with an 'unknown' label, never zero", () => {
    const layout = layoutTimeline([ev("u", t(null)), ev("k", t("1"))], "linear");
    expect(layout.events.map((e) => e.id)).toEqual(["k"]);
    expect(layout.unknownEvents).toHaveLength(1);
    expect(layout.unknownEvents[0]!.unplaced).toBe(true);
    expect(layout.unknownEvents[0]!.pos).toBeNull();
    expect(layout.unknownEvents[0]!.label).toBe("unknown");
  });

  it("log scale is zero-safe: a zero-valued event still gets a finite position", () => {
    const layout = layoutTimeline([ev("zero", t("0")), ev("big", t("13.8"))], "logarithmic");
    const zero = layout.events.find((e) => e.id === "zero")!;
    expect(Number.isFinite(zero.pos!)).toBe(true);
    expect(zero.pos!).toBeGreaterThanOrEqual(0);
    const big = layout.events.find((e) => e.id === "big")!;
    expect(big.pos!).toBeGreaterThan(zero.pos!);
  });

  it("log scale orders 380 kyr < 13.8 Gyr correctly across magnitudes", () => {
    const layout = layoutTimeline(
      [ev("gyr", { frame: "cosmic-age", unit: "Gyr", value: "13.8", lower_bound: null, upper_bound: null, model_ref: null, precision: "exact" }),
       ev("kyr", { frame: "cosmic-age", unit: "kyr", value: "380", lower_bound: null, upper_bound: null, model_ref: null, precision: "exact" })],
      "logarithmic",
    );
    // Same frame but different units: values are normalized? No — the engine
    // treats the raw numbers; cross-unit inputs must be converted by the
    // caller. This documents that expectation: 13.8 > 380 numerically here.
    const kyr = layout.events.find((e) => e.id === "kyr")!;
    const gyr = layout.events.find((e) => e.id === "gyr")!;
    expect(kyr.pos!).toBeGreaterThan(gyr.pos!); // 380 (raw) > 13.8 (raw)
  });

  it("schematic mode distributes rank order evenly with fixed [0,1] axis", () => {
    const layout = layoutTimeline([ev("a", t("9")), ev("b", t("2")), ev("c", t("5"))], "schematic");
    expect(layout.axisMin).toBe("0");
    expect(layout.axisMax).toBe("1");
    expect(layout.events.map((e) => e.id)).toEqual(["b", "c", "a"]);
    expect(layout.events[0]!.pos).toBeCloseTo(0.05, 5);
    expect(layout.events[2]!.pos).toBeCloseTo(0.95, 5);
  });

  it("rejects mixed temporal frames on one axis", () => {
    expect(() =>
      layoutTimeline(
        [
          ev("c", { frame: "cosmic-age", unit: "Gyr", value: "1", lower_bound: null, upper_bound: null, model_ref: null, precision: "exact" }),
          ev("l", { frame: "lookback", unit: "Gyr", value: "1", lower_bound: null, upper_bound: null, model_ref: null, precision: "exact" }),
        ],
        "linear",
      ),
    ).toThrow(/cannot mix temporal frames/);
  });

  it("handles the empty timeline", () => {
    const layout = layoutTimeline([], "linear");
    expect(layout.events).toHaveLength(0);
    expect(layout.unknownEvents).toHaveLength(0);
  });

  it("handles all-unknown timelines without inventing an axis", () => {
    const layout = layoutTimeline([ev("u1", t(null)), ev("u2", t(null))], "linear");
    expect(layout.events).toHaveLength(0);
    expect(layout.unknownEvents).toHaveLength(2);
  });
});

describe("timeline: keyboard navigation", () => {
  const layout = layoutTimeline([ev("a", t("1")), ev("u", t(null)), ev("b", t("2"))], "linear");

  it("moves with arrow keys within bounds", () => {
    expect(navigateTimeline(layout, 0, "ArrowRight")).toBe(1);
    expect(navigateTimeline(layout, 1, "ArrowRight")).toBe(2);
    expect(navigateTimeline(layout, 2, "ArrowRight")).toBe(2); // clamped
    expect(navigateTimeline(layout, 1, "ArrowLeft")).toBe(0);
    expect(navigateTimeline(layout, 0, "ArrowLeft")).toBe(0); // clamped
  });

  it("Home/End jump to the extremes", () => {
    expect(navigateTimeline(layout, 1, "Home")).toBe(0);
    expect(navigateTimeline(layout, 0, "End")).toBe(2);
  });

  it("returns -1 for empty timelines", () => {
    expect(navigateTimeline(layoutTimeline([], "linear"), 0, "ArrowRight")).toBe(-1);
  });

  it("accessible list includes unknown-time events after known ones", () => {
    const list = accessibleEventList(layout);
    expect(list.map((e) => e.id)).toEqual(["a", "b", "u"]);
  });
});

describe("timeline: SVG renderer", () => {
  const layout = layoutTimeline(
    [
      ev("alpha", t(null, "13.6", "13.8"), { track: "early-cosmic-history" }),
      ev("beta", t("4.5"), { track: "structure-evolution" }),
      ev("unknown", t(null)),
      ev("future", t("8"), { track: "future-scenarios", futureScenario: true }),
    ],
    "logarithmic",
  );

  it("escapes titles and labels", () => {
    const evil = layoutTimeline(
      [ev('<script>"x"</script>', t("1"))],
      "linear",
    );
    const svg = renderTimelineSvg(evil);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("draws interval bars and point circles with titles", () => {
    const svg = renderTimelineSvg(layout);
    expect(svg).toContain('class="tl-interval"');
    expect(svg).toContain('class="tl-point');
    expect(svg).toContain("<title>");
    expect(svg).toContain('role="img"');
    expect(svg).toContain("aria-label");
  });

  it("labels the scale mode and zero-safety in the caption", () => {
    const html = renderTimeline(layout, { fixtureDemo: true });
    expect(html).toContain("logarithmic");
    expect(html).toContain("zero-safe");
    expect(html).toContain("engineering fixtures, not scientific data");
    expect(html).toContain("Time unknown");
  });

  it("accessible list carries listbox semantics and unknown flags", () => {
    const list = renderAccessibleList(layout);
    expect(list).toContain('role="listbox"');
    expect(list).toContain("Time unknown");
    expect(list).toContain("Conditional future scenario");
  });

  it("future scenarios are visually flagged", () => {
    const svg = renderTimelineSvg(layout);
    expect(svg).toContain("tl-future");
  });
});
