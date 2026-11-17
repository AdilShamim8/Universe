#!/usr/bin/env node
/** Generate the ten thin section pages from a shared template. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "src", "pages");

const sections = [
  { slug: "academy", title: "Academy", summary: "Structured lessons from basics through advanced mathematics." },
  { slug: "explore", title: "Explore", summary: "Searchable subjects, objects, and interactive visualizations." },
  { slug: "evidence", title: "Evidence", summary: "Measurements, models, source references, debates and uncertainty." },
  { slug: "research", title: "Research Frontier", summary: "Open scientific questions, surveys, reproducible projects." },
  { slug: "laboratories", title: "Laboratories", summary: "Simulations, real datasets, exercises, notebooks." },
  { slug: "technology", title: "Space Technology", summary: "Spaceflight, rockets, observatories, instruments, robotics." },
  { slug: "careers", title: "Careers", summary: "Scientist, astronaut, engineer, mission operations, citizen science." },
  { slug: "library", title: "Library", summary: "Official publications, manuals, datasets, tools and attribution." },
  { slug: "community", title: "Community", summary: "Contribution guide, coverage map, review process and changelog." },
];

for (const s of sections) {
  const content = `---
import SectionPage from "../components/SectionPage.astro";
---
<SectionPage route="/${s.slug}/" title="${s.title}" summary="${s.summary}" />
`;
  mkdirSync(join(root, s.slug), { recursive: true });
  writeFileSync(join(root, s.slug, "index.astro"), content, "utf8");
  console.log("wrote", s.slug);
}
