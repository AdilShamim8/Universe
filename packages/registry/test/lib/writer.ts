/** Test helper: write text files and build temporary fixture registry trees. */
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { stringify as yamlStringify } from "yaml";

export function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

export interface FixtureRepoSpec {
  modules?: {
    id: string;
    depends_on?: string[];
    owners?: string[];
  }[];
  /** Records as [recordDirInModule, recordObject][] keyed by module id. */
  records?: { module: string; dir: string; record: Record<string, unknown> }[];
  experiences?: { id: string; title: string; events?: Record<string, unknown>[] }[];
  reviewers?: Record<string, unknown>[];
  decisions?: Record<string, unknown>[];
  redirects?: { slug: string; target: string }[];
}

const baseModule = {
  schema_version: 1,
  title: "Fixture Module",
  status: "draft",
  owners: [],
  depends_on: [],
  taxonomy_provider: null,
  locales: ["en"],
  review_policy: "science-and-education",
};

/**
 * Build a temporary registry tree from a spec. All record IDs are expected to
 * carry the fixture namespace; the caller controls lifecycle status fields.
 */
export function makeRepo(spec: FixtureRepoSpec): string {
  const root = mkdtempSync(join(tmpdir(), "universe-registry-test-"));
  for (const m of spec.modules ?? []) {
    const manifest = { ...baseModule, id: m.id, depends_on: m.depends_on ?? [], owners: m.owners ?? [] };
    writeText(join(root, "modules", m.id, "module.yaml"), yamlStringify(manifest));
  }
  for (const r of spec.records ?? []) {
    writeText(join(root, "modules", r.module, r.dir, `${r.record.id}.yaml`), yamlStringify(r.record));
  }
  for (const x of spec.experiences ?? []) {
    writeText(
      join(root, "experiences", x.id, "experience.yaml"),
      yamlStringify({ id: x.id, title: x.title, description: "Fixture experience (non-science)" }),
    );
    for (const e of x.events ?? []) {
      writeText(join(root, "experiences", x.id, "events", `${e.id}.yaml`), yamlStringify(e));
    }
  }
  if ((spec.reviewers ?? []).length > 0) {
    writeText(
      join(root, "registries", "reviewers", "registry.yaml"),
      yamlStringify({ reviewers: spec.reviewers }),
    );
  }
  for (const d of spec.decisions ?? []) {
    writeText(join(root, "registries", "reviewers", "decisions", `${d.id}.yaml`), yamlStringify(d));
  }
  if ((spec.redirects ?? []).length > 0) {
    writeText(join(root, "registries", "redirects", "redirects.yaml"), yamlStringify({ redirects: spec.redirects }));
  }
  return root;
}

export { yamlStringify };
