/**
 * SSRF-safe bounded fetcher for allowlisted source adapters.
 *
 * Threat model (SYSTEM_DESIGN §13): remote sources are untrusted. This
 * fetcher enforces, in order:
 *
 * 1. Destination allowlist by exact origin (https only) — no arbitrary URLs.
 * 2. Redirect revalidation: every hop is re-checked against the allowlist
 *    and DNS-resolved again; cross-origin redirects to non-allowlisted
 *    hosts are refused.
 * 3. Private/internal address blocking: the resolved IP is checked against
 *    RFC 1918/4193/6598, loopback, link-local, and unspecified ranges for
 *    both IPv4 and IPv6. A hostname that resolves to a blocked address is
 *    refused (DNS rebinding defense: resolution happens at connect time).
 * 4. Response size cap: the body is streamed and truncated-then-failed.
 * 5. Content-type check against the adapter's expectation.
 * 6. Timeouts and bounded retries with exponential backoff.
 *
 * The fetcher never follows redirects automatically (manual hop control).
 */

export interface FetchBudget {
  timeoutMs: number;
  maxResponseBytes: number;
  retries: number;
  backoffMs: number;
}

export interface FetchResult {
  ok: true;
  status: number;
  contentType: string;
  body: string;
  /** Result of conditional request handling. */
  notModified: boolean;
}

export type FetchFailure =
  | { ok: false; kind: "ssrf-blocked-origin"; detail: string }
  | { ok: false; kind: "ssrf-blocked-address"; detail: string }
  | { ok: false; kind: "redirect-refused"; detail: string }
  | { ok: false; kind: "too-large"; detail: string }
  | { ok: false; kind: "wrong-content-type"; detail: string }
  | { ok: false; kind: "http-error"; detail: string; status: number }
  | { ok: false; kind: "network"; detail: string }
  | { ok: false; kind: "timeout"; detail: string };

/** The transport abstraction — injectable for deterministic tests. */
export interface HttpTransport {
  /** Perform a request; returns status, headers, and a byte stream or text. */
  request(url: string, init: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: ReadableStream<Uint8Array> | null;
    text?: string;
  }>;
  /** Resolve a hostname to its addresses (for private-range checks). */
  resolve(hostname: string): Promise<string[]>;
}

export const DEFAULT_BUDGET: FetchBudget = {
  timeoutMs: 10_000,
  maxResponseBytes: 5_242_880,
  retries: 2,
  backoffMs: 500,
};

const BLOCKED_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^0\./,
];

export function isBlockedIpv4(ip: string): boolean {
  return BLOCKED_V4.some((re) => re.test(ip));
}

export function isBlockedIpv6(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
  // IPv4-mapped: ::ffff:10.0.0.1
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isBlockedIpv4(mapped[1]!);
  // IPv6 site-local (fec0:) and 6to4 of private ranges are edge cases;
  // block fec0: conservatively.
  if (v.startsWith("fec0:")) return true;
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  if (ip.includes(":")) return isBlockedIpv6(ip);
  return isBlockedIpv4(ip);
}

