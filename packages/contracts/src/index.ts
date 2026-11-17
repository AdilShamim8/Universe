/**
 * @universe/contracts — versioned, portable record contracts.
 *
 * JSON Schema (Draft 2020-12) is the canonical form; the TypeScript types
 * below mirror the schemas and are checked against them by unit tests that
 * validate representative records. Schema changes require an ADR and a
 * version bump with a migration script.
 */
// ajv's 2020 entry is CommonJS: the class is a named export, and the formats
// plugin is exposed as `.default` on the module object (verified against the
// runtime shape: keys are ["__esModule", "default", "module.exports"]). The
// explicit cast keeps tsc's NodeNext interop happy without weakening the
// workspace's verbatimModuleSyntax/strict settings.
import { Ajv2020 } from "ajv/dist/2020.js";
import * as ajvFormatsNS from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ValidateFunction } from "ajv";

type Ajv2020Instance = InstanceType<typeof Ajv2020>;
const addFormats = (ajvFormatsNS as unknown as { default: (ajv: Ajv2020Instance) => unknown }).default;

export const SCHEMA_VERSION = 1 as const;

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), "..", "schema");

export type LifecycleStatus =
  | "draft"
  | "in-review"
  | "approved"
  | "published"
  | "withdrawn"
  | "deprecated";

export type EvidenceStatus =
  | "established"
  | "model-dependent"
  | "contested"
  | "hypothesis"
  | "historical-superseded";

export type RightsMode =
  | "link-only"
  | "metadata-only"
  | "permitted-redistribution"
  | "restricted"
  | "prohibited";

