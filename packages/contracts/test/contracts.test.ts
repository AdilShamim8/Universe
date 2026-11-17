import { describe, expect, it } from "vitest";
import { createValidator, RECORD_TYPES, recordTypeFromDir, dirFromRecordType } from "../src/index.js";

const v = createValidator();

describe("contracts: schema compilation", () => {
  it("compiles every record-type schema without throwing", () => {
    for (const t of RECORD_TYPES) {
      expect(() => v.validate(t, {}), `schema ${t} should compile`).not.toThrow();
    }
  });

  it("maps record types to directories and back", () => {
    for (const t of RECORD_TYPES) {
      const dir = dirFromRecordType(t);
      if (dir) expect(recordTypeFromDir(dir)).toBe(t);
    }
    expect(recordTypeFromDir("concepts")).toBe("concept");
    expect(recordTypeFromDir("nope")).toBeNull();
  });
});

describe("contracts: valid representative records", () => {
  it("accepts a well-formed module manifest", () => {
    expect(
      v.isValid("module", {
        schema_version: 1,
        id: "cosmology",
        title: "Cosmology",
        status: "draft",
        owners: [],
        depends_on: ["foundations"],
        locales: ["en"],
        review_policy: "science-and-education",
      })
    ).toBe(true);
  });

  it("accepts a history event with unknown time (null value, not zero)", () => {
    expect(
      v.isValid("history-event", {
        schema_version: 1,
        id: "event.fixture.example",
        experience: "cosmic-history",
        track: "cosmic-dawn",
        title: "Fixture event (non-science)",
        time: { frame: "cosmic-age", unit: "yr", value: null, lower_bound: null, upper_bound: null, model_ref: null, precision: "unknown", uncertainty_note: "Fixture." },
        status: "draft",
      })
    ).toBe(true);
  });

  it("accepts decimal-string time bounds (not JSON floats)", () => {
    expect(
      v.isValid("history-event", {
        schema_version: 1,
        id: "event.fixture.example-2",
        experience: "cosmic-history",
        track: "early-cosmic-history",
        title: "Fixture interval",
        time: { frame: "cosmic-age", unit: "Gyr", value: null, lower_bound: "13.6", upper_bound: "13.8", precision: "interval" },
        status: "draft",
      })
    ).toBe(true);
  });

  it("accepts a minimal review decision bound to a record hash", () => {
    expect(
      v.isValid("review-decision", {
        schema_version: 1,
        id: "review.fixture.example",
        record_id: "claim.fixture.example",
        record_sha256: "a".repeat(64),
        reviewer: "reviewer.fixture",
        role: "subject-reviewer",
        decision: "approve",
        decided_at: "2026-11-17",
      })
    ).toBe(true);
  });
});

describe("contracts: invalid representative records (fail-closed)", () => {
  it("rejects http:// URLs", () => {
    const errs = v.validate("source", {
      schema_version: 1,
      id: "source.fixture.example",
      title: "Fixture source",
      url: "http://example.com/x",
      rights: { mode: "link-only" },
      retrieved_at: "2026-11-17",
      status: "draft",
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it("rejects a source without rights", () => {
    const errs = v.validate("source", {
      schema_version: 1,
      id: "source.fixture.example",
      title: "No rights",
      retrieved_at: "2026-11-17",
      status: "draft",
    });
    expect(errs.join("\n")).toContain("rights");
  });

  it("rejects non-constant schema_version", () => {
    expect(v.isValid("module", {
      schema_version: 2,
      id: "x-module",
      title: "X",
      status: "draft",
      owners: [],
      depends_on: [],
      locales: ["en"],
      review_policy: "science-only",
    })).toBe(false);
  });

  it("rejects unknown evidence status and lifecycle status", () => {
    expect(v.isValid("claim", {
      schema_version: 1,
      id: "claim.fixture.example",
      module: "cosmology",
      concept: "concept.fixture.example",
      statement: "fixture",
      evidence_status: "definitely-true",
      status: "draft",
    })).toBe(false);
    expect(v.isValid("claim", {
      schema_version: 1,
      id: "claim.fixture.example",
      module: "cosmology",
      concept: "concept.fixture.example",
      statement: "fixture",
      evidence_status: "established",
      status: "ultra-published",
    })).toBe(false);
  });

  it("rejects float time values (must be decimal strings or null)", () => {
    expect(v.isValid("history-event", {
      schema_version: 1,
      id: "event.fixture.example-3",
      experience: "cosmic-history",
      track: "solar-system",
      title: "Bad numeric",
      time: { frame: "geological", unit: "Myr", value: 4.5, precision: "interval" },
      status: "draft",
    })).toBe(false);
  });

  it("rejects review decisions with malformed hashes", () => {
    expect(v.isValid("review-decision", {
      schema_version: 1,
      id: "review.fixture.example-2",
      record_id: "claim.fixture.example",
      record_sha256: "not-a-hash",
      reviewer: "reviewer.fixture",
      role: "subject-reviewer",
      decision: "approve",
      decided_at: "2026-11-17",
    })).toBe(false);
  });
});
