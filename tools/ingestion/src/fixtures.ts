/**
 * NON-SCIENCE INGESTION FIXTURES — Crossref-shaped synthetic items.
 *
 * These are engineering test fixtures with invented DOIs and titles in the
 * reserved fixture.example namespace. They exist to test the adapter's
 * normalization, dedup, revision detection, and quarantine paths with zero
 * network access. They are never candidates for review and never science.
 */

export const fixtureItems: unknown[] = [
  {
    DOI: "10.9999/fixture.example-0001",
    title: ["Fixture Example Paper One (non-science)"],
    author: [{ given: "Fixture", family: "Author" }],
    "container-title": ["Fixture Journal of Testing"],
    issued: { "date-parts": [[2026]] },
    publisher: "Fixture Press",
    type: "journal-article",
    URL: "https://example.com/fixture/1",
    ISSN: ["0000-000X"],
    volume: "1",
    issue: "1",
    page: "1-2",
  },
  {
    DOI: "10.9999/fixture.example-0002",
    title: ["Fixture Example Paper Two (non-science)"],
    author: [],
    "container-title": [],
    issued: { "date-parts": [[2025]] },
    publisher: "Fixture Press",
    type: "proceedings-article",
    URL: "https://example.com/fixture/2",
    ISSN: [],
    volume: null,
    issue: null,
    page: null,
  },
];

export const fixtureSchemaDriftItem: unknown = {
  DOI: "10.9999/fixture.example-drift",
  title: ["Fixture Drift (non-science)"],
  abstract: "This field must never be read — its presence must quarantine the item.",
};

export const fixtureMissingDoiItem: unknown = {
  title: ["Fixture Missing DOI (non-science)"],
};

/** A realistic Crossref response envelope (fixture). */
export function fixtureResponseEnvelope(items: unknown[]): unknown {
  return { status: "ok", "message-type": "work-list", message: { "total-results": items.length, items } };
}
