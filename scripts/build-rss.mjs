#!/usr/bin/env node
/**
 * build-rss.mjs — generate apps/web/public/rss.xml from the curated data.
 * Runs as part of the build pipeline (after content changes).
 * Static, dependency-free; mirrors what the pages render.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CURATED = join(ROOT, "content", "curated");
const OUT = join(ROOT, "apps", "web", "public", "rss.xml");
const SITE = "https://universe-101.vercel.app";

const load = (name) => JSON.parse(readFileSync(join(CURATED, name), "utf8")).data;
const timeline = load("timeline.json");
const academy = load("academy.json");
const research = load("research.json");

const items = [
  ...timeline.eras.map((era) => ({
    title: `Era ${era.order}: ${era.title}`,
    description: `${era.summary} (${era.events.length} sourced events.)`,
    link: `/history/#${era.id}`,
  })),
  ...academy.map((s) => ({
    title: `Learning pathway: ${s.title}`,
    description: `${s.overview} (${s.pathway.length} steps, ${s.pathway.reduce((n, st) => n + st.resources.length, 0)} resources.)`,
    link: `/academy/${s.id}/`,
  })),
  ...research.map((f) => ({
    title: `Research field: ${f.name}`,
    description: `${f.summary} (${f.papers.length} verified papers.)`,
    link: `/research/${f.id}/`,
  })),
];

const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Universe 101</title>
    <link>${SITE}</link>
    <description>Learn, explore and research the universe — a curated, source-backed guide from beginner to research level.</description>
    <language>en</language>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
${items
  .map(
    (it) => `    <item>
      <title>${esc(it.title)}</title>
      <link>${SITE}${esc(it.link)}</link>
      <guid>${SITE}${esc(it.link)}</guid>
      <description>${esc(it.description)}</description>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>
`;

writeFileSync(OUT, xml);
console.log(`rss.xml: ${items.length} items -> ${OUT}`);