/** Record types with a schema contract. */
export const RECORD_TYPES = [
  "module",
  "concept",
  "claim",
  "source",
  "evidence",
  "lesson",
  "dataset",
  "visualization",
  "history-event",
  "research-question",
  "path",
  "career",
  "review-decision",
  "release-manifest",
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

/** Records that live inside a module directory. */
export const MODULE_RECORD_TYPES: readonly RecordType[] = [
  "concept",
  "claim",
  "source",
  "evidence",
  "lesson",
  "dataset",
  "visualization",
  "research-question",
  "path",
] as const;

export type TemporalFrame = "cosmic-age" | "lookback" | "geological" | "calendar";
export type TimePrecision = "exact" | "year" | "month" | "day" | "interval" | "unknown";

/** Decimal-safe time value: numbers are stored as strings in records. */
export interface TemporalValue {
  frame: TemporalFrame;
  unit?: "s" | "yr" | "kyr" | "Myr" | "Gyr" | "ka" | "Ma";
  value: string | null;
  lower_bound: string | null;
  upper_bound: string | null;
  model_ref?: string | null;
  precision: TimePrecision;
  uncertainty_note?: string;
}

export interface BaseRecord {
  schema_version: number;
  id: string;
  status: LifecycleStatus;
  revision?: number;
}

export interface ModuleManifest {
  schema_version: number;
  id: string; // module id equals directory name
  title: string;
  description?: string | undefined;
  /** Module maturity (distinct from record lifecycle status). */
  status: "proposed" | "draft" | "active" | "maintenance" | "archived";
  owners: string[];
  depends_on: string[];
  taxonomy_provider?: "uat" | null | undefined;
  locales: string[];
  review_policy: "science-and-education" | "science-only" | "engineering-only";
  planned?: boolean | undefined;
}

export interface ConceptRecord extends BaseRecord {
  module: string;
  title: string;
  summary?: string;
  aliases?: string[];
  taxonomy?: { provider: "uat"; term: string; version?: string }[];
  level_coverage?: ("L0" | "L1" | "L2" | "L3" | "L4" | "L5")[];
  related_concepts?: string[];
}

export interface ClaimRecord extends BaseRecord {
  module: string;
  concept: string;
  statement: string;
  evidence_status: EvidenceStatus;
  uncertainty?: { type?: "measurement-interval" | "confidence-level" | "model-range" | "unconstrained"; note?: string };
  limitations?: string;
  contradicted_by?: string[];
  evidence_refs?: string[];
  source_refs?: string[];
  reviewed_at?: string;
  superseded_by?: string;
}

export interface SourceRecord extends BaseRecord {
  title: string;
  url?: string;
  doi?: string;
  provider?: string;
  authors?: string[];
  version?: string;
  released_at?: string;
  retrieved_at: string;
  rights: { mode: RightsMode; license?: string; note?: string };
  checksum?: string;
  superseded_by?: string;
}

export interface EvidenceRecord extends BaseRecord {
  claim: string;
  source: string;
  locator?: string;
  relation: "supports" | "challenges" | "context";
  method?: string;
  limitations?: string;
  uncertainty_note?: string;
}

export interface LessonRecord extends BaseRecord {
  module: string;
  title: string;
  level: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  concept_refs: string[];
  objectives?: string[];
  prerequisites?: string[];
  body?: string;
  exercises?: { id: string; prompt: string; hint?: string; solution?: string }[];
  reading_time_min?: number;
}

export interface DatasetRecord extends BaseRecord {
  title: string;
  provider: string;
  download_url: string;
  version?: string;
  released_at?: string;
  size_bytes?: number;
  format: "csv" | "fits" | "votable" | "json" | "ecsv" | "hdf5" | "netcdf" | "parquet" | "txt";
  rights: { mode: RightsMode; license?: string; attribution?: string };
  checksum?: string;
  units_note?: string;
  data_dictionary_url?: string;
}

export interface VisualizationRecord extends BaseRecord {
  title: string;
  renderer: "static-svg" | "css-animation" | "canvas-2d" | "webgl" | "notebook";
  representation:
    | "observational-data"
    | "processed-composite"
    | "simulation"
    | "model-output"
    | "artists-impression"
    | "schematic";
  dataset_refs?: string[];
  claim_refs?: string[];
  assumptions?: string;
  units_note?: string;
  renderer_version?: string;
  credit?: string;
  fallback?: { description: string; static_asset?: string; text_alternative?: string };
}

export interface HistoryEventRecord extends BaseRecord {
  experience: "cosmic-history";
  track:
    | "early-cosmic-history"
    | "cosmic-dawn"
    | "structure-evolution"
    | "solar-system"
    | "earth-biosphere"
    | "history-of-knowledge"
    | "space-exploration"
    | "future-scenarios";
  title: string;
  summary?: string;
  time: TemporalValue;
  claim_refs?: string[];
  evidence_refs?: string[];
  concept_refs?: string[];
  future_scenario?: boolean;
}

export interface ResearchQuestionRecord extends BaseRecord {
  module: string;
  question: string;
  context?: string;
  evidence_gap?: string;
  methods?: string[];
  required_skills?: string[];
  dataset_refs?: string[];
  source_refs?: string[];
  investigated_by?: string[];
  question_status?: "proposed" | "active" | "disputed" | "partially-resolved" | "resolved" | "superseded";
  question_status_note?: string;
}

export interface PathRecord extends BaseRecord {
  kind: "learning-path" | "research-path" | "career-path";
  title: string;
  goal: string;
  level: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  lesson_refs: string[];
  milestones?: { title: string; description?: string; lesson_refs?: string[] }[];
  alternatives?: string;
}

export interface CareerRecord extends BaseRecord {
  kind: "career" | "mission";
  title: string;
  institution?: string;
  jurisdiction?: string;
  region?: string;
  general_skills?: string[];
  current_requirements?: { requirement: string; checked_at: string; official_url?: string }[];
  mission_milestones?: { title: string; date?: string; note?: string }[];
  official_url?: string;
  checked_at?: string;
}

export interface ReviewDecisionRecord extends BaseRecord {
  record_id: string;
  record_sha256: string;
  reviewer: string;
  role: "subject-reviewer" | "educational-reviewer" | "rights-reviewer" | "data-maintainer";
  decision: "approve" | "reject" | "request-changes";
  decided_at: string;
  notes?: string;
  invalidated?: { reason: string; at: string };
}

export interface ReleaseManifest {
  schema_version: number;
  version: string;
  created_at: string;
  git_commit: string;
  contract_schema_version: number;
  module_revisions?: Record<string, number>;
  approved_record_count: Record<string, number>;
  source_versions?: { source_id: string; version?: string; retrieved_at: string }[];
  dependency_versions?: Record<string, string>;
  excluded: Record<string, number>;
  verification: {
    validate: "pass" | "fail" | "not-run";
    lint?: "pass" | "fail" | "not-run";
    typecheck?: "pass" | "fail" | "not-run";
    test: "pass" | "fail" | "not-run";
    build?: "pass" | "fail" | "not-run";
    e2e?: "pass" | "fail" | "not-run";
    test_summary?: string;
  };
  artifact: { kind: "local-tarball" | "github-artifact" | "none"; digest: string; note?: string };
  withdrawn_records?: string[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// Schema loading and validation
// ---------------------------------------------------------------------------

export type SchemaName = RecordType | "common";

export function loadSchemas(): Map<string, object> {
  const map = new Map<string, object>();
  for (const file of readdirSync(schemaDir)) {
    if (!file.endsWith(".schema.json")) continue;
    const raw = JSON.parse(readFileSync(join(schemaDir, file), "utf8")) as object;
    // _common.schema.json is the shared definitions file; everything else maps 1:1.
    const name = file.replace(/(^_)?\.schema\.json$/, "").replace(/^_/, "");
    map.set(name, raw);
  }
  return map;
}

export interface CompiledValidator {
  /** Validate a record against its schema. Returns errors (empty = valid). */
  validate(recordType: RecordType, record: unknown): string[];
  /** True when the record is schema-valid. */
  isValid(recordType: RecordType, record: unknown): boolean;
}

export function createValidator(): CompiledValidator {
  const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv);
  const schemas = loadSchemas();
  const common = schemas.get("common");
  if (!common) throw new Error("common.schema.json missing from contracts package");
  ajv.addSchema(common);
  const compiled = new Map<string, ValidateFunction>();
  for (const [name, schema] of schemas) {
    if (name === "common") continue;
    const fn = ajv.compile(schema);
    compiled.set(name, fn);
  }
  return {
    validate(recordType, record) {
      const fn = compiled.get(recordType);
      if (!fn) return [`unknown record type: ${recordType}`];
      const ok = fn(record);
      if (ok) return [];
      const errs = fn.errors ?? [];
      return errs.map((e) => `${e.instancePath || "<root>"} ${e.message ?? "(no message)"}`);
    },
    isValid(recordType, record) {
      return this.validate(recordType, record).length === 0;
    },
  };
}

/** Map a record's directory (plural) to its contract type. */
export function recordTypeFromDir(dir: string): RecordType | null {
  const map: Record<string, RecordType> = {
    concepts: "concept",
    claims: "claim",
    sources: "source",
    evidence: "evidence",
    lessons: "lesson",
    datasets: "dataset",
    visualizations: "visualization",
    "research-questions": "research-question",
    paths: "path",
    careers: "career",
  };
  return map[dir] ?? null;
}

/** Map a record type to its owning directory (plural) inside a module. */
export function dirFromRecordType(type: RecordType): string | null {
  const map: Partial<Record<RecordType, string>> = {
    concept: "concepts",
    claim: "claims",
    source: "sources",
    evidence: "evidence",
    lesson: "lessons",
    dataset: "datasets",
    visualization: "visualizations",
    "research-question": "research-questions",
    path: "paths",
    career: "careers",
  };
  return map[type] ?? null;
}
