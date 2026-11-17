/**
 * @universe/compiler — deterministic site-data generation.
 *
 * Compiles the fail-closed approved projection into the static site's data
 * model: navigation, section indexes, coverage map, redirect table, level
 * index, and the search corpus. The output contains ONLY approved/published,
 * owned, non-fixture records. Determinism: identical projection in, identical
 * JSON out (sorted keys, sorted collections) — used by the reproducible
 * build check (see tools/release and CI).
 */
import type { Registry, LoadedRecord } from "@universe/registry";
import type { ApprovedProjection } from "@universe/registry";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

/** The eleven public sections (design §3). Routes without eligible content show honest empty states. */
export const SECTIONS: { route: string; title: string; summary: string }[] = [
  { route: "/", title: "Start", summary: "Choose a learning goal and navigate to reviewed introductions." },
  { route: "/history/", title: "Universe History", summary: "Cosmic evolution, Earth and life, astronomy, exploration." },
  { route: "/academy/", title: "Academy", summary: "Structured lessons from basics through advanced mathematics." },
  { route: "/explore/", title: "Explore", summary: "Searchable subjects, objects, and interactive visualizations." },
  { route: "/evidence/", title: "Evidence", summary: "Measurements, models, source references, debates and uncertainty." },
  { route: "/research/", title: "Research Frontier", summary: "Open scientific questions, surveys, reproducible projects." },
  { route: "/laboratories/", title: "Laboratories", summary: "Simulations, real datasets, exercises, notebooks." },
  { route: "/technology/", title: "Space Technology", summary: "Spaceflight, rockets, observatories, instruments, robotics." },
  { route: "/careers/", title: "Careers", summary: "Scientist, astronaut, engineer, mission operations, citizen science." },
  { route: "/library/", title: "Library", summary: "Official publications, manuals, datasets, tools and attribution." },
  { route: "/community/", title: "Community", summary: "Contribution guide, coverage map, review process and changelog." },
];

export interface NavItem {
  route: string;
  title: string;
  /** Number of approved records discoverable in this section. 0 → honest empty state. */
  count: number;
}

export interface CoverageModule {
  id: string;
  title: string;
  status: string;
  planned: boolean;
  approvedRecords: number;
  draftRecords: number;
  owners: number;
}

export interface CoverageRow {
  domain: string;
  title: string;
  state: "draft" | "planned";
  approvedRecords: number;
  draftRecords: number;
}

export interface ConceptIndexEntry {
  id: string;
  title: string;
  module: string;
  levels: string[];
  route: string;
}

export interface LevelIndex {
  level: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  count: number;
}

export interface RedirectRule {
  slug: string;
  target: string;
}

export interface SiteData {
  nav: NavItem[];
  coverage: CoverageRow[];
  concepts: ConceptIndexEntry[];
  levels: LevelIndex[];
  redirects: RedirectRule[];
  lessons: { id: string; title: string; module: string; level: string; route: string }[];
  claims: { id: string; statement: string; module: string; evidenceStatus: string; route: string }[];
  sources: { id: string; title: string; rightsMode: string; url?: string; doi?: string }[];
  events: {
    id: string;
    title: string;
    track: string;
    timeLabel: string;
    futureScenario: boolean;
    route: string;
  }[];
  researchQuestions: { id: string; question: string; module: string; status?: string; route: string }[];
  /** True when the site has zero approved scientific records (engineering preview). */
  emptyState: boolean;
  stats: {
    approvedRecords: number;
    modules: number;
    excluded: Record<string, number>;
  };
}

/** Map a record to its public route. Approved records only reach here. */
export function routeForRecord(r: LoadedRecord): string {
  switch (r.type) {
    case "concept":
      return `/explore/${r.id}/`;
    case "lesson":
      return `/academy/${r.id}/`;
    case "claim":
    case "evidence":
      return `/evidence/${r.id}/`;
    case "source":
    case "dataset":
      return `/library/${r.id}/`;
    case "research-question":
      return `/research/${r.id}/`;
    case "history-event":
      return `/history/${r.id}/`;
    case "path":
      return `/academy/paths/${r.id}/`;
    case "career":
      return `/careers/${r.id}/`;
    case "visualization":
      return `/laboratories/${r.id}/`;
    default:
      return `/explore/${r.id}/`;
  }
}

/** Count records per section route for nav badges. */
function sectionCounts(records: LoadedRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    const route = routeForRecord(r);
    const section = `/${route.split("/")[1] ?? ""}/`;
    counts.set(section, (counts.get(section) ?? 0) + 1);
  }
  return counts;
}

