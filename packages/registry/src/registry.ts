/**
 * Deterministic registry discovery and validation.
 *
 * Discovers modules ("modules/<name>/module.yaml"), experiences
 * ("experiences/<name>/experience.yaml"), and global registries (sources
 * allowlist, reviewer roster, redirects, taxonomy). Validates schema
 * conformance (via contracts), unique IDs, reference integrity, lifecycle
 * coherence, prerequisite DAGs (semantic "related_to" cycles are allowed;
 * "requires" cycles are not), and review decisions bound to record content
 * hashes.
 *
 * Everything here is fail-closed: any error-severity finding blocks the
 * approved projection (see projection.ts), which is the only input to site
 * data, search indexing, and builds.
 */
import { readFileSync, readdirSync, statSync, existsSync, type Stats } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  createValidator,
  MODULE_RECORD_TYPES,
  dirFromRecordType,
  recordTypeFromDir,
  type RecordType,
  type ReviewDecisionRecord,
  type TemporalValue,
} from "@universe/contracts";
import { computeRecordHash } from "./canonical.js";
import { parseTime, TemporalError, type ParsedTime } from "./temporal.js";

/** Repository root (three levels up from this compiled file's package). */
export const REGISTRY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export type Severity = "error" | "warning";

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
  ref?: string;
  file?: string;
}

export type AnyRecord = Record<string, unknown>;

export interface LoadedRecord {
  type: RecordType;
  id: string;
  record: AnyRecord;
  file: string;
  hash: string;
  parsedTime?: ParsedTime;
  /** Owning module or experience id. */
  owner: string;
}

export interface ModuleEntry {
  id: string;
  manifest: AnyRecord;
  file: string;
  records: LoadedRecord[];
}

export interface ExperienceEntry {
  id: string;
  manifest: AnyRecord;
  file: string;
  records: LoadedRecord[];
}

export interface ReviewerEntry {
  id: string;
  data: AnyRecord;
  file: string;
}

export interface SourceAllowlistEntry {
  id: string;
  data: AnyRecord;
  file: string;
}

export interface RedirectEntry {
  slug: string;
  target: string;
  file: string;
}

export interface Registry {
  modules: Map<string, ModuleEntry>;
  experiences: Map<string, ExperienceEntry>;
  reviewers: Map<string, ReviewerEntry>;
  sourceAllowlist: Map<string, SourceAllowlistEntry>;
  redirects: Map<string, RedirectEntry>;
  reviewDecisions: LoadedRecord[];
  taxonomy: AnyRecord | null;
  taxonomyFile: string | null;
  findings: Finding[];
  stats: {
    modules: number;
    experiences: number;
    records: number;
    reviewDecisions: number;
  };
}

/** Record subdirectories inside an experience directory. */
const EXPERIENCE_SUBDIRS: Record<string, RecordType> = {
  events: "history-event",
  paths: "path",
  tracks: "path",
  careers: "career",
  questions: "research-question",
  concepts: "concept",
  lessons: "lesson",
  visualizations: "visualization",
  datasets: "dataset",
};

/** Reference fields per record type: field → expected target record type. */
const REFERENCE_FIELDS: Partial<Record<RecordType, { field: string; targetType: RecordType }[]>> = {
  claim: [
    { field: "concept", targetType: "concept" },
    { field: "evidence_refs", targetType: "evidence" },
    { field: "source_refs", targetType: "source" },
  ],
  evidence: [
    { field: "claim", targetType: "claim" },
    { field: "source", targetType: "source" },
  ],
  lesson: [
    { field: "concept_refs", targetType: "concept" },
    { field: "prerequisites", targetType: "lesson" },
  ],
  "research-question": [
    { field: "dataset_refs", targetType: "dataset" },
    { field: "source_refs", targetType: "source" },
  ],
  visualization: [
    { field: "dataset_refs", targetType: "dataset" },
    { field: "claim_refs", targetType: "claim" },
  ],
  path: [{ field: "lesson_refs", targetType: "lesson" }],
  "history-event": [
    { field: "claim_refs", targetType: "claim" },
    { field: "evidence_refs", targetType: "evidence" },
    { field: "concept_refs", targetType: "concept" },
  ],
};

function relPath(root: string, file: string): string {
  return file.startsWith(root) ? file.slice(root.length + 1) : file;
}

function readYamlOrJson(path: string): unknown {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".json")) return JSON.parse(text);
  return parseYaml(text);
}

