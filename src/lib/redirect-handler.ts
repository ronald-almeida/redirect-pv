/**
 * Redirect hot path.
 *
 * Goal: p50 < 30ms, p95 < 100ms (slugs ativos).
 *
 * Architecture
 * ────────────
 *   [HOT PATH]            Memory Map → Edge Cache → DB (cold miss only)
 *   [BACKGROUND TRACKING] All analytics/metrics via ctx.waitUntil
 *   [CACHE REFRESH]       SWR — stale served instantly, refreshed off the wire
 *   [COLD MISS FALLBACK]  1 query, only essential columns; missing slug → 404
 *
 * Before the 302 we ONLY do:
 *   1. memory map lookup (µs)
 *   2. edge cache read on miss (~5–20ms)
 *   3. UA regex + IP read (no awaits, ~µs)
 *   4. pickDestination (pure CPU)
 *
 * Everything else — URL parse, UTM extraction, country, device,
 * prefetch detection, click insert, RPCs, edge cache writes, settings
 * fetch — happens AFTER the response is returned, via scheduleBackground.
 */

// ── Workers waitUntil (resolved eagerly) ───────────────────────────────────
let waitUntilImpl: ((p: Promise<unknown>) => void) | null = null;
const waitUntilReady: Promise<void> = (async () => {
  try {
    const specifier = "cloudflare" + ":" + "workers";
    const mod: any = await import(/* @vite-ignore */ specifier);
    waitUntilImpl = mod.waitUntil ?? null;
  } catch {
    waitUntilImpl = null;
  }
})();

function scheduleBackground(p: Promise<unknown>): void {
  // Fire-and-forget. The caller never awaits us.
  if (waitUntilImpl) {
    try {
      waitUntilImpl(p);
      return;
    } catch {
      /* fall through */
    }
  }
  void (async () => {
    await waitUntilReady;
    if (waitUntilImpl) {
      try {
        waitUntilImpl(p);
        return;
      } catch {
        /* fall through */
      }
    }
    try {
      await p;
    } catch {
      /* ignore */
    }
  })();
}

// ── Cache configuration ────────────────────────────────────────────────────
const CACHE_TTL_SECONDS = 3_600; // fresh window — no revalidation (1h)
const CACHE_SWR_SECONDS = 86_400; // stale window — served + revalidated (24h)
const COLD_MISS_HARD_TIMEOUT_MS = 800; // abort DB if slower than this
const COLD_MISS_SOFT_TIMEOUT_MS = 400; // fall back to waiting URL beyond this

// CRITICAL: Cloudflare Workers' caches.default REQUIRES the cache key URL to use
// a hostname owned by the zone. Synthetic hosts (cache.internal) cause put() to
// silently no-op — every read becomes MISS forever. Always derive the host from
// the actual inbound request.
function cacheKeyForSlug(origin: string, slug: string): Request {
  return new Request(`${origin}/__cache/link/${encodeURIComponent(slug)}`);
}
function settingsCacheKey(origin: string): Request {
  return new Request(`${origin}/__cache/settings/default_waiting`);
}

// In-memory isolate cache. A warm isolate holds hundreds of slugs and serves
// them in microseconds — this is the biggest single perf win.
type MemEntry<T> = { value: T; storedAt: number };
const MEM_MAX = 500;
const memLinks = new Map<string, MemEntry<LinkRow | null>>();
const memSettings: { current: MemEntry<string | null> | null } = { current: null };

function memGet(slug: string): MemEntry<LinkRow | null> | null {
  const hit = memLinks.get(slug);
  if (!hit) return null;
  // LRU refresh
  memLinks.delete(slug);
  memLinks.set(slug, hit);
  return hit;
}
function memSet(slug: string, value: LinkRow | null) {
  if (memLinks.size >= MEM_MAX) {
    const firstKey = memLinks.keys().next().value;
    if (firstKey !== undefined) memLinks.delete(firstKey);
  }
  memLinks.set(slug, { value, storedAt: Date.now() });
}

