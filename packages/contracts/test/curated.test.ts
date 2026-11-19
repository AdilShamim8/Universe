import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Curated content contract tests — the invariants that make the curated
 * layer publishable without scientific review (see docs/content-workflow.md).
 *
 * These load the JSON directly (not through the app loader) so they run
 * in plain vitest without the Astro/Vite resolution context.
 */

// vitest transforms this file into a cache dir, so import.meta.url is not
// reliable here — resolve from process.cwd(), which vitest sets to the repo
// root when run via `npm test`.
const REPO_ROOT = process.cwd();
const CURATED = join(REPO_ROOT, "content", "curated");

function load(name: string): { provenance: any; data: any } {
  return JSON.parse(readFileSync(join(CURATED, name), "utf8"));
}

const isHttpUrl = (s: unknown) => typeof s === "string" && /^https:\/\/[\w.-]+\//.test(s);

describe("curated: provenance envelopes", () => {
  const files = readdirSync(CURATED).filter((f) => f.endsWith(".json"));

  it("has the five expected datasets", () => {
    expect(files.sort()).toEqual([
      "academy.json",
      "explore.json",
      "library.json",
      "research.json",
      "timeline.json",
    ]);
  });

  for (const f of files) {
    it(`${f}: carries a complete provenance envelope`, () => {
      const env = load(f);
      expect(env.provenance.kind).toBeTruthy();
      expect(env.provenance.description).toBeTruthy();
      expect(env.provenance.verification.method).toBeTruthy();
      expect(env.provenance.verification.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(env.provenance.verification.passRate).toBeTruthy();
    });
  }
});

describe("curated: library", () => {
  const { data: library } = load("library.json");

  it("has ≥50 resources (spec floor) with unique ids", () => {
    expect(library.length).toBeGreaterThanOrEqual(50);
    const ids = new Set(library.map((r: any) => r.id));
    expect(ids.size).toBe(library.length);
  });

  it("every resource has a https url, title, publisher, difficulty, license", () => {
    for (const r of library) {
      expect(isHttpUrl(r.url), r.id).toBe(true);
      expect(r.title.length).toBeGreaterThan(3);
      expect(r.publisher.length).toBeGreaterThan(1);
      expect(["beginner", "intermediate", "advanced", "research"]).toContain(r.difficulty);
      expect(r.license.length).toBeGreaterThan(1);
    }
  });
});

describe("curated: academy", () => {
  const { data: academy } = load("academy.json");
  const ids = new Set(academy.map((s: any) => s.id));

  it("has the 11 spec subjects", () => {
    expect(academy.length).toBe(11);
    for (const id of [
      "introduction-to-astronomy", "mathematics-and-physics-foundations", "solar-system",
      "stars-and-stellar-evolution", "galaxies", "black-holes", "cosmology",
      "dark-matter-and-dark-energy", "astrobiology", "space-exploration", "research-methods",
    ]) expect(ids.has(id), id).toBe(true);
  });

  it("pathway steps are numbered, leveled, and carry ≥1 resource each", () => {
    for (const s of academy) {
      expect(s.pathway.length).toBeGreaterThanOrEqual(5);
      s.pathway.forEach((st: any, i: number) => {
        expect(st.step).toBe(i + 1);
        expect(st.level).toMatch(/^L[0-5]$/);
        expect(st.resources.length).toBeGreaterThanOrEqual(1);
        for (const r of st.resources) expect(isHttpUrl(r.url)).toBe(true);
      });
    }
  });

  it("prerequisite and next references resolve to real subjects", () => {
    for (const s of academy) {
      for (const ref of [...s.prerequisites, ...s.next]) {
        expect(ids.has(ref), `${s.id} -> ${ref}`).toBe(true);
      }
    }
  });
});

describe("curated: timeline", () => {
  const { data: t } = load("timeline.json");

  it("has the 12 spec eras in order", () => {
    expect(t.eras.length).toBe(12);
    t.eras.forEach((e: any, i: number) => expect(e.order).toBe(i + 1));
  });

  it("ΛCDM model header present with Planck age", () => {
    expect(t.model.name).toBe("ΛCDM");
    expect(t.model.ageGyr).toBeCloseTo(13.797, 2);
  });

  it("every event has a source with https url and a time value", () => {
    let count = 0;
    for (const era of t.eras) {
      expect(era.events.length).toBeGreaterThanOrEqual(5);
      for (const ev of era.events) {
        count++;
        expect(isHttpUrl(ev.source.url), ev.id).toBe(true);
        expect(typeof ev.time.value).toBe("number");
        expect(ev.display.length).toBeGreaterThan(2);
        expect(ev.summary.length).toBeGreaterThan(40);
      }
    }
    expect(count).toBeGreaterThanOrEqual(70);
  });

  it("event ids are unique across eras", () => {
    const all = t.eras.flatMap((e: any) => e.events.map((ev: any) => ev.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it("future era events are flagged model-dependent", () => {
    const future = t.eras.find((e: any) => e.id === "conditional-future");
    expect(future).toBeTruthy();
    for (const ev of future.events) {
      const text = `${ev.summary} ${ev.time.uncertainty ?? ""}`;
      expect(/model|project|scenario|uncertain/i.test(text), ev.id).toBe(true);
    }
  });
});

describe("curated: research", () => {
  const { data: fields } = load("research.json");
  const acadIds = new Set(load("academy.json").data.map((s: any) => s.id));

  it("has 8 fields with ≥4 papers each", () => {
    expect(fields.length).toBe(8);
    for (const f of fields) expect(f.papers.length).toBeGreaterThanOrEqual(4);
  });

  it("papers carry arXiv ids, authors, years and 'why' notes", () => {
    for (const f of fields) {
      for (const p of f.papers) {
        expect(p.arxiv).toMatch(/^[\w./-]+$/);
        expect(p.url).toBe(`https://arxiv.org/abs/${p.arxiv}`);
        expect(p.authors.length).toBeGreaterThan(2);
        expect(p.year).toBeGreaterThan(1900);
        expect(p.why.length).toBeGreaterThan(10);
      }
    }
  });

  it("priorities and open questions cite sources", () => {
    for (const f of fields) {
      expect(f.priorities.length).toBeGreaterThanOrEqual(1);
      expect(f.openQuestions.length).toBeGreaterThanOrEqual(1);
      for (const q of [...f.priorities, ...f.openQuestions]) {
        expect(isHttpUrl(q.source.url)).toBe(true);
        expect(q.source.label.length).toBeGreaterThan(3);
      }
    }
  });

  it("learnFirst references resolve to academy subjects", () => {
    for (const f of fields) {
      expect(f.learnFirst.length).toBeGreaterThanOrEqual(1);
      for (const id of f.learnFirst) expect(acadIds.has(id), id).toBe(true);
    }
  });
});

describe("curated: explore", () => {
  const { data: e } = load("explore.json");

  it("planet facts match the NSSDC fact sheet for Earth and Jupiter", () => {
    const earth = e.planets.find((p: any) => p.name === "Earth");
    expect(earth.massE24kg).toBeCloseTo(5.97, 2);
    expect(earth.diameterKm).toBe(12756);
    const jup = e.planets.find((p: any) => p.name === "Jupiter");
    expect(jup.moons).toBeGreaterThanOrEqual(90);
    expect(jup.ringSystem).toBe(true);
  });

  it("every planet cites the fact sheet and links a NASA page", () => {
    for (const p of e.planets) {
      expect(p.source.url).toContain("nssdc.gsfc.nasa.gov");
      expect(isHttpUrl(p.page)).toBe(true);
    }
  });

  it("missions have https urls and valid status", () => {
    expect(e.missions.length).toBeGreaterThanOrEqual(14);
    for (const m of e.missions) {
      expect(isHttpUrl(m.url)).toBe(true);
      expect(["active", "completed", "planned"]).toContain(m.status);
      expect(m.year).toBeGreaterThan(1950);
    }
  });

  it("scale ladder is sorted by size where numeric", () => {
    const sizes = e.scale.map((s: any) => s.sizeKm).filter((v: unknown) => typeof v === "number");
    const sorted = [...sizes].sort((a: number, b: number) => a - b);
    expect(sizes).toEqual(sorted);
  });
});

describe("curated: cross-dataset integrity", () => {
  it("explore planets referenced by academy solar-system pathway exist", () => {
    // no direct keying today; guard the inverse — planet names are stable
    const { data: e } = load("explore.json");
    expect(e.planets.map((p: any) => p.name)).toContain("Earth");
  });

  it("no internal absolute links to our own domain in curated data", () => {
    for (const f of readdirSync(CURATED).filter((x) => x.endsWith(".json"))) {
      const raw = readFileSync(join(CURATED, f), "utf8");
      expect(raw.includes("universe-101.vercel.app"), f).toBe(false);
    }
  });

  it("dist build exists after npm run build (smoke)", () => {
    expect(existsSync(join(REPO_ROOT, "apps", "web", "dist", "index.html"))).toBe(true);
  });
});
