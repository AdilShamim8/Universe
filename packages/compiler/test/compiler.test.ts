import { describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { discoverRegistry, allRecords } from "@universe/registry";
import { buildApprovedProjection } from "@universe/registry";
import { compileSiteData, SECTIONS, routeForRecord, readPlannedDomains } from "../src/index.js";
import { makeRepo, yamlStringify, writeText } from "../../registry/test/lib/writer.js";

const concept = (id: string, module: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema_version: 1,
  id,
  module,
  title: `Concept ${id}`,
  status: "draft",
  ...extra,
});

const decision = (id: string, record_id: string, record_sha256: string): Record<string, unknown> => ({
  schema_version: 1,
  id,
  record_id,
  record_sha256,
  reviewer: "reviewer.fixture",
  role: "subject-reviewer",
  decision: "approve",
  decided_at: "2026-11-17",
});

function compileFromRoot(root: string): ReturnType<typeof compileSiteData> {
  const reg = discoverRegistry(root);
  const proj = buildApprovedProjection(reg);
  return compileSiteData(reg, proj, { repoRoot: root });
}

describe("compiler: sections", () => {
  it("defines exactly the eleven public sections with stable routes", () => {
    expect(SECTIONS).toHaveLength(11);
    const routes = SECTIONS.map((s) => s.route);
    expect(routes[0]).toBe("/");
    for (const s of SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.summary.length).toBeGreaterThan(0);
    }
    // No duplicate routes.
    expect(new Set(routes).size).toBe(11);
  });
});

describe("compiler: empty-state projection", () => {
  it("marks the site as an honest empty state with zero approved records", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }],
      records: [{ module: "foundations", dir: "concepts", record: concept("concept.example.draft", "foundations") }],
      reviewers: [{ id: "reviewer.fixture", name: "Fixture Reviewer" }],
    });
    try {
      const data = compileFromRoot(root);
      expect(data.emptyState).toBe(true);
      expect(data.stats.approvedRecords).toBe(0);
      expect(data.nav.every((n) => n.count === 0)).toBe(true);
      expect(data.concepts).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("compiler: record routing", () => {
  it("routes records to their sections", () => {
    expect(routeForRecord(fakeRecord("concept", "concept.example.x"))).toBe("/explore/concept.example.x/");
    expect(routeForRecord(fakeRecord("lesson", "lesson.example.x"))).toBe("/academy/lesson.example.x/");
    expect(routeForRecord(fakeRecord("claim", "claim.example.x"))).toBe("/evidence/claim.example.x/");
    expect(routeForRecord(fakeRecord("source", "source.example.x"))).toBe("/library/source.example.x/");
    expect(routeForRecord(fakeRecord("research-question", "question.example.x"))).toBe("/research/question.example.x/");
    expect(routeForRecord(fakeRecord("history-event", "event.example.x"))).toBe("/history/event.example.x/");
    expect(routeForRecord(fakeRecord("career", "career.example.x"))).toBe("/careers/career.example.x/");
    expect(routeForRecord(fakeRecord("visualization", "viz.example.x"))).toBe("/laboratories/viz.example.x/");
  });
});

describe("compiler: coverage map", () => {
  it("lists draft modules and planned domains deterministically", () => {
    const root = makeRepo({ modules: [{ id: "foundations", owners: ["reviewer.fixture"] }] });
    try {
      writeText(
        join(root, "registries", "coverage", "planned-domains.yaml"),
        yamlStringify({
          planned_domains: [
            { id: "stars", title: "Stars", need: "Stellar evolution" },
            { id: "galaxies", title: "Galaxies", need: "Formation and evolution" },
          ],
        }),
      );
      const data = compileFromRoot(root);
      expect(data.coverage).toHaveLength(3);
      expect(data.coverage.map((c) => c.domain)).toEqual(["foundations", "galaxies", "stars"]);
      const stars = data.coverage.find((c) => c.domain === "stars")!;
      expect(stars.state).toBe("planned");
      expect(stars.approvedRecords).toBe(0);
      const foundations = data.coverage.find((c) => c.domain === "foundations")!;
      expect(foundations.state).toBe("draft");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("counts approved vs draft records per module", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }],
      records: [
        { module: "foundations", dir: "concepts", record: concept("concept.example.approved", "foundations", { status: "approved" }) },
        { module: "foundations", dir: "concepts", record: concept("concept.example.draft", "foundations") },
      ],
      reviewers: [{ id: "reviewer.fixture", name: "Fixture Reviewer" }],
    });
    try {
      const reg = discoverRegistry(root);
      const rec = allRecords(reg).find((r) => r.id === "concept.example.approved")!;
      writeText(
        join(root, "registries", "reviewers", "decisions", "d.yaml"),
        yamlStringify(decision("review.example.d", "concept.example.approved", rec.hash)),
      );
      const data = compileFromRoot(root);
      const foundations = data.coverage.find((c) => c.domain === "foundations")!;
      expect(foundations.approvedRecords).toBe(1);
      expect(foundations.draftRecords).toBe(2); // approved one is also present in module records
      expect(data.emptyState).toBe(false);
      expect(data.nav.find((n) => n.route === "/explore/")?.count).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("compiler: determinism", () => {
  it("produces identical output for identical input", () => {
    const root = makeRepo({
      modules: [{ id: "foundations", owners: ["reviewer.fixture"] }],
      records: [{ module: "foundations", dir: "concepts", record: concept("concept.example.approved", "foundations", { status: "approved" }) }],
      reviewers: [{ id: "reviewer.fixture", name: "Fixture Reviewer" }],
    });
    try {
      const reg = discoverRegistry(root);
      const rec = allRecords(reg).find((r) => r.id === "concept.example.approved")!;
      writeText(
        join(root, "registries", "reviewers", "decisions", "d.yaml"),
        yamlStringify(decision("review.example.d", "concept.example.approved", rec.hash)),
      );
      const a = compileFromRoot(root);
      const b = compileFromRoot(root);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("compiler: planned domains reader", () => {
  it("returns planned entries from a coverage file and empty when absent", () => {
    const root = makeRepo({ modules: [] });
    try {
      expect(readPlannedDomains(root)).toHaveLength(0);
      writeText(
        join(root, "registries", "coverage", "planned-domains.yaml"),
        yamlStringify({ planned_domains: [{ id: "stars", title: "Stars", need: "Stellar evolution" }] }),
      );
      const planned = readPlannedDomains(root);
      expect(planned).toHaveLength(1);
      expect(planned[0]!.id).toBe("stars");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads the live repository coverage file", () => {
    const planned = readPlannedDomains(process.cwd());
    expect(planned.length).toBeGreaterThanOrEqual(10); // the ten documented future domains
    expect(planned.every((p) => typeof p.id === "string" && typeof p.title === "string")).toBe(true);
  });
});

function fakeRecord(type: string, id: string): Parameters<typeof routeForRecord>[0] {
  return {
    type: type as Parameters<typeof routeForRecord>[0]["type"],
    id,
    record: {},
    file: `fixtures/${id}.yaml`,
    hash: "0".repeat(64),
    owner: "foundations",
  };
}
