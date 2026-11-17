/**
 * Static SVG timeline renderer — source-credited fallback-first rendering.
 *
 * Produces a single accessible SVG (role="group", aria-label, <title>/<desc>)
 * plus a parallel flat list (the real accessible interface). No animation:
 * CSS/SVG animation is a progressive enhancement applied by apps/web on top
 * of this deterministic output; reduced-motion users keep exactly this.
 * All text is escaped; scale mode and units are always labeled.
 */
import type { TimelineLayout, PositionedEvent } from "./timeline.js";
import { accessibleEventList } from "./timeline.js";

function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface RenderOptions {
  width?: number;
  rowHeight?: number;
  /** Non-science label forced for fixture demos (already in titles, but belt-and-braces). */
  fixtureDemo?: boolean;
}

/**
 * Render the timeline as an SVG string. Events are laid out on horizontal
 * rows (track bands); intervals get bars, points get markers. The SVG is
 * decorative-adjacent: the accessible list (renderAccessibleList) carries
 * the semantics.
 */
export function renderTimelineSvg(layout: TimelineLayout, opts: RenderOptions = {}): string {
  const W = opts.width ?? 960;
  const rowH = opts.rowHeight ?? 44;
  const padL = 16;
  const padR = 16;
  const axisH = 28;
  const events = layout.events;
  const H = axisH + events.length * rowH + 16;

  const tracks = [...new Set(events.map((e) => e.track))];
  const trackY = new Map<string, number>();
  let y = axisH;
  // Group rows by track for band labels.
  const byTrack = new Map<string, PositionedEvent[]>();
  for (const e of events) {
    const list = byTrack.get(e.track) ?? [];
    list.push(e);
    byTrack.set(e.track, list);
  }
  for (const t of byTrack.keys()) {
    trackY.set(t, y);
    y += (byTrack.get(t)?.length ?? 1) * rowH;
  }

  const x = (p: number): number => padL + p * (W - padL - padR);

  const rows: string[] = [];
  // Axis line + endpoints.
  rows.push(
    `<line x1="${padL}" y1="${axisH - 6}" x2="${W - padR}" y2="${axisH - 6}" class="tl-axis"/>`,
    `<text x="${padL}" y="${axisH - 10}" class="tl-axis-label">${esc(layout.axisMin)} ${esc(layout.unit)}</text>`,
    `<text x="${W - padR}" y="${axisH - 10}" text-anchor="end" class="tl-axis-label">${esc(layout.axisMax)} ${esc(layout.unit)}</text>`,
  );
  if (layout.mode === "logarithmic") {
    rows.push(
      `<text x="${(W + padL - padR) / 2}" y="${axisH - 10}" text-anchor="middle" class="tl-axis-label">logarithmic scale (zero-safe)</text>`,
    );
  }

  for (const e of events) {
    const cy = (trackY.get(e.track) ?? axisH) + rowH * 0.5 + rowH * (rowIndex(byTrack, e) ?? 0);
    if (e.span) {
      const x1 = x(e.span[0]);
      const x2 = x(e.span[1]);
      rows.push(
        `<rect x="${x1}" y="${cy - 6}" width="${Math.max(2, x2 - x1)}" height="12" rx="6" class="tl-interval${e.futureScenario ? " tl-future" : ""}"><title>${esc(e.title)} — ${esc(e.label)} (interval)</title></rect>`,
      );
    } else if (e.pos !== null) {
      rows.push(
        `<circle cx="${x(e.pos)}" cy="${cy}" r="6" class="tl-point${e.futureScenario ? " tl-future" : ""}"><title>${esc(e.title)} — ${esc(e.label)}</title></circle>`,
      );
    }
    // Label: place above the marker, clamp within canvas.
    const lx = Math.min(W - padR - 120, Math.max(padL, (e.pos !== null ? x(e.pos) : padL) - 60));
    rows.push(
      `<text x="${lx}" y="${cy - 12}" class="tl-label${e.futureScenario ? " tl-label-future" : ""}">${esc(e.title)}</text>`,
    );
  }

  const note = opts.fixtureDemo
    ? "Engineering fixture — not science"
    : `${layout.mode} scale · ${layout.frame} frame`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Timeline of ${events.length + layout.unknownEvents.length} events, ${esc(note)}" class="timeline-svg">
<title>Timeline (${esc(layout.mode)} scale, ${esc(layout.frame)} frame)</title>
<desc>${esc(note)}. ${layout.unknownEvents.length > 0 ? `${layout.unknownEvents.length} event(s) have unknown time and are listed separately.` : ""}</desc>
${rows.join("\n")}
</svg>`;
}

function rowIndex(byTrack: Map<string, PositionedEvent[]>, e: PositionedEvent): number | null {
  const list = byTrack.get(e.track);
  if (!list) return null;
  const i = list.indexOf(e);
  return i < 0 ? null : i;
}

/** Flat accessible event list — the keyboard/screen-reader interface. */
export function renderAccessibleList(layout: TimelineLayout): string {
  const items = accessibleEventList(layout)
    .map(
      (e, i) =>
        `<li class="tl-list-item${e.unplaced ? " tl-unknown" : ""}" tabindex="-1" data-event-index="${i}" data-event-id="${esc(e.id)}">
  <span class="tl-list-title">${esc(e.title)}</span>
  <span class="tl-list-time">${e.unplaced ? "Time unknown" : esc(e.label)}</span>
  ${e.futureScenario ? '<span class="tl-list-flag">Conditional future scenario — not known history</span>' : ""}
</li>`,
    )
    .join("\n");
  return `<ol class="tl-list" role="listbox" aria-label="Timeline events in order${layout.unknownEvents.length > 0 ? "; events with unknown time are listed last" : ""}">
${items}
</ol>`;
}

/** Full timeline block: SVG + accessible list + scale legend. */
export function renderTimeline(layout: TimelineLayout, opts: RenderOptions = {}): string {
  return `<figure class="timeline-figure">
${renderTimelineSvg(layout, opts)}
<figcaption class="tl-caption">
  Scale mode: <strong>${esc(layout.mode)}</strong>${layout.mode === "logarithmic" ? " (zero-safe: a small floor keeps zero finite)" : ""}.
  Time frame: <strong>${esc(layout.frame)}</strong>. Intervals show ranges; unknown times are never given a fake value.
  ${opts.fixtureDemo ? "<br><em>All events shown are engineering fixtures, not scientific data.</em>" : ""}
</figcaption>
</figure>
<section class="tl-accessible" aria-label="Timeline as a list">
<h3 class="tl-list-heading">Event list</h3>
${renderAccessibleList(layout)}
</section>`;
}