/** Compile the approved projection into deterministic site data. */
export function compileSiteData(
  registry: Registry,
  projection: ApprovedProjection,
  options: { repoRoot?: string } = {},
): SiteData {
  const records = [...projection.records.values()];

  // Deterministic ordering everywhere.
  records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const counts = sectionCounts(records);

  const nav: NavItem[] = SECTIONS.map((s) => ({
    route: s.route,
    title: s.title,
    count: s.route === "/" ? records.length : (counts.get(s.route) ?? 0),
  }));

  // Coverage: active/draft modules + planned domains from the registry file.
  const coverage: CoverageRow[] = [];
  const draftCounts = new Map<string, number>();
  for (const m of registry.modules.values()) {
    for (const r of m.records) draftCounts.set(m.id, (draftCounts.get(m.id) ?? 0) + 1);
  }
  for (const m of projection.modules) {
    coverage.push({
      domain: m.id,
      title: m.title,
      state: "draft",
      approvedRecords: m.recordCount,
      draftRecords: draftCounts.get(m.id) ?? 0,
    });
  }
  const plannedFile = readPlannedDomains(options.repoRoot);
  for (const p of plannedFile) {
    coverage.push({ domain: p.id, title: p.title, state: "planned", approvedRecords: 0, draftRecords: 0 });
  }
  coverage.sort((a, b) => (a.domain < b.domain ? -1 : 1));

  const concepts: ConceptIndexEntry[] = records
    .filter((r) => r.type === "concept")
    .map((r) => ({
      id: r.id,
      title: String(r.record.title ?? r.id),
      module: String(r.record.module ?? r.owner),
      levels: ((r.record.level_coverage as string[] | undefined) ?? []).slice().sort(),
      route: routeForRecord(r),
    }));

  const levels: LevelIndex[] = (["L0", "L1", "L2", "L3", "L4", "L5"] as const).map((level) => ({
    level,
    count: records.filter((r) => r.type === "lesson" && r.record.level === level).length,
  }));

  const redirects: RedirectRule[] = [...registry.redirects.values()]
    .map((r) => ({ slug: r.slug, target: r.target }))
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));

  const lessons = records
    .filter((r) => r.type === "lesson")
    .map((r) => ({
      id: r.id,
      title: String(r.record.title ?? r.id),
      module: String(r.record.module ?? r.owner),
      level: String(r.record.level ?? "L0"),
      route: routeForRecord(r),
    }));

  const claims = records
    .filter((r) => r.type === "claim")
    .map((r) => ({
      id: r.id,
      statement: String(r.record.statement ?? ""),
      module: String(r.record.module ?? r.owner),
      evidenceStatus: String(r.record.evidence_status ?? ""),
      route: routeForRecord(r),
    }));

  const sources = records
    .filter((r) => r.type === "source")
    .map((r) => ({
      id: r.id,
      title: String(r.record.title ?? r.id),
      rightsMode: String((r.record.rights as { mode?: string } | undefined)?.mode ?? "unknown"),
      ...(typeof r.record.url === "string" ? { url: r.record.url } : {}),
      ...(typeof r.record.doi === "string" ? { doi: r.record.doi } : {}),
    }));

  const events = records
    .filter((r) => r.type === "history-event")
    .map((r) => ({
      id: r.id,
      title: String(r.record.title ?? r.id),
      track: String(r.record.track ?? ""),
      timeLabel: formatEventTime(r),
      futureScenario: r.record.future_scenario === true,
      route: routeForRecord(r),
    }));

  const researchQuestions = records
    .filter((r) => r.type === "research-question")
    .map((r) => ({
      id: r.id,
      question: String(r.record.question ?? ""),
      module: String(r.record.module ?? r.owner),
      ...(typeof r.record.question_status === "string" ? { status: r.record.question_status } : {}),
      route: routeForRecord(r),
    }));

  return {
    nav,
    coverage,
    concepts,
    levels,
    redirects,
    lessons,
    claims,
    sources,
    events,
    researchQuestions,
    emptyState: records.length === 0,
    stats: {
      approvedRecords: records.length,
      modules: projection.modules.length,
      excluded: projection.stats.excluded,
    },
  };
}

function formatEventTime(r: LoadedRecord): string {
  const t = r.record.time as
    | { value?: string | null; lower_bound?: string | null; upper_bound?: string | null; unit?: string; precision?: string }
    | undefined;
  if (!t) return "unknown";
  if (t.precision === "unknown" || (t.value == null && t.lower_bound == null && t.upper_bound == null)) return "unknown";
  const unit = t.unit ? ` ${t.unit}` : "";
  if (t.value != null) return `${t.value}${unit}`;
  return `${t.lower_bound ?? "?"}–${t.upper_bound ?? "?"}${unit}`;
}

/**
 * Planned domains from registries/coverage/planned-domains.yaml. These are
 * documented future-module proposals feeding the coverage map; they never
 * create record trees or fake content.
 * @param root Repository root. Defaults to this package's repo root.
 */
export function readPlannedDomains(root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")): {
  id: string;
  title: string;
  need: string;
}[] {
  const file = join(root, "registries", "coverage", "planned-domains.yaml");
  if (!existsSync(file)) return [];
  try {
    const parsed = parseYaml(readFileSync(file, "utf8")) as { planned_domains?: { id?: string; title?: string; need?: string }[] };
    if (!parsed || !Array.isArray(parsed.planned_domains)) return [];
    const out: { id: string; title: string; need: string }[] = [];
    for (const p of parsed.planned_domains) {
      if (typeof p?.id === "string" && typeof p?.title === "string") {
        out.push({ id: p.id, title: p.title, need: typeof p.need === "string" ? p.need : "" });
      }
    }
    return out;
  } catch {
    return [];
  }
}