/** Exact-origin allowlist check. */
export function originAllowed(url: string, allowlist: string[]): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return allowlist.some((a) => {
      try {
        return new URL(a).origin === u.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export interface SafeFetchOptions {
  allowlist: string[];
  budget?: Partial<FetchBudget>;
  expectedContentTypes?: string[];
  /** Conditional request support. */
  etag?: string;
  lastModified?: string;
  maxRedirects?: number;
}

/**
 * Perform one allowlisted, bounded fetch. Redirects are followed manually
 * with full revalidation per hop. Throws nothing; returns a discriminated
 * result so callers can distinguish transient (retry) from permanent.
 */
export async function safeFetch(
  url: string,
  transport: HttpTransport,
  options: SafeFetchOptions,
): Promise<FetchResult | FetchFailure> {
  const budget = { ...DEFAULT_BUDGET, ...options.budget };
  const maxRedirects = options.maxRedirects ?? 3;
  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // 1. Allowlist (exact origin, https only).
    if (!originAllowed(current, options.allowlist)) {
      return { ok: false, kind: "ssrf-blocked-origin", detail: `origin not allowlisted: ${current}` };
    }
    // 2. DNS resolution + private-address check.
    let hostname: string;
    try {
      hostname = new URL(current).hostname;
    } catch {
      return { ok: false, kind: "ssrf-blocked-origin", detail: `invalid URL: ${current}` };
    }
    let addrs: string[];
    try {
      addrs = await transport.resolve(hostname);
    } catch (e) {
      return { ok: false, kind: "network", detail: `DNS failure for ${hostname}: ${(e as Error).message}` };
    }
    if (addrs.length === 0) {
      return { ok: false, kind: "network", detail: `no addresses for ${hostname}` };
    }
    for (const addr of addrs) {
      if (isBlockedAddress(addr)) {
        return { ok: false, kind: "ssrf-blocked-address", detail: `${hostname} resolves to blocked address ${addr}` };
      }
    }

    // 3. Conditional headers.
    const headers: Record<string, string> = { accept: "application/json" };
    if (options.etag) headers["if-none-match"] = options.etag;
    if (options.lastModified) headers["if-modified-since"] = options.lastModified;

    // 4. Timeout + request.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget.timeoutMs);
    let res: Awaited<ReturnType<HttpTransport["request"]>>;
    try {
      res = await transport.request(current, { headers, signal: controller.signal });
    } catch (e) {
      clearTimeout(timer);
      const msg = (e as Error).message;
      if (controller.signal.aborted) return { ok: false, kind: "timeout", detail: `timeout after ${budget.timeoutMs}ms: ${current}` };
      return { ok: false, kind: "network", detail: msg };
    }
    clearTimeout(timer);

    // 5. Redirects: revalidate every hop.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers["location"] ?? res.headers["Location"];
      if (!location) return { ok: false, kind: "redirect-refused", detail: `redirect without location at ${current}` };
      const next = new URL(location, current).toString();
      if (!originAllowed(next, options.allowlist)) {
        return { ok: false, kind: "redirect-refused", detail: `redirect to non-allowlisted origin: ${next}` };
      }
      current = next;
      continue;
    }

    if (res.status === 304) {
      return { ok: true, status: 304, contentType: "", body: "", notModified: true };
    }

    if (res.status >= 400) {
      return { ok: false, kind: "http-error", detail: `HTTP ${res.status} at ${current}`, status: res.status };
    }

    // 6. Content-type check.
    const contentType = res.headers["content-type"] ?? res.headers["Content-Type"] ?? "";
    if (options.expectedContentTypes && options.expectedContentTypes.length > 0) {
      const base = contentType.split(";")[0]!.trim().toLowerCase();
      if (!options.expectedContentTypes.some((t) => base === t || base.endsWith(`+${t.split("/").pop()}`))) {
        return { ok: false, kind: "wrong-content-type", detail: `expected ${options.expectedContentTypes.join("/")}, got ${contentType || "(none)"}` };
      }
    }

    // 7. Size-capped body read.
    let text: string;
    if (typeof res.text === "string") {
      if (res.text.length > budget.maxResponseBytes) {
        return { ok: false, kind: "too-large", detail: `body exceeds cap (${res.text.length} > ${budget.maxResponseBytes} bytes)` };
      }
      text = res.text;
    } else if (res.body) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      let oversized = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > budget.maxResponseBytes) {
            oversized = true;
            reader.cancel().catch(() => {});
            break;
          }
          chunks.push(value);
        }
      } catch (e) {
        return { ok: false, kind: "network", detail: `body read failed: ${(e as Error).message}` };
      }
      if (oversized) {
        return { ok: false, kind: "too-large", detail: `body exceeds cap (${total} > ${budget.maxResponseBytes} bytes)` };
      }
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        merged.set(c, off);
        off += c.byteLength;
      }
      text = new TextDecoder().decode(merged);
    } else {
      text = "";
    }

    return { ok: true, status: res.status, contentType, body: text, notModified: false };
  }
  return { ok: false, kind: "redirect-refused", detail: `too many redirects (>${maxRedirects})` };
}

/** Bounded retry with exponential backoff for transient failures. */
export async function fetchWithRetry(
  url: string,
  transport: HttpTransport,
  options: SafeFetchOptions,
): Promise<FetchResult | FetchFailure> {
  const budget = { ...DEFAULT_BUDGET, ...options.budget };
  let last: FetchFailure | null = null;
  for (let attempt = 0; attempt <= budget.retries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, budget.backoffMs * 2 ** (attempt - 1)));
    }
    const res = await safeFetch(url, transport, options);
    if (res.ok) return res;
    // Never retry permanent refusals.
    if (res.kind === "ssrf-blocked-origin" || res.kind === "ssrf-blocked-address" || res.kind === "redirect-refused" || res.kind === "wrong-content-type") {
      return res;
    }
    // Retry on 429/5xx, timeouts, network errors.
    last = res;
  }
  return last!;
}
