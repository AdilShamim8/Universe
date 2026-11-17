import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  header,
  previewBanner,
  emptyState,
  lifecycleChip,
  evidenceChip,
  recordCard,
  themeToggle,
  footer,
  disclosure,
} from "../src/index.js";

describe("ui: escaping", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("a & b 'c'")).toBe("a &amp; b &#39;c&#39;");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("ui: header", () => {
  it("renders a skip link and nav with aria-current", () => {
    const html = header(
      [
        { route: "/", title: "Start" },
        { route: "/history/", title: "Universe History", current: true, count: 0 },
      ],
      { brand: "Universe Platform", tagline: "An open learning infrastructure" },
    );
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('href="#main"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Primary"');
    expect(html).not.toContain('(0)'); // zero counts are not rendered
  });

  it("escapes brand text", () => {
    const html = header([], { brand: "<b>Bad</b>" });
    expect(html).toContain("&lt;b&gt;Bad&lt;/b&gt;");
  });
});

describe("ui: preview banner and empty state", () => {
  it("marks the preview banner as a note with escaped text", () => {
    const html = previewBanner('No reviewed content yet <img src=x onerror="y">');
    expect(html).toContain("Engineering preview.");
    expect(html).toContain("role=\"note\"");
    expect(html).not.toContain("<img");
  });

  it("renders the awaiting-review empty state copy", () => {
    const html = emptyState("No lessons yet", "Awaiting human scientific review.", { awaitingReview: true });
    expect(html).toContain("This lesson is awaiting scientific review.");
    expect(html).toContain("No lessons yet");
  });
});

describe("ui: chips", () => {
  it("lifecycle chips carry non-color symbol prefixes", () => {
    const draft = lifecycleChip("draft");
    expect(draft).toContain("chip-draft");
    expect(draft).toContain("title=\"Lifecycle status: draft\"");
  });

  it("evidence chips map status to class", () => {
    expect(evidenceChip("model-dependent")).toContain("chip-ev-model-dependent");
    expect(evidenceChip("weird status")).not.toContain("onerror");
  });
});

describe("ui: record card and disclosure", () => {
  it("record cards escape all interpolated values", () => {
    const html = recordCard({
      title: 'Lesson "One"',
      href: "/academy/lesson.example.one/",
      meta: [{ label: "Level", value: "L1" }],
      chip: lifecycleChip("draft"),
    });
    expect(html).toContain("&quot;One&quot;");
    expect(html).toContain("<dt>Level</dt>");
  });

  it("disclosure uses details/summary semantics", () => {
    const html = disclosure("How do we know?", "<p>Evidence details</p>", { open: true });
    expect(html).toContain("<details");
    expect(html).toContain("open");
    expect(html).toContain("<summary>How do we know?</summary>");
  });
});

describe("ui: footer and theme toggle", () => {
  it("footer disclaims affiliation and claims", () => {
    const html = footer({ status: "Engineering preview", license: "Apache-2.0 (code)" });
    expect(html).toContain("Not affiliated with");
    expect(html).toContain("No scientific accuracy or completeness is claimed.");
  });

  it("theme toggle starts hidden without JS", () => {
    const html = themeToggle();
    expect(html).toContain("hidden");
    expect(html).toContain("data-theme-toggle");
  });
});
