/**
 * Curated content loader — reads content/curated/*.json at build time.
 *
 * The curated layer holds *verified link directories and imported fact data*
 * (see docs/content-workflow.md): every item carries a source URL that was
 * individually verified at curation time. This is distinct from original
 * scientific explanations, which still require qualified human review and
 * flow through the registry/approved-projection path.
 *
 * No caching surprises: files are read once per build per call site.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = process.env.UNIVERSE_ROOT
  ? process.env.UNIVERSE_ROOT
  : join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export interface CuratedProvenance {
  kind: string;
  description: string;
  verification: {
    method: string;
    verifiedOn: string;
    passRate: string;
    [k: string]: unknown;
  };
}

interface CuratedEnvelope<T> {
  provenance: CuratedProvenance;
  data: T;
}

function loadCurated<T>(name: string): CuratedEnvelope<T> {
  const raw = readFileSync(join(REPO_ROOT, "content", "curated", name), "utf8");
  const parsed = JSON.parse(raw) as CuratedEnvelope<T>;
  if (!parsed?.provenance?.verification?.verifiedOn) {
    throw new Error(`curated file ${name} is missing its provenance envelope`);
  }
  return parsed;
}

export interface LibraryResource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  description: string;
  category: string;
  type: string;
  difficulty: string;
  access: string;
  license: string;
}

export function loadLibrary(): CuratedEnvelope<LibraryResource[]> {
  return loadCurated<LibraryResource[]>("library.json");
}

export interface AcademyResource {
  title: string;
  url: string;
  type: string;
  provider: string;
  note?: string;
}

export interface AcademyStep {
  step: number;
  level: string;
  title: string;
  goal: string;
  resources: AcademyResource[];
}

export interface AcademySubject {
  id: string;
  title: string;
  overview: string;
  levels: string[];
  prerequisites: string[];
  pathway: AcademyStep[];
  next: string[];
}

export function loadAcademy(): CuratedEnvelope<AcademySubject[]> {
  return loadCurated<AcademySubject[]>("academy.json");
}

export interface TimelineEvent {
  id: string;
  title: string;
  time: {
    value: number;
    unit: string;
    precision: string;
    uncertainty: string | null;
  };
  display: string;
  summary: string;
  cosmologicalModel?: string | null;
  source: { label: string; url: string };
  links?: { label: string; url: string }[];
}

export interface TimelineEra {
  id: string;
  title: string;
  summary: string;
  order: number;
  events: TimelineEvent[];
}

export interface TimelineModel {
  model: {
    name: string;
    reference: string;
    ageGyr: number;
    ageUncertaintyGyr: number;
  };
  eras: TimelineEra[];
}

export function loadTimeline(): CuratedEnvelope<TimelineModel> {
  return loadCurated<TimelineModel>("timeline.json");
}

export interface ResearchPaper {
  title: string;
  authors: string;
  year: number;
  arxiv: string;
  url: string;
  why: string;
}

export interface ResearchField {
  id: string;
  name: string;
  summary: string;
  priorities: { text: string; source: { label: string; url: string } }[];
  openQuestions: { text: string; source: { label: string; url: string } }[];
  papers: ResearchPaper[];
  datasets: { name: string; operator: string; url: string; description: string }[];
  institutions: { name: string; url: string }[];
  tools: { name: string; url: string; description?: string }[];
  learnFirst: string[];
}

export function loadResearch(): CuratedEnvelope<ResearchField[]> {
  return loadCurated<ResearchField[]>("research.json");
}

export interface Planet {
  name: string;
  type: string;
  description: string;
  massE24kg: number | null;
  diameterKm: number | null;
  densityKgm3: number | null;
  gravityMs2: number | null;
  escapeVelocityKms: number | null;
  rotationPeriodHours: number | null;
  lengthOfDayHours: number | null;
  distanceFromSunE6km: number | null;
  orbitalPeriodDays: number | null;
  orbitalVelocityKms: number | null;
  meanTemperatureC: number | null;
  moons: number | null;
  ringSystem: boolean | null;
  magneticField: boolean | null;
  source: { label: string; url: string };
  page: string;
}

export interface Mission {
  name: string;
  year: number;
  decade: string;
  agency: string;
  status: string;
  summary: string;
  url: string;
}

export interface ExploreModel {
  planets: Planet[];
  exoplanets: {
    name: string;
    discovered: number;
    type: string;
    distanceLy: number;
    notes: string;
    source: { label: string; url: string };
  }[];
  missions: Mission[];
  scale: {
    name: string;
    sizeKm: number | null;
    sizeNote?: string;
    type: string;
    source: { label: string; url: string };
  }[];
}

export function loadExplore(): CuratedEnvelope<ExploreModel> {
  return loadCurated<ExploreModel>("explore.json");
}