function listFiles(dir: string, depth = 0): string[] {
  const out: string[] = [];
  if (!existsSync(dir) || depth > 3) return out;
  for (const entry of readdirSync(dir).sort()) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let st: Stats;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...listFiles(full, depth + 1));
    } else if (entry.endsWith(".yaml") || entry.endsWith(".yml") || entry.endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}

function loadRecordFile(
  file: string,
  type: RecordType,
  root: string,
  owner: string,
  validator: ReturnType<typeof createValidator>,
  sink: LoadedRecord[],
  findings: Finding[],
): void {
  const rel = relPath(root, file);
  let record: AnyRecord;
  try {
    const parsed = readYamlOrJson(file);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      findings.push({ severity: "error", code: "record-not-object", message: `${type}: record is not a mapping`, file: rel });
      return;
    }
    record = parsed as AnyRecord;
  } catch (e) {
    findings.push({ severity: "error", code: "record-parse-error", message: `${type}: ${(e as Error).message}`, file: rel });
    return;
  }
  const errs = validator.validate(type, record);
  if (errs.length > 0) {
    findings.push({ severity: "error", code: "record-schema-invalid", message: `${type}: ${errs.join("; ")}`, file: rel });
    return;
  }
  const id = record.id as string;
  const hash = computeRecordHash(record);
  const loaded: LoadedRecord = { type, id, record, file: rel, hash, owner };
  if (type === "history-event") {
    try {
      loaded.parsedTime = parseTime(record.time as TemporalValue);
    } catch (e) {
      if (e instanceof TemporalError) {
        findings.push({ severity: "error", code: "temporal-invalid", message: `${id}: ${e.message}`, file: rel });
        return;
      }
      throw e;
    }
  }
  sink.push(loaded);
}

