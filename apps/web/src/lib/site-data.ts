/**
 * Site data loader — the single bridge from the canonical registry to pages.
 *
 * Runs at build time only. Fails the build when validation errors exist
 * (fail-closed). The compiler output (approved projection only) drives every
 * section; no page may read modules/ or experiences/ directly.
 */
import { discoverRegistry, buildApprovedProjection, hasErrors, formatFindings, allRecords } from "@universe/registry";
import { compileSiteData, SECTIONS, readPlannedDomains, type SiteData } from "@universe/compiler";
import { layoutTimeline, type TimelineEvent } from "@universe/visualizations";
import type { LoadedRecord } from "@universe/registry";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = process.env.UNIVERSE_ROOT
  ? process.env.UNIVERSE_ROOT
  : join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export interface SiteModel {
  data: SiteData;
  sections: typeof SECTIONS;
  /** Fixture demo events (clearly labeled non-science; NEVER part of projection). */
  fixtureEvents: LoadedRecord[];
}

let cached: SiteModel | null = null;

export function loadSiteModel(): SiteModel {
  if (cached) return cached;
  const registry = discoverRegistry(REPO_ROOT);
  if (hasErrors(registry)) {
    throw new Error(`registry validation failed — refusing to build:\n${formatFindings(registry.findings.filter((f) => f.severity === "error"))}`);
  }
  const projection = buildApprovedProjection(registry);
  const data = compileSiteData(registry, projection, { repoRoot: REPO_ROOT });
  // Fixture events for the engineering demo, taken from the RAW registry
  // (not the projection). Only events whose IDs carry the fixture namespace
  // are ever handed to the demo renderer, and the demo page is noindex +
  // search-excluded. This is the ONLY sanctioned fixture display path.
  const fixtureEvents = allRecords(registry).filter(
    (r) => r.type === "history-event" && r.id.split(".").includes("fixture"),
  );
  cached = { data, sections: SECTIONS, fixtureEvents };
  return cached;
}

/** Build a demo timeline layout from fixture events (never scientific data). */
export function fixtureTimeline(mode: "logarithmic" | "linear" | "schematic" = "logarithmic") {
  const { fixtureEvents } = loadSiteModel();
  const events: TimelineEvent[] = fixtureEvents.map((r) => ({
    id: r.id,
    title: String(r.record.title ?? r.id),
    track: String(r.record.track ?? ""),
    time: r.record.time as TimelineEvent["time"],
    futureScenario: r.record.future_scenario === true,
  }));
  return layoutTimeline(events, mode);
}

export { SECTIONS };
