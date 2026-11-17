/**
 * Fail-closed approved projection.
 *
 * The projection is the ONLY input to site data, search indexing and builds.
 * It excludes, unconditionally:
 *
 * - records whose lifecycle status is not approved/published,
 * - records from modules with no registered owners (draft-only modules),
 * - test fixtures (any record ID containing the "fixture" namespace marker),
 * - quarantined ingestion candidates (never loaded here at all),
 * - restricted media and review-decision payloads.
 *
 * Any validation error in the underlying registry blocks projection entirely
 * (throw) rather than degrading to a partial publish. The projection is also
 * deterministic: identical inputs yield identical output.
 */
import type { LifecycleStatus, RecordType } from "@universe/contracts";
import type { Registry, LoadedRecord, AnyRecord } from "./registry.js";
import { hasErrors } from "./registry.js";

/** Marker identifying synthetic test fixtures (never science). */
export const FIXTURE_MARKER = "fixture";

export interface ProjectionStats {
  modules: number;
  records: number;
  excluded: Record<string, number>;
}

export interface ApprovedProjection {
  modules: {
    id: string;
    title: string;
    description?: string;
    status: string;
    planned: boolean;
    recordCount: number;
  }[];
  experiences: {
    id: string;
    title: string;
    recordCount: number;
  }[];
  records: Map<string, LoadedRecord>;
  stats: ProjectionStats;
}

/** Records that may never appear in public output, by lifecycle. */
const PUBLISHABLE: ReadonlySet<string> = new Set(["approved", "published"]);

/** A record is a synthetic fixture when its ID carries the fixture marker. */
export function isFixture(recordOrId: LoadedRecord | string): boolean {
  const id = typeof recordOrId === "string" ? recordOrId : recordOrId.id;
  const parts = id.split(".");
  return parts.includes(FIXTURE_MARKER);
}

/** Reasons a record can be excluded, tracked for the coverage report. */
export type ExclusionReason =
  | "lifecycle-not-publishable"
  | "module-without-owners"
  | "fixture"
  | "restricted-media"
  | "withdrawn-or-deprecated";

function classifyExclusion(record: LoadedRecord, registry: Registry): ExclusionReason {
  const status = record.record.status as LifecycleStatus;
  if (status === "withdrawn" || status === "deprecated") return "withdrawn-or-deprecated";
  if (isFixture(record)) return "fixture";
  const mod = registry.modules.get(record.owner);
  if (mod && (mod.manifest.owners as string[] | undefined)?.length === 0) return "module-without-owners";
  if (!PUBLISHABLE.has(status)) return "lifecycle-not-publishable";
  return "lifecycle-not-publishable";
}

/**
 * Build the approved projection. Throws when the registry has validation
 * errors — fail closed, never a partial public state.
 */
export function buildApprovedProjection(registry: Registry): ApprovedProjection {
  if (hasErrors(registry)) {
    throw new Error(
      `cannot build approved projection: registry has validation errors (first: ${registry.findings.find((f) => f.severity === "error")?.message ?? "unknown"})`,
    );
  }

  const excluded: Record<string, number> = {};
  const bump = (reason: ExclusionReason): void => {
    excluded[reason] = (excluded[reason] ?? 0) + 1;
  };

  const records = new Map<string, LoadedRecord>();
  for (const m of registry.modules.values()) {
    const owners = (m.manifest.owners as string[] | undefined) ?? [];
    const ownedModule = owners.length > 0;
    for (const r of m.records) {
      if (isFixture(r)) {
        bump("fixture");
        continue;
      }
      if (!ownedModule) {
        bump("module-without-owners");
        continue;
      }
      const status = r.record.status as LifecycleStatus;
      if (status === "withdrawn" || status === "deprecated") {
        bump("withdrawn-or-deprecated");
        continue;
      }
      if (!PUBLISHABLE.has(status)) {
        bump("lifecycle-not-publishable");
        continue;
      }
      // Restricted media check: visualization records with restricted rights.
      if (r.type === "visualization" && (r.record as { rights?: { mode?: string } }).rights?.mode === "restricted") {
        bump("restricted-media");
        continue;
      }
      records.set(r.id, r);
    }
  }

  const experiences: ApprovedProjection["experiences"] = [];
  for (const x of registry.experiences.values()) {
    let count = 0;
    for (const r of x.records) {
      if (isFixture(r)) {
        bump("fixture");
        continue;
      }
      const status = r.record.status as LifecycleStatus;
      if (status === "withdrawn" || status === "deprecated") {
        bump("withdrawn-or-deprecated");
        continue;
      }
      if (!PUBLISHABLE.has(status)) {
        bump("lifecycle-not-publishable");
        continue;
      }
      records.set(r.id, r);
      count += 1;
    }
    experiences.push({ id: x.id, title: x.manifest.title as string, recordCount: count });
  }

  const modules: ApprovedProjection["modules"] = [];
  for (const m of registry.modules.values()) {
    let count = 0;
    for (const r of records.values()) {
      if (r.owner === m.id) count += 1;
    }
    modules.push({
      id: m.id,
      title: m.manifest.title as string,
      ...(m.manifest.description !== undefined ? { description: m.manifest.description as string } : {}),
      status: m.manifest.status as string,
      planned: m.manifest.planned === true,
      recordCount: count,
    });
  }

  return {
    modules,
    experiences,
    records,
    stats: { modules: modules.length, records: records.size, excluded },
  };
}