/** Discover and load the entire registry from a repository root. */
export function discoverRegistry(root = REGISTRY_ROOT): Registry {
  const validator = createValidator();
  const findings: Finding[] = [];
  const modules = new Map<string, ModuleEntry>();
  const experiences = new Map<string, ExperienceEntry>();
  const reviewers = new Map<string, ReviewerEntry>();
  const sourceAllowlist = new Map<string, SourceAllowlistEntry>();
  const redirects = new Map<string, RedirectEntry>();
  const reviewDecisions: LoadedRecord[] = [];
  let taxonomy: AnyRecord | null = null;
  let taxonomyFile: string | null = null;

  // --- modules/*/module.yaml ---
  const modulesDir = join(root, "modules");
  if (existsSync(modulesDir)) {
    for (const dir of readdirSync(modulesDir).sort()) {
      const manifestPath = join(modulesDir, dir, "module.yaml");
      if (!existsSync(manifestPath)) continue;
      const rel = relPath(root, manifestPath);
      let manifest: AnyRecord;
      try {
        const parsed = readYamlOrJson(manifestPath);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("manifest is not a mapping");
        manifest = parsed as AnyRecord;
      } catch (e) {
        findings.push({ severity: "error", code: "module-parse-error", message: (e as Error).message, file: rel });
        continue;
      }
      const errs = validator.validate("module", manifest);
      if (errs.length > 0) {
        findings.push({ severity: "error", code: "module-schema-invalid", message: errs.join("; "), file: rel });
        continue;
      }
      const id = manifest.id as string;
      if (id !== dir) {
        findings.push({ severity: "error", code: "module-id-directory-mismatch", message: `module id '${id}' must equal directory name '${dir}'`, file: rel });
        continue;
      }
      if (modules.has(id)) {
        findings.push({ severity: "error", code: "duplicate-module-id", message: `duplicate module id '${id}'`, file: rel });
        continue;
      }
      const entry: ModuleEntry = { id, manifest, file: rel, records: [] };
      for (const type of MODULE_RECORD_TYPES) {
        const sub = dirFromRecordType(type);
        if (!sub) continue;
        const recordDir = join(modulesDir, dir, sub);
        for (const file of listFiles(recordDir)) {
          loadRecordFile(file, type, root, id, validator, entry.records, findings);
        }
      }
      if (entry.manifest.owners !== undefined && (entry.manifest.owners as string[]).length === 0) {
        findings.push({ severity: "warning", code: "module-no-owners", message: `module '${id}' has no registered owners; its content is draft-only and cannot be published`, file: rel });
      }
      modules.set(id, entry);
    }
  }

  // --- experiences/*/experience.yaml ---
  const expDir = join(root, "experiences");
  if (existsSync(expDir)) {
    for (const dir of readdirSync(expDir).sort()) {
      const manifestPath = join(expDir, dir, "experience.yaml");
      if (!existsSync(manifestPath)) continue;
      const rel = relPath(root, manifestPath);
      let manifest: AnyRecord;
      try {
        const parsed = readYamlOrJson(manifestPath);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("manifest is not a mapping");
        manifest = parsed as AnyRecord;
      } catch (e) {
        findings.push({ severity: "error", code: "experience-parse-error", message: (e as Error).message, file: rel });
        continue;
      }
      const id = manifest.id;
      if (typeof id !== "string" || id !== dir) {
        findings.push({ severity: "error", code: "experience-id-directory-mismatch", message: `experience id '${String(id)}' must equal directory name '${dir}'`, file: rel });
        continue;
      }
      if (typeof manifest.title !== "string" || manifest.title.length === 0) {
        findings.push({ severity: "error", code: "experience-missing-title", message: `experience '${id}' missing non-empty title`, file: rel });
        continue;
      }
      if (experiences.has(id)) {
        findings.push({ severity: "error", code: "duplicate-experience-id", message: `duplicate experience id '${id}'`, file: rel });
        continue;
      }
      const entry: ExperienceEntry = { id, manifest, file: rel, records: [] };
      for (const [sub, type] of Object.entries(EXPERIENCE_SUBDIRS)) {
        const recordDir = join(expDir, dir, sub);
        for (const file of listFiles(recordDir)) {
          loadRecordFile(file, type, root, id, validator, entry.records, findings);
        }
      }
      experiences.set(id, entry);
    }
  }

  // --- registries/sources: ingestion allowlist (operator config, not source records) ---
  for (const file of listFiles(join(root, "registries", "sources"))) {
    const rel = relPath(root, file);
    let parsed: unknown;
    try {
      parsed = readYamlOrJson(file);
    } catch (e) {
      findings.push({ severity: "error", code: "source-registry-parse-error", message: (e as Error).message, file: rel });
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const obj = parsed as AnyRecord;
    // Accept either a single entry ({ id, ... }) or a list file ({ sources: [ ... ] }).
    const entries: AnyRecord[] = [];
    if (Array.isArray(obj.sources)) {
      for (const item of obj.sources) {
        if (item !== null && typeof item === "object" && !Array.isArray(item)) entries.push(item as AnyRecord);
      }
    } else if (typeof obj.id === "string") {
      entries.push(obj);
    }
    for (const data of entries) {
      const id = data.id;
      if (typeof id !== "string" || id.length === 0) {
        findings.push({ severity: "error", code: "source-registry-missing-id", message: "allowlist entry missing id", file: rel });
        continue;
      }
      if (sourceAllowlist.has(id)) {
        findings.push({ severity: "error", code: "duplicate-source-id", message: `duplicate allowlist id '${id}'`, file: rel });
        continue;
      }
      sourceAllowlist.set(id, { id, data, file: rel });
    }
  }

  // --- registries/reviewers: roster + decisions/ ---
  const reviewersDir = join(root, "registries", "reviewers");
  for (const file of listFiles(reviewersDir)) {
    if (relPath(root, file).split(/[\\/]/).includes("decisions")) continue;
    const rel = relPath(root, file);
    let parsed: unknown;
    try {
      parsed = readYamlOrJson(file);
    } catch (e) {
      findings.push({ severity: "error", code: "reviewer-parse-error", message: (e as Error).message, file: rel });
      continue;
    }
    // The roster file lists entries under `reviewers:`; single-entry files also work.
    const candidates: AnyRecord[] = [];
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as AnyRecord;
      const list = obj.reviewers;
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item !== null && typeof item === "object" && !Array.isArray(item)) candidates.push(item as AnyRecord);
        }
      } else if (typeof obj.id === "string") {
        candidates.push(obj);
      }
    }
    for (const item of candidates) {
      const id = item.id;
      if (typeof id !== "string" || id.length === 0) {
        findings.push({ severity: "error", code: "reviewer-missing-id", message: "reviewer entry missing id", file: rel });
        continue;
      }
      if (reviewers.has(id)) {
        findings.push({ severity: "error", code: "duplicate-reviewer-id", message: `duplicate reviewer id '${id}'`, file: rel });
        continue;
      }
      reviewers.set(id, { id, data: item, file: rel });
    }
  }
  for (const file of listFiles(join(reviewersDir, "decisions"))) {
    const rel = relPath(root, file);
    let data: AnyRecord | null = null;
    try {
      const parsed = readYamlOrJson(file);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as AnyRecord;
    } catch (e) {
      findings.push({ severity: "error", code: "review-decision-parse-error", message: (e as Error).message, file: rel });
    }
    if (!data) continue;
    const errs = validator.validate("review-decision", data);
    if (errs.length > 0) {
      findings.push({ severity: "error", code: "review-decision-schema-invalid", message: errs.join("; "), file: rel });
      continue;
    }
    const id = data.id as string;
    if (reviewDecisions.some((d) => d.id === id)) {
      findings.push({ severity: "error", code: "duplicate-review-decision-id", message: `duplicate review decision id '${id}'`, file: rel });
      continue;
    }
    reviewDecisions.push({ type: "review-decision", id, record: data, file: rel, hash: computeRecordHash(data), owner: "registries" });
  }

  // --- registries/redirects/redirects.yaml ---
  const redirectsFile = join(root, "registries", "redirects", "redirects.yaml");
  if (existsSync(redirectsFile)) {
    const rel = relPath(root, redirectsFile);
    let data: AnyRecord | null = null;
    try {
      const parsed = readYamlOrJson(redirectsFile);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as AnyRecord;
    } catch (e) {
      findings.push({ severity: "error", code: "redirects-parse-error", message: (e as Error).message, file: rel });
    }
    if (data) {
      const list = data.redirects;
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
          const r = item as { slug?: unknown; target?: unknown };
          if (typeof r.slug !== "string" || typeof r.target !== "string" || r.slug.length === 0 || r.target.length === 0) {
            findings.push({ severity: "error", code: "redirect-missing-fields", message: "redirect entry missing slug or target", file: rel });
            continue;
          }
          if (redirects.has(r.slug)) {
            findings.push({ severity: "error", code: "duplicate-redirect-slug", message: `duplicate redirect slug '${r.slug}'`, file: rel });
            continue;
          }
          redirects.set(r.slug, { slug: r.slug, target: r.target, file: rel });
        }
      } else {
        findings.push({ severity: "error", code: "redirects-not-a-list", message: "redirects.yaml must contain a 'redirects' array", file: rel });
      }
    }
  }

  // --- registries/taxonomy/taxonomy.yaml ---
  const taxonomyPath = join(root, "registries", "taxonomy", "taxonomy.yaml");
  if (existsSync(taxonomyPath)) {
    const rel = relPath(root, taxonomyPath);
    try {
      const parsed = readYamlOrJson(taxonomyPath);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        taxonomy = parsed as AnyRecord;
        taxonomyFile = rel;
      }
    } catch (e) {
      findings.push({ severity: "error", code: "taxonomy-parse-error", message: (e as Error).message, file: rel });
    }
  }

  const registry: Registry = {
    modules,
    experiences,
    reviewers,
    sourceAllowlist,
    redirects,
    reviewDecisions,
    taxonomy,
    taxonomyFile,
    findings,
    stats: {
      modules: modules.size,
      experiences: experiences.size,
      records: countRecords(modules, experiences),
      reviewDecisions: reviewDecisions.length,
    },
  };

  validateRegistry(registry);
  return registry;
}

