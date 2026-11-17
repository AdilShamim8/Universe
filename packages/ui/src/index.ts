/**
 * @universe/ui — accessible, dependency-free HTML components.
 *
 * Components are plain template functions returning semantic HTML strings.
 * They render server-side (no client JS), which keeps pages fast and usable
 * without JavaScript. Interactive behaviors live in apps/web islands only
 * where genuinely needed.
 *
 * SECURITY: all text passed through here MUST be pre-escaped by callers
 * (records are validated, plain, sanitized content — never raw HTML).
 * escapeHtml() is exported for that purpose and used in every interpolation.
 */

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Site header: skip link, brand, primary nav with current-page marking. */
export interface NavEntry {
  route: string;
  title: string;
  count?: number;
  current?: boolean;
}

export function header(entries: NavEntry[], opts: { brand: string; tagline?: string }): string {
  const items = entries
    .map(
      (e) =>
        `<li><a href="${escapeHtml(e.route)}"${e.current ? ' aria-current="page"' : ""}>${escapeHtml(e.title)}${
          typeof e.count === "number" && e.count > 0 ? ` <span class="nav-count">(${e.count})</span>` : ""
        }</a></li>`,
    )
    .join("\n");
  return `<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header">
  <div class="site-header-inner">
    <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">✦</span> <span class="brand-name">${escapeHtml(
      opts.brand,
    )}</span></a>
    ${opts.tagline ? `<p class="tagline">${escapeHtml(opts.tagline)}</p>` : ""}
    <nav aria-label="Primary">
      <ul class="nav-list">
${items}
      </ul>
    </nav>
  </div>
</header>`;
}

/** Engineering-preview banner: shown on every page while in preview state. */
export function previewBanner(note: string): string {
  return `<div class="preview-banner" role="note">
  <strong>Engineering preview.</strong> ${escapeHtml(note)}
</div>`;
}

/** Empty state for sections without eligible content (honest, non-scientific copy). */
export function emptyState(title: string, body: string, opts: { awaitingReview?: boolean } = {}): string {
  return `<section class="empty-state" aria-labelledby="empty-state-title">
  <h2 id="empty-state-title">${escapeHtml(title)}</h2>
  <p>${escapeHtml(body)}</p>
  ${opts.awaitingReview ? `<p class="empty-state-note">This lesson is awaiting scientific review.</p>` : ""}
</section>`;
}

/** Status chip: lifecycle (draft/in-review/approved/…) with non-color indicators. */
export function lifecycleChip(status: string): string {
  const safe = escapeHtml(status);
  const cls = status.replace(/[^a-z-]/g, "");
  return `<span class="chip chip-${cls}" title="Lifecycle status: ${safe}">${safe}</span>`;
}

/** Status chip: evidence standing (established/model-dependent/…). */
export function evidenceChip(status: string): string {
  const safe = escapeHtml(status);
  const cls = status.replace(/[^a-z-]/g, "");
  return `<span class="chip chip-ev-${cls}" title="Evidence status: ${safe}">${safe}</span>`;
}

/** Simple definition-list based record card. */
export function recordCard(entry: {
  title: string;
  href: string;
  meta: { label: string; value: string }[];
  chip?: string;
}): string {
  const meta = entry.meta
    .map((m) => `<div class="record-meta-row"><dt>${escapeHtml(m.label)}</dt><dd>${escapeHtml(m.value)}</dd></div>`)
    .join("");
  return `<article class="record-card">
  <h3 class="record-card-title"><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.title)}</a></h3>
  ${entry.chip ?? ""}
  <dl class="record-meta">${meta}</dl>
</article>`;
}

/** Theme toggle: progressive-enhancement no-JS fallback is the default theme. */
export function themeToggle(): string {
  return `<button type="button" class="theme-toggle" data-theme-toggle aria-label="Switch between dark and light theme" hidden>
    <span class="theme-toggle-icon" aria-hidden="true">◐</span> <span class="theme-toggle-label">Theme</span>
  </button>`;
}

/** Footer with honest status and no fake credentials. */
export function footer(opts: { status: string; license: string }): string {
  return `<footer class="site-footer">
  <p>${escapeHtml(opts.status)} · ${escapeHtml(opts.license)}</p>
  <p class="footer-note">Not affiliated with, endorsed by, or connected to any space agency or company. No scientific accuracy or completeness is claimed.</p>
</footer>`;
}

/** Accessible disclosure (details/summary based). */
export function disclosure(summary: string, bodyHtml: string, opts: { id?: string; open?: boolean } = {}): string {
  return `<details class="disclosure"${opts.open ? " open" : ""}${opts.id ? ` id="${escapeHtml(opts.id)}"` : ""}>
  <summary>${escapeHtml(summary)}</summary>
  <div class="disclosure-body">${bodyHtml}</div>
</details>`;
}