function getEdgeCache(): Cache | null {
  try {
    // @ts-ignore - Workers global
    return typeof caches !== "undefined" && caches?.default ? caches.default : null;
  } catch {
    return null;
  }
}

type CacheEntry<T> = { value: T; storedAt: number };

async function readCacheEntry<T>(key: Request): Promise<CacheEntry<T> | null> {
  const cache = getEdgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(key);
    if (!hit) return null;
    return (await hit.json()) as CacheEntry<T>;
  } catch {
    return null;
  }
}

async function writeCacheEntry(key: Request, value: unknown) {
  const cache = getEdgeCache();
  if (!cache) return;
  try {
    const entry: CacheEntry<unknown> = { value, storedAt: Date.now() };
    await cache.put(
      key,
      new Response(JSON.stringify(entry), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${CACHE_SWR_SECONDS}, s-maxage=${CACHE_SWR_SECONDS}`,
        },
      }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Invalidate both layers of cache for a slug. Called from admin DELETE /r/$slug.
 * Needs the inbound request so the cache key matches the same zone-owned
 * hostname used by handleRedirect.
 */
export async function purgeSlugCache(
  slug: string,
  request: Request,
): Promise<boolean> {
  memLinks.delete(slug);
  const cache = getEdgeCache();
  if (!cache) return false;
  try {
    const origin = new URL(request.url).origin;
    return await cache.delete(cacheKeyForSlug(origin, slug));
  } catch {
    return false;
  }
}

// ── Constants ──────────────────────────────────────────────────────────────
const BOT_REGEX =
  /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|whatsapp|telegram|discord|slack|linkedin|embedly|preview|fetch|monitor|curl|wget|python-requests|httpclient|axios|headless/i;

const DEVICE_REGEX = /mobile|android|iphone|ipad|ipod/i;
const PREFETCH_REGEX = /prefetch|preview|prerender/i;

type LinkRow = {
  id: string;
  name: string | null;
  mode: string;
  real_url: string | null;
  decoy_url: string | null;
  active: boolean;
  expires_at: string | null;
  click_limit: number | null;
  click_count: number;
  allowed_countries: string[] | null;
  blocked_ips: string[] | null;
  real_urls: string[] | null;
  ab_test: boolean;
  rotation_index: number;
  owner_only: boolean;
  owner_ips: string[];
};

const LINK_COLUMNS =
  "id,name,mode,real_url,decoy_url,active,expires_at,click_limit,click_count,allowed_countries,blocked_ips,real_urls,ab_test,rotation_index,owner_only,owner_ips";

// Raw PostgREST — bypasses supabase-js for ~5ms savings on the cold miss path.
function pgRest(path: string, init?: RequestInit): Promise<Response> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.pgrst.object+json",
      ...(init?.headers || {}),
    },
  });
}

async function fetchLink(slug: string, signal?: AbortSignal): Promise<LinkRow | null> {
  try {
    const r = await pgRest(
      `links?slug=eq.${encodeURIComponent(slug)}&select=${LINK_COLUMNS}&limit=1`,
      { signal },
    );
    if (!r.ok) return null;
    return (await r.json()) as LinkRow;
  } catch {
    return null;
  }
}

async function fetchDefaultWaiting(): Promise<string | null> {
  try {
    const r = await pgRest(`settings?select=default_waiting_url&limit=1`);
    if (!r.ok) return null;
    const data = (await r.json()) as { default_waiting_url: string | null };
    return data?.default_waiting_url ?? null;
  } catch {
    return null;
  }
}

// ── Destination resolution (pure CPU, no I/O) ──────────────────────────────
// Two possible outcomes now: "real" (transition page → real URL) or
// "waiting" (institutional waiting page). Decoy mode has been removed from
// the product; legacy decoy rows fall through to the waiting page.
type Pick = { kind: "real"; url: string; mode: string } | { kind: "waiting"; mode: string };

function pickDestination(link: LinkRow, isBot: boolean, ip: string): Pick {
  if (isBot) return { kind: "waiting", mode: "waiting:bot" };
  if (!link.active) return { kind: "waiting", mode: "waiting:inactive" };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now())
    return { kind: "waiting", mode: "waiting:expired" };
  if (Array.isArray(link.blocked_ips) && ip && link.blocked_ips.includes(ip))
    return { kind: "waiting", mode: "waiting:blocked_ip" };
  if (
    link.owner_only &&
    (!ip || !Array.isArray(link.owner_ips) || !link.owner_ips.includes(ip))
  )
    return { kind: "waiting", mode: "waiting:owner_only" };
  if (link.click_limit !== null && link.click_count >= link.click_limit)
    return { kind: "waiting", mode: "waiting:limit" };

  if (link.mode !== "real") return { kind: "waiting", mode: "waiting" };

  const pool: string[] =
    Array.isArray(link.real_urls) && link.real_urls.length > 0
      ? link.real_urls
      : link.real_url
        ? [link.real_url]
        : [];

  if (pool.length === 0) return { kind: "waiting", mode: "waiting:no_real_url" };

  let url: string;
  if (link.ab_test && pool.length >= 2) {
    url = Math.random() < 0.5 ? pool[0] : pool[1];
  } else if (pool.length > 1) {
    url = pool[(link.rotation_index || 0) % pool.length];
  } else {
    url = pool[0];
  }
  return { kind: "real", url, mode: "real" };
}

// ── HTML responses ─────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function transitionHtml(destination: string): Response {
  const safe = escapeHtml(destination);
  const jsSafe = destination.replace(/[\\'"<>]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const body = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Redirecionando…</title>
<meta http-equiv="refresh" content="3;url=${safe}"/>
<style>
  :root{color-scheme:dark}
  html,body{margin:0;height:100%;background:#0B0D12;color:#E6E8EC;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:24px;text-align:center}
  .spinner{width:52px;height:52px;border-radius:50%;border:3px solid rgba(255,255,255,.08);border-top-color:#A3E635;animation:spin .9s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{margin:0;font-size:14.5px;font-weight:400;color:#8A929E;letter-spacing:.01em}
</style></head>
<body><div class="wrap"><div class="spinner" aria-hidden="true"></div>
<p>Estamos te redirecionando, por favor aguarde…</p></div>
<script>setTimeout(function(){window.location.replace("${jsSafe}")},2400);</script>
</body></html>`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Cache": "MISS" },
  });
}

function waitingHtml(linkName: string | null, cacheStatus: string, redirectMs: number): Response {
  const brand = escapeHtml((linkName && linkName.trim()) || "Contato");
  const body = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>${brand}</title>
<style>
  :root{color-scheme:dark}
  html,body{margin:0;height:100%;background:#0B0D12;color:#E6E8EC;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center}
  .brand{font-size:15px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#A3E635;margin-bottom:40px}
  .pulse{position:relative;width:96px;height:96px;margin-bottom:36px}
  .pulse::before,.pulse::after{content:"";position:absolute;inset:0;border-radius:50%;background:rgba(163,230,53,.14);animation:pulse 2.4s cubic-bezier(.4,0,.6,1) infinite}
  .pulse::after{animation-delay:1.2s}
  .dot{position:absolute;inset:32px;border-radius:50%;background:#A3E635;box-shadow:0 0 32px rgba(163,230,53,.55)}
  @keyframes pulse{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.6);opacity:0}}
  h1{margin:0 0 14px;font-size:22px;font-weight:600;letter-spacing:-.01em;color:#F5F7F5;max-width:520px}
  p{margin:0;font-size:14.5px;line-height:1.6;color:#8A929E;max-width:460px;font-weight:400}
</style></head>
<body><div class="wrap">
<div class="brand">${brand}</div>
<div class="pulse" aria-hidden="true"><div class="dot"></div></div>
<h1>Em breve entraremos em contato com você</h1>
<p>Obrigado pela sua paciência.</p>
</div></body></html>`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Cache": cacheStatus,
      "Server-Timing": `redirect;dur=${redirectMs}`,
    },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// MAIN ENTRY
// ───────────────────────────────────────────────────────────────────────────
export async function handleRedirect(
  request: Request,
  slug: string,
): Promise<Response> {
  const t0 = Date.now();
  // Derive cache keys from the inbound request's own origin so caches.default
  // actually persists writes (zone-ownership requirement).
  const reqOrigin = (() => {
    try { return new URL(request.url).origin; } catch { return "https://localhost"; }
  })();
  const linkCacheKey = cacheKeyForSlug(reqOrigin, slug);
  const SETTINGS_CACHE_KEY = settingsCacheKey(reqOrigin);

  // ═══════════════════════════════════════════════════════════════════════
  // [HOT PATH] Step 1 — Resolve link from cache hierarchy
  //   mem (µs)  →  edge cache (~5–20ms)  →  DB (cold miss only)
  // ═══════════════════════════════════════════════════════════════════════
  let link: LinkRow | null = null;
  let cacheStatus: "MEM" | "HIT" | "STALE" | "MISS" = "MISS";
  let revalidate = false;

  const mem = memGet(slug);
  if (mem) {
    link = mem.value;
    const ageS = (Date.now() - mem.storedAt) / 1000;
    if (ageS <= CACHE_TTL_SECONDS) {
      cacheStatus = "MEM";
    } else {
      cacheStatus = "STALE";
      revalidate = true;
    }
  } else {
    const cached = await readCacheEntry<LinkRow | null>(linkCacheKey);
    if (cached) {
      link = cached.value;
      memSet(slug, link); // promote into isolate memory
      const ageS = (Date.now() - cached.storedAt) / 1000;
      if (ageS <= CACHE_TTL_SECONDS) {
        cacheStatus = "HIT";
      } else {
        cacheStatus = "STALE";
        revalidate = true;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // [COLD MISS FALLBACK] Step 2 — Only if no cache at all, hit Postgres.
  //   One query, only the columns we need (LINK_COLUMNS).
  //   Hard timeout: AbortSignal at 800ms — never let DB hang the redirect.
  //   Soft timeout: race against 400ms — beyond that, redirect the user to
  //   the default waiting URL while the DB lookup keeps going in background
  //   and primes the cache for the next hit.
  // ═══════════════════════════════════════════════════════════════════════
  let coldMissSoftFailed = false;
  if (cacheStatus === "MISS") {
    const ac = new AbortController();
    const hardTimer = setTimeout(() => ac.abort(), COLD_MISS_HARD_TIMEOUT_MS);
    const dbPromise = fetchLink(slug, ac.signal).then((row) => {
      memSet(slug, row);
      scheduleBackground(writeCacheEntry(linkCacheKey, row));
      return row;
    });
    const winner = await Promise.race([
      dbPromise,
      new Promise<"__soft_timeout__">((resolve) =>
        setTimeout(() => resolve("__soft_timeout__"), COLD_MISS_SOFT_TIMEOUT_MS),
      ),
    ]);
    clearTimeout(hardTimer);
    if (winner === "__soft_timeout__") {
      coldMissSoftFailed = true;
      // Keep the DB call alive so the cache warms up for the next hit.
      scheduleBackground(dbPromise.catch(() => null));
    } else {
      link = winner;
    }
  }

  // Soft-timeout fallback: institutional waiting page while the DB call
  // keeps running in the background to prime the cache for the next hit.
  if (coldMissSoftFailed) {
    const ms = Date.now() - t0;
    return waitingHtml(null, "MISS", ms);
  }

  if (!link) {
    // Unknown slug → institutional waiting page (not a 404).
    const ms = Date.now() - t0;
    return waitingHtml(null, "MISS", ms);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // [CACHE REFRESH] Step 3 — SWR background refresh (never blocks response).
  // ═══════════════════════════════════════════════════════════════════════
  if (revalidate) {
    scheduleBackground(
      (async () => {
        const fresh = await fetchLink(slug);
        memSet(slug, fresh);
        await writeCacheEntry(linkCacheKey, fresh);
      })(),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // [HOT PATH] Step 4 — Minimal inline parsing for destination selection.
  // ═══════════════════════════════════════════════════════════════════════
  const ua = request.headers.get("user-agent") || "";
  const isBot = BOT_REGEX.test(ua);
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "";

  // ═══════════════════════════════════════════════════════════════════════
  // [HOT PATH] Step 5 — Pick destination (pure CPU, no I/O).
  // ═══════════════════════════════════════════════════════════════════════
  const picked = pickDestination(link, isBot, ip);
  const modeAtClick = picked.mode;
  const redirectMs = Date.now() - t0;

  // ═══════════════════════════════════════════════════════════════════════
  // [HOT PATH] Step 6 — RESPOND. Nothing below this line touches the response.
  //   - real  → server-rendered transition page (spinner) → real_url
  //   - other → institutional waiting page (final page, no redirect)
  // ═══════════════════════════════════════════════════════════════════════
  const response =
    picked.kind === "real"
      ? transitionHtml(picked.url)
      : waitingHtml(link.name ?? null, cacheStatus, redirectMs);

  // ═══════════════════════════════════════════════════════════════════════
  // [BACKGROUND TRACKING] — Everything below runs AFTER the response is sent.
  //   - URL parse + UTM extraction
  //   - country / device / prefetch detection
  //   - cf-ray dedup
  //   - increment_link_click  RPC
  //   - record_redirect_metrics RPC
  //   - clicks insert
  // ═══════════════════════════════════════════════════════════════════════
  if (!isBot) {
    const linkId = link.id;
    const reqUrl = request.url;
    const reqHeaders = request.headers;
    const cfRay = reqHeaders.get("cf-ray") || "";
    const cacheStatusForLog = cacheStatus;

    scheduleBackground(
      (async () => {
        // Parse URL/UTMs off the hot path.
        let utmSource: string | null = null;
        let utmMedium: string | null = null;
        let utmCampaign: string | null = null;
        try {
          const url = new URL(reqUrl);
          utmSource = url.searchParams.get("utm_source");
          utmMedium = url.searchParams.get("utm_medium");
          utmCampaign = url.searchParams.get("utm_campaign");
        } catch {
          /* ignore */
        }

        const country = reqHeaders.get("cf-ipcountry") || null;
        const device = DEVICE_REGEX.test(ua) ? "mobile" : "desktop";

        // Prefetch / link-preview detection.
        const purpose =
          reqHeaders.get("purpose") ||
          reqHeaders.get("x-purpose") ||
          reqHeaders.get("sec-purpose") ||
          "";
        const isPrefetch =
          PREFETCH_REGEX.test(purpose) ||
          reqHeaders.get("x-moz") === "prefetch" ||
          (reqHeaders.get("sec-fetch-dest") === "empty" &&
            reqHeaders.get("sec-fetch-mode") === "no-cors" &&
            reqHeaders.get("sec-fetch-site") === "none");

        if (isPrefetch) return;

        // cf-ray dedup (a single user-agent retry can fire the same ray).
        if (cfRay) {
          const cache = getEdgeCache();
          if (cache) {
            try {
              const rayKey = new Request(`https://cache.internal/ray/${cfRay}`);
              const hit = await cache.match(rayKey);
              if (hit) return;
              await cache.put(
                rayKey,
                new Response("1", {
                  headers: { "Cache-Control": "public, max-age=60" },
                }),
              );
            } catch {
              /* ignore */
            }
          }
        }

        // Lazy-load supabaseAdmin INSIDE background only — keeps it out of
        // the hot path's import graph cost and isolate startup.
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        await Promise.allSettled([
          supabaseAdmin.rpc("increment_link_click", { _link_id: linkId }),
          supabaseAdmin.rpc("record_redirect_metrics", {
            _link_id: linkId,
            _ms: redirectMs,
          }),
          supabaseAdmin.from("clicks").insert({
            link_id: linkId,
            mode_at_click: modeAtClick,
            ip: ip || null,
            country,
            device,
            is_vpn: false,
            redirect_ms: redirectMs,
            cache_status: cacheStatusForLog,
            utm_source: utmSource,
            utm_medium: utmMedium,
            utm_campaign: utmCampaign,
          }),
        ]);
      })(),
    );
  }

  return response;
}