function countRecords(modules: Map<string, ModuleEntry>, experiences: Map<string, ExperienceEntry>): number {
  let n = 0;
  for (const m of modules.values()) n += m.records.length;
  for (const x of experiences.values()) n += x.records.length;
  return n;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Run all semantic validation passes over a discovered registry. */
export function validateRegistry(registry: Registry): void {
  const { findings } = registry;

  // Global record index with duplicate detection.
  const recordIndex = new Map<string, LoadedRecord>();
  const addAll = (records: LoadedRecord[]): void => {
    for (const r of records) {
      if (recordIndex.has(r.id)) {
        findings.push({
          severity: "error",
          code: "duplicate-record-id",
          message: `record id '${r.id}' is used more than once (first: ${recordIndex.get(r.id)!.file}, again: ${r.file})`,
          ref: r.id,
          file: r.file,
        });
      } else {
        recordIndex.set(r.id, r);
      }
    }
  };
  for (const m of registry.modules.values()) addAll(m.records);
  for (const x of registry.experiences.values()) addAll(x.records);

  // Module-scoped records must declare the owning module.
  for (const m of registry.modules.values()) {
    for (const r of m.records) {
      const declared = r.record.module;
      if (typeof declared === "string" && declared !== m.id) {
        findings.push({
          severity: "error",
          code: "record-module-mismatch",
          message: `record '${r.id}' declares module '${declared}' but lives in module '${m.id}'`,
          ref: r.id,
          file: r.file,
        });
      }
    }
  }

  // Experience-scoped records must declare the owning experience.
  for (const x of registry.experiences.values()) {
    for (const r of x.records) {
      const declared = r.record.experience;
      if (typeof declared === "string" && declared !== x.id) {
        findings.push({
          severity: "error",
          code: "record-experience-mismatch",
          message: `record '${r.id}' declares experience '${declared}' but lives in experience '${x.id}'`,
          ref: r.id,
          file: r.file,
        });
      }
      // Future projections must be separated from known history.
      if (r.type === "history-event") {
        const track = r.record.track;
        const future = r.record.future_scenario === true;
        if (future && track !== "future-scenarios") {
          findings.push({
            severity: "error",
            code: "future-scenario-misplaced",
            message: `event '${r.id}' is marked future_scenario but sits in track '${String(track)}'; conditional projections belong to the future-scenarios track`,
            ref: r.id,
            file: r.file,
          });
        }
        if (!future && track === "future-scenarios") {
          findings.push({
            severity: "error",
            code: "future-track-requires-flag",
            message: `event '${r.id}' sits in the future-scenarios track but is not marked future_scenario: true`,
            ref: r.id,
            file: r.file,
          });
        }
      }
    }
  }

  // Reference integrity with expected types.
  for (const r of recordIndex.values()) {
    const fields = REFERENCE_FIELDS[r.type] ?? [];
    for (const { field, targetType } of fields) {
      const value = r.record[field];
      if (value === undefined || value === null) continue;
      const ids = Array.isArray(value) ? (value as unknown[]) : [value];
      for (const refId of ids) {
        if (typeof refId !== "string") {
          findings.push({ severity: "error", code: "reference-not-a-string", message: `${r.type} '${r.id}' field '${field}' contains a non-string reference`, ref: r.id, file: r.file });
          continue;
        }
        const target = recordIndex.get(refId);
        if (!target) {
          findings.push({
            severity: "error",
            code: "dangling-reference",
            message: `${r.type} '${r.id}' references missing ${field} → '${refId}'`,
            ref: r.id,
            file: r.file,
          });
          continue;
        }
        if (target.type !== targetType) {
          findings.push({
            severity: "error",
            code: "reference-type-mismatch",
            message: `${r.type} '${r.id}' field '${field}' expects a ${targetType}, found ${target.type} ('${refId}')`,
            ref: r.id,
            file: r.file,
          });
        }
      }
    }
  }

  // Module dependency DAG (build-level cycles are fatal; semantic cycles are not checked here).
  {
    const color = new Map<string, 0 | 1 | 2>();
    const visit = (id: string, stack: string[]): void => {
      const state = color.get(id) ?? 0;
      if (state === 2) return;
      if (state === 1) {
        const cycle = [...stack.slice(stack.indexOf(id)), id].join(" → ");
        findings.push({ severity: "error", code: "module-dependency-cycle", message: `module dependency cycle: ${cycle}`, ref: id });
        return;
      }
      color.set(id, 1);
      const mod = registry.modules.get(id);
      if (mod) {
        const deps = mod.manifest.depends_on;
        if (Array.isArray(deps)) {
          for (const dep of deps) {
            if (typeof dep !== "string") continue;
            if (!registry.modules.has(dep)) {
              findings.push({ severity: "error", code: "missing-module-dependency", message: `module '${id}' depends on missing module '${dep}'`, ref: id, file: mod.file });
            } else {
              visit(dep, [...stack, dep]);
            }
          }
        }
      }
      color.set(id, 2);
    };
    for (const id of registry.modules.keys()) visit(id, []);
  }

  // Lesson prerequisite cycles (`requires` must be acyclic).
  {
    const lessons = [...recordIndex.values()].filter((r) => r.type === "lesson");
    const color = new Map<string, 0 | 1 | 2>();
    const visit = (id: string, stack: string[]): void => {
      const state = color.get(id) ?? 0;
      if (state === 2) return;
      if (state === 1) {
        const cycle = [...stack.slice(stack.indexOf(id)), id].join(" → ");
        findings.push({ severity: "error", code: "lesson-prerequisite-cycle", message: `lesson prerequisite cycle: ${cycle}`, ref: id });
        return;
      }
      color.set(id, 1);
      const rec = recordIndex.get(id);
      const prereqs = rec?.record.prerequisites;
      if (Array.isArray(prereqs)) {
        for (const p of prereqs) {
          if (typeof p === "string" && recordIndex.get(p)?.type === "lesson") visit(p, [...stack, id]);
        }
      }
      color.set(id, 2);
    };
    for (const l of lessons) visit(l.id, []);
  }

  // Path records: lesson_refs must be unique lessons.
  for (const r of recordIndex.values()) {
    if (r.type !== "path") continue;
    const refs = r.record.lesson_refs;
    if (!Array.isArray(refs)) continue;
    const seen = new Set<string>();
    for (const refId of refs) {
      if (typeof refId !== "string") continue;
      if (seen.has(refId)) {
        findings.push({ severity: "error", code: "duplicate-path-lesson", message: `path '${r.id}' lists lesson '${refId}' twice`, ref: r.id, file: r.file });
      }
      seen.add(refId);
      const target = recordIndex.get(refId);
      if (!target || target.type !== "lesson") {
        findings.push({ severity: "error", code: "path-lesson-missing", message: `path '${r.id}' references non-lesson or missing '${refId}'`, ref: r.id, file: r.file });
      }
    }
  }

  // Redirects: targets must be site routes or existing record IDs.
  for (const r of registry.redirects.values()) {
    if (r.target.startsWith("/")) {
      if (r.target.includes("//") || /[A-Z]/.test(r.target)) {
        findings.push({ severity: "warning", code: "redirect-target-suspect", message: `redirect '${r.slug}' target '${r.target}' looks unusual`, file: r.file });
      }
    } else if (!recordIndex.has(r.target)) {
      findings.push({ severity: "error", code: "dangling-redirect-target", message: `redirect '${r.slug}' targets unknown record '${r.target}'`, file: r.file });
    }
    if (`/${r.slug}` === r.target) {
      findings.push({ severity: "warning", code: "redirect-self-loop", message: `redirect '${r.slug}' points to itself`, file: r.file });
    }
  }

  // Review decisions: registered reviewer, existing target, matching hash.
  for (const d of registry.reviewDecisions) {
    const dec = d.record as unknown as ReviewDecisionRecord;
    const target = recordIndex.get(dec.record_id);
    if (!target) {
      findings.push({ severity: "error", code: "review-target-missing", message: `review decision '${d.id}' targets unknown record '${dec.record_id}'`, ref: d.id, file: d.file });
      continue;
    }
    if (!registry.reviewers.has(dec.reviewer)) {
      findings.push({ severity: "error", code: "reviewer-not-registered", message: `review decision '${d.id}' names unregistered reviewer '${dec.reviewer}'`, ref: d.id, file: d.file });
    }
    if (dec.record_sha256 !== target.hash) {
      findings.push({
        severity: "error",
        code: "review-hash-mismatch",
        message: `review decision '${d.id}' hash does not match current content of '${dec.record_id}' (record changed after review)`,
        ref: d.id,
        file: d.file,
      });
    }
    if (dec.invalidated) {
      findings.push({ severity: "warning", code: "review-invalidated", message: `review decision '${d.id}' is invalidated (${dec.invalidated.reason})`, ref: d.id, file: d.file });
    }
  }

  // Lifecycle coherence: approved/published records need a valid approving decision bound to the current hash.
  for (const r of recordIndex.values()) {
    const status = r.record.status;
    if (status !== "approved" && status !== "published") continue;
    const hasValidApproval = registry.reviewDecisions.some((d) => {
      const dec = d.record as unknown as ReviewDecisionRecord;
      return dec.record_id === r.id && dec.decision === "approve" && !dec.invalidated && dec.record_sha256 === r.hash;
    });
    if (!hasValidApproval) {
      findings.push({
        severity: "error",
        code: "approved-without-review",
        message: `record '${r.id}' has status '${String(status)}' but no valid approving review decision bound to its current content hash`,
        ref: r.id,
        file: r.file,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All records (module + experience) as a flat list. */
export function allRecords(registry: Registry): LoadedRecord[] {
  const out: LoadedRecord[] = [];
  for (const m of registry.modules.values()) out.push(...m.records);
  for (const x of registry.experiences.values()) out.push(...x.records);
  return out;
}

/** True when the registry has error-severity findings. */
export function hasErrors(registry: Registry): boolean {
  return registry.findings.some((f) => f.severity === "error");
}

/** Format findings for CLI output. */
export function formatFindings(findings: Finding[]): string {
  return findings.map((f) => `[${f.severity}] ${f.code}: ${f.message}${f.file ? ` (${f.file})` : ""}`).join("\n");
}

export { recordTypeFromDir };
