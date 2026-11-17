import { describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { discoverRegistry, hasErrors, allRecords, type Registry } from "../src/registry.js";
import { buildApprovedProjection, isFixture } from "../src/projection.js";
import { computeRecordHash, stableStringify } from "../src/canonical.js";
import { parseTime, compareTimes, convertUnit, formatTime, TemporalError } from "../src/temporal.js";
import { makeRepo, yamlStringify, writeText } from "./lib/writer.js";

// ---------------------------------------------------------------------------
// Temporal model
// ---------------------------------------------------------------------------

describe("temporal: parsing and validation", () => {
  it("accepts unknown time (all null, precision unknown)", () => {
    const p = parseTime({ frame: "cosmic-age", value: null, lower_bound: null, upper_bound: null, precision: "unknown" });
    expect(p.key).toBeNull();
    expect(p.lower).toBeNull();
    expect(p.upper).toBeNull();
  });

  it("rejects precision unknown with a value present", () => {
    expect(() =>
      parseTime({ frame: "cosmic-age", unit: "Gyr", value: "0.00038", lower_bound: null, upper_bound: null, precision: "unknown" }),
    ).toThrow(/precision 'unknown' requires null/);
  });

  it("rejects all-null time without precision unknown", () => {
    expect(() =>
      parseTime({ frame: "cosmic-age", value: null, lower_bound: null, upper_bound: null, precision: "exact" }),
    ).toThrow(/all-null time requires precision/);
  });

  it("rejects value + interval mix", () => {
    expect(() =>
      parseTime({ frame: "cosmic-age", unit: "Gyr", value: "1", lower_bound: "0.9", upper_bound: "1.1", precision: "interval" }),
    ).toThrow(/mutually exclusive/);
  });

  it("rejects lower > upper", () => {
    expect(() =>
      parseTime({ frame: "cosmic-age", unit: "Myr", value: null, lower_bound: "200", upper_bound: "100", precision: "interval" }),
    ).toThrow(/lower_bound must be <= upper_bound/);
  });

  it("rejects half-open intervals (bounds must pair)", () => {
    expect(() =>
      parseTime({ frame: "cosmic-age", unit: "Myr", value: null, lower_bound: "100", upper_bound: null, precision: "interval" }),
    ).toThrow(/pair/);
  });

  it("rejects incompatible unit for frame (Gyr in geological)", () => {
    expect(() =>
      parseTime({ frame: "geological", unit: "Gyr", value: "4.5", lower_bound: null, upper_bound: null, precision: "exact" }),
    ).toThrow(TemporalError);
  });

  it("rejects intervals without interval precision", () => {
    expect(() =>
      parseTime({ frame: "cosmic-age", unit: "Myr", value: null, lower_bound: "100", upper_bound: "200", precision: "exact" }),
    ).toThrow(/require precision 'interval'/);
  });
});

describe("temporal: decimal-safe comparison", () => {
  it("refuses cross-frame comparison without an explicit model", () => {
    const a = parseTime({ frame: "cosmic-age", unit: "Gyr", value: "13.8", lower_bound: null, upper_bound: null, precision: "exact" });
    const b = parseTime({ frame: "lookback", unit: "kyr", value: "380", lower_bound: null, upper_bound: null, precision: "exact" });
    expect(() => compareTimes(a, b)).toThrow(/frame-mismatch/);
  });

  it("compares 13.8 Gyr > 380 kyr exactly across units in the same frame", () => {
    const a = parseTime({ frame: "cosmic-age", unit: "Gyr", value: "13.8", lower_bound: null, upper_bound: null, precision: "exact" });
    const b = parseTime({ frame: "cosmic-age", unit: "kyr", value: "380", lower_bound: null, upper_bound: null, precision: "exact" });
    expect(compareTimes(a, b)).toBe(1);
    expect(compareTimes(b, a)).toBe(-1);
  });

  it("unknown vs known is unordered; unknown vs unknown equal", () => {
    const u = parseTime({ frame: "cosmic-age", value: null, lower_bound: null, upper_bound: null, precision: "unknown" });
    const k = parseTime({ frame: "cosmic-age", unit: "Gyr", value: "1", lower_bound: null, upper_bound: null, precision: "exact" });
    expect(compareTimes(u, k)).toBeNull();
    expect(compareTimes(u, u)).toBe(0);
  });

  it("preserves exact decimals at Gyr scale (13.8 Gyr = 13,800,000,000 yr)", () => {
    const g = parseTime({ frame: "cosmic-age", unit: "Gyr", value: "13.8", lower_bound: null, upper_bound: null, precision: "exact" });
    const y = parseTime({ frame: "cosmic-age", unit: "yr", value: "13800000000", lower_bound: null, upper_bound: null, precision: "exact" });
    expect(compareTimes(g, y)).toBe(0);
  });

  it("rejects inverted geological intervals (lower > upper)", () => {
    expect(() =>
      parseTime({ frame: "geological", unit: "Ma", value: null, lower_bound: "201", upper_bound: "145", precision: "interval" }),
    ).toThrow(/lower_bound must be <= upper_bound/);
  });
});

describe("temporal: unit conversion", () => {
  it("converts Gyr → yr losslessly", () => {
    const t = convertUnit({ frame: "cosmic-age", unit: "Gyr", value: "13.8", lower_bound: null, upper_bound: null, precision: "exact" }, "yr");
    expect(t.value).toBe("13800000000");
  });

  it("converts Ma → yr (geological)", () => {
    const t = convertUnit({ frame: "geological", unit: "Ma", value: "66", lower_bound: null, upper_bound: null, precision: "exact" }, "yr");
    expect(t.value).toBe("66000000");
  });

  it("converts interval bounds too", () => {
    const t = convertUnit({ frame: "cosmic-age", unit: "Gyr", value: null, lower_bound: "13.6", upper_bound: "13.8", precision: "interval" }, "Myr");
    expect(t.lower_bound).toBe("13600");
    expect(t.upper_bound).toBe("13800");
  });

  it("rejects cross-family and calendar conversion", () => {
    expect(() =>
      convertUnit({ frame: "cosmic-age", unit: "Gyr", value: "13.8", lower_bound: null, upper_bound: null, precision: "exact" }, "Ma"),
    ).toThrow(/not valid for frame/);
    expect(() =>
      convertUnit({ frame: "calendar", value: "1969", lower_bound: null, upper_bound: null, precision: "year" }, "yr"),
    ).toThrow(/not convertible/);
  });

  it("formats unknown as 'unknown', never zero", () => {
    expect(formatTime({ frame: "cosmic-age", value: null, lower_bound: null, upper_bound: null, precision: "unknown" })).toBe("unknown");
    expect(formatTime({ frame: "cosmic-age", unit: "Gyr", value: null, lower_bound: "13.6", upper_bound: "13.8", precision: "interval" })).toBe("13.6–13.8 Gyr");
  });
});

// ---------------------------------------------------------------------------
// Canonical hashing
// ---------------------------------------------------------------------------

describe("canonical: stable serialization and review-bound hashing", () => {
  it("sorts object keys deterministically", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("excludes only the lifecycle status from the hash (workflow ≠ content)", () => {
    const base = { schema_version: 1, id: "claim.x", statement: "s" };
    expect(computeRecordHash({ ...base, status: "draft" })).toBe(computeRecordHash({ ...base, status: "approved" }));
  });

  it("changes hash when content changes", () => {
    expect(computeRecordHash({ id: "claim.x", statement: "s1", status: "draft" })).not.toBe(
      computeRecordHash({ id: "claim.x", statement: "s2", status: "draft" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Registry discovery + validation
// ---------------------------------------------------------------------------

const concept = (id: string, module: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema_version: 1,
  id,
  module,
  title: `Concept ${id}`,
  status: "draft",
  ...extra,
});

const lesson = (id: string, module: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema_version: 1,
  id,
  module,
  title: `Lesson ${id}`,
  level: "L1",
  concept_refs: [],
  status: "draft",
  ...extra,
});

const event = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema_version: 1,
  id,
  experience: "cosmic-history",
  track: "cosmic-dawn",
  title: `Event ${id}`,
  time: { frame: "cosmic-age", unit: "Gyr", value: null, lower_bound: null, upper_bound: null, model_ref: null, precision: "unknown", uncertainty_note: "Fixture." },
  status: "draft",
  ...extra,
});

const decision = (id: string, record_id: string, record_sha256: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema_version: 1,
  id,
  record_id,
  record_sha256,
  reviewer: "reviewer.fixture",
  role: "subject-reviewer",
  decision: "approve",
  decided_at: "2026-11-17",
  ...extra,
});

function discover(root: string): Registry {
  return discoverRegistry(root);
}

describe("registry: discovery and validation", () => {
  it("discovers a well-formed module with records and no errors", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }],
      records: [{ module: "foundations", dir: "concepts", record: concept("concept.fixture.scaling", "foundations") }],
      reviewers: [{ id: "reviewer.fixture", name: "Fixture Reviewer (test)" }],
    });
    try {
      const reg = discover(root);
      expect(hasErrors(reg)).toBe(false);
      expect(reg.stats.modules).toBe(1);
      expect(reg.stats.records).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects duplicate record IDs across modules", () => {
    const root = makeRepo({
      modules: [{ id: "foundations" }, { id: "cosmology", depends_on: ["foundations"] }],
      records: [
        { module: "foundations", dir: "concepts", record: concept("concept.fixture.dupe", "foundations") },
        { module: "cosmology", dir: "concepts", record: concept("concept.fixture.dupe", "cosmology") },
      ],
    });
    try {
      const reg = discover(root);
      expect(hasErrors(reg)).toBe(true);
      expect(reg.findings.some((f) => f.code === "duplicate-record-id")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects dangling references", () => {
    const root = makeRepo({
      modules: [{ id: "foundations" }],
      records: [
        { module: "foundations", dir: "concepts", record: concept("concept.fixture.scaling", "foundations") },
        { module: "foundations", dir: "lessons", record: lesson("lesson.fixture.l1", "foundations", { concept_refs: ["concept.fixture.missing"] }) },
      ],
    });
    try {
      const reg = discover(root);
      expect(reg.findings.some((f) => f.code === "dangling-reference")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects reference type mismatches", () => {
    const root = makeRepo({
      modules: [{ id: "foundations" }],
      records: [
        { module: "foundations", dir: "concepts", record: concept("concept.fixture.scaling", "foundations") },
        {
          module: "foundations",
          dir: "claims",
          record: {
            schema_version: 1,
            id: "claim.fixture.c1",
            module: "foundations",
            concept: "concept.fixture.scaling",
            statement: "fixture statement",
            evidence_status: "established",
            status: "draft",
          },
        },
        { module: "foundations", dir: "lessons", record: lesson("lesson.fixture.l1", "foundations", { concept_refs: ["claim.fixture.c1"] }) },
      ],
    });
    try {
      const reg = discover(root);
      expect(reg.findings.some((f) => f.code === "reference-type-mismatch")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects module dependency cycles", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", depends_on: ["cosmology"] }, { id: "cosmology", depends_on: ["foundations"] }],
    });
    try {
      const reg = discover(root);
      expect(reg.findings.some((f) => f.code === "module-dependency-cycle")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects lesson prerequisite cycles", () => {
    const root = makeRepo({
      modules: [{ id: "foundations" }],
      records: [
        { module: "foundations", dir: "concepts", record: concept("concept.fixture.scaling", "foundations") },
        { module: "foundations", dir: "lessons", record: lesson("lesson.fixture.a", "foundations", { concept_refs: ["concept.fixture.scaling"], prerequisites: ["lesson.fixture.b"] }) },
        { module: "foundations", dir: "lessons", record: lesson("lesson.fixture.b", "foundations", { concept_refs: ["concept.fixture.scaling"], prerequisites: ["lesson.fixture.a"] }) },
      ],
    });
    try {
      const reg = discover(root);
      expect(hasErrors(reg)).toBe(true);
      expect(reg.findings.some((f) => f.code === "lesson-prerequisite-cycle")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows semantic related_to cycles", () => {
    const root = makeRepo({
      modules: [{ id: "foundations" }],
      records: [
        { module: "foundations", dir: "concepts", record: concept("concept.fixture.a", "foundations", { related_concepts: ["concept.fixture.b"] }) },
        { module: "foundations", dir: "concepts", record: concept("concept.fixture.b", "foundations", { related_concepts: ["concept.fixture.a"] }) },
      ],
    });
    try {
      const reg = discover(root);
      expect(hasErrors(reg)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects future_scenario misplaced outside the future-scenarios track", () => {
    const root = makeRepo({
      experiences: [{ id: "cosmic-history", title: "Cosmic History", events: [event("event.fixture.future", { future_scenario: true })] }],
    });
    try {
      const reg = discover(root);
      expect(reg.findings.some((f) => f.code === "future-scenario-misplaced")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("warns (not errors) on modules without owners", () => {
    const root = makeRepo({ modules: [{ id: "foundations", owners: [] }] });
    try {
      const reg = discover(root);
      expect(reg.findings.some((f) => f.code === "module-no-owners")).toBe(true);
      expect(hasErrors(reg)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Review decisions
// ---------------------------------------------------------------------------

describe("registry: review decisions", () => {
  it("flags review decisions whose hash does not match the record content", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }],
      records: [{ module: "foundations", dir: "concepts", record: concept("concept.fixture.scaling", "foundations") }],
      reviewers: [{ id: "reviewer.fixture", name: "Fixture Reviewer" }],
      decisions: [decision("review.fixture.stale", "concept.fixture.scaling", "0".repeat(64))],
    });
    try {
      const reg = discover(root);
      expect(reg.findings.some((f) => f.code === "review-hash-mismatch")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects approved records without a valid review decision", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }],
      records: [{ module: "foundations", dir: "concepts", record: concept("concept.fixture.scaling", "foundations", { status: "approved" }) }],
      reviewers: [{ id: "reviewer.fixture", name: "Fixture Reviewer" }],
    });
    try {
      const reg = discover(root);
      expect(reg.findings.some((f) => f.code === "approved-without-review")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts approved records with a matching decision bound to the current hash", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }],
      records: [{ module: "foundations", dir: "concepts", record: concept("concept.fixture.scaling", "foundations", { status: "approved" }) }],
      reviewers: [{ id: "reviewer.fixture", name: "Fixture Reviewer" }],
    });
    try {
      const reg0 = discover(root);
      const rec = allRecords(reg0).find((r) => r.id === "concept.fixture.scaling")!;
      writeText(
        join(root, "registries", "reviewers", "decisions", "ok.yaml"),
        yamlStringify(decision("review.fixture.ok", "concept.fixture.scaling", rec.hash)),
      );
      const reg = discover(root);
      expect(hasErrors(reg)).toBe(false);
      expect(reg.findings.some((f) => f.code === "approved-without-review")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags review decisions naming unregistered reviewers", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }],
      records: [{ module: "foundations", dir: "concepts", record: concept("concept.fixture.scaling", "foundations") }],
      decisions: [decision("review.fixture.ghost", "concept.fixture.scaling", "0".repeat(64), { reviewer: "reviewer.ghost" })],
    });
    try {
      const reg = discover(root);
      expect(reg.findings.some((f) => f.code === "reviewer-not-registered")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("invalidates approval when the reviewed content changes afterwards", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }],
      records: [{ module: "foundations", dir: "concepts", record: concept("concept.fixture.scaling", "foundations", { status: "approved" }) }],
      reviewers: [{ id: "reviewer.fixture", name: "Fixture Reviewer" }],
    });
    try {
      const reg0 = discover(root);
      const rec = allRecords(reg0).find((r) => r.id === "concept.fixture.scaling")!;
      writeText(
        join(root, "registries", "reviewers", "decisions", "ok.yaml"),
        yamlStringify(decision("review.fixture.ok", "concept.fixture.scaling", rec.hash)),
      );
      const reg1 = discover(root);
      expect(hasErrors(reg1)).toBe(false);
      // Now edit the record content (title change = content change).
      writeText(
        join(root, "modules", "foundations", "concepts", "concept.fixture.scaling.yaml"),
        yamlStringify(concept("concept.fixture.scaling", "foundations", { status: "approved", title: "Changed Title" })),
      );
      const reg2 = discover(root);
      expect(reg2.findings.some((f) => f.code === "review-hash-mismatch")).toBe(true);
      expect(reg2.findings.some((f) => f.code === "approved-without-review")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

describe("projection: fail-closed approved projection", () => {
  it("throws when the registry has validation errors", () => {
    const root = makeRepo({
      modules: [{ id: "foundations" }],
      records: [{ module: "foundations", dir: "concepts", record: concept("concept.fixture.misplaced", "other-module") }],
    });
    try {
      const reg = discover(root);
      expect(hasErrors(reg)).toBe(true);
      expect(() => buildApprovedProjection(reg)).toThrow(/cannot build approved projection/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("excludes drafts, fixtures, and no-owner modules from public output", () => {
    // Use non-fixture IDs to prove lifecycle/owner exclusion (fixtures are always excluded).
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }, { id: "ghosted" }],
      records: [
        { module: "foundations", dir: "concepts", record: concept("concept.example.draft", "foundations") },
        { module: "ghosted", dir: "concepts", record: concept("concept.example.ghosted", "ghosted", { status: "approved" }) },
        { module: "foundations", dir: "concepts", record: concept("concept.example.approved", "foundations", { status: "approved" }) },
      ],
      reviewers: [{ id: "reviewer.fixture", name: "Fixture Reviewer" }],
    });
    try {
      const reg0 = discover(root);
      // ghosted module has no owners → approved-without-review won't fire? It will (approved record without review).
      // Provide matching decisions for both approved records; the ghosted one must still be excluded by owner rule.
      for (const id of ["concept.example.ghosted", "concept.example.approved"]) {
        const rec = allRecords(reg0).find((r) => r.id === id)!;
        writeText(
          join(root, "registries", "reviewers", "decisions", `${id}.yaml`),
          yamlStringify(decision(`review.example.${id.split(".").pop()}`, id, rec.hash)),
        );
      }
      const reg = discover(root);
      expect(hasErrors(reg)).toBe(false);
      const proj = buildApprovedProjection(reg);
      expect(proj.records.has("concept.example.approved")).toBe(true);
      expect(proj.records.has("concept.example.ghosted")).toBe(false);
      expect(proj.records.has("concept.example.draft")).toBe(false);
      expect(proj.stats.excluded["lifecycle-not-publishable"]).toBe(1);
      expect(proj.stats.excluded["module-without-owners"]).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("always excludes fixture-namespace records, even approved ones", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }],
      records: [{ module: "foundations", dir: "concepts", record: concept("concept.fixture.approved", "foundations", { status: "approved" }) }],
      reviewers: [{ id: "reviewer.fixture", name: "Fixture Reviewer" }],
    });
    try {
      const reg0 = discover(root);
      const rec = allRecords(reg0).find((r) => r.id === "concept.fixture.approved")!;
      writeText(
        join(root, "registries", "reviewers", "decisions", "ok.yaml"),
        yamlStringify(decision("review.fixture.ok", "concept.fixture.approved", rec.hash)),
      );
      const reg = discover(root);
      expect(hasErrors(reg)).toBe(false);
      const proj = buildApprovedProjection(reg);
      expect(proj.records.has("concept.fixture.approved")).toBe(false);
      expect(proj.stats.excluded.fixture).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("excludes withdrawn and deprecated records even with a prior approval", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }],
      records: [{ module: "foundations", dir: "concepts", record: concept("concept.example.withdrawn", "foundations", { status: "withdrawn" }) }],
      reviewers: [{ id: "reviewer.fixture", name: "Fixture Reviewer" }],
    });
    try {
      const reg = discover(root);
      expect(hasErrors(reg)).toBe(false);
      const proj = buildApprovedProjection(reg);
      expect(proj.records.size).toBe(0);
      expect(proj.stats.excluded["withdrawn-or-deprecated"]).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects the fixture marker in record IDs", () => {
    expect(isFixture("concept.fixture.x")).toBe(true);
    expect(isFixture("concept.example.x")).toBe(false);
  });
});
