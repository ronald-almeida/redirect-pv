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
  "id,mode,real_url,decoy_url,active,expires_at,click_limit,click_count,allowed_countries,blocked_ips,real_urls,ab_test,rotation_index,owner_only,owner_ips";

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

async function fetchLink(slug: string): Promise<LinkRow | null> {
  try {
    const r = await pgRest(
      `links?slug=eq.${encodeURIComponent(slug)}&select=${LINK_COLUMNS}&limit=1`,
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
function pickDestination(
  link: LinkRow,
  defaultWaiting: string | null,
  isBot: boolean,
  ip: string,
): { url: string | null; mode: string } {
  const decoy = link.decoy_url || defaultWaiting || null;
  const waiting = defaultWaiting || link.decoy_url || null;

  if (isBot) return { url: decoy, mode: "decoy:bot" };
  if (!link.active) return { url: decoy, mode: "decoy:inactive" };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now())
    return { url: decoy, mode: "decoy:expired" };
  if (Array.isArray(link.blocked_ips) && ip && link.blocked_ips.includes(ip))
    return { url: decoy, mode: "decoy:blocked_ip" };
  if (
    link.owner_only &&
    (!ip || !Array.isArray(link.owner_ips) || !link.owner_ips.includes(ip))
  )
    return { url: decoy, mode: "decoy:owner_only" };
  if (link.click_limit !== null && link.click_count >= link.click_limit)
    return { url: waiting, mode: "waiting:limit" };

  if (link.mode === "waiting") return { url: waiting, mode: "waiting" };
  if (link.mode === "decoy") return { url: decoy, mode: "decoy" };

  const pool: string[] =
    Array.isArray(link.real_urls) && link.real_urls.length > 0
      ? link.real_urls
      : link.real_url
        ? [link.real_url]
        : [];

  if (pool.length === 0) return { url: decoy, mode: "decoy:no_real_url" };

  if (link.ab_test && pool.length >= 2) {
    return { url: Math.random() < 0.5 ? pool[0] : pool[1], mode: "real" };
  }
  if (pool.length > 1) {
    const idx = (link.rotation_index || 0) % pool.length;
    return { url: pool[idx], mode: "real" };
  }
  return { url: pool[0], mode: "real" };
}

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Cache": "MISS" },
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
  //   Settings are NOT fetched here — only on demand for waiting/limit modes.
  // ═══════════════════════════════════════════════════════════════════════
  if (cacheStatus === "MISS") {
    link = await fetchLink(slug);
    memSet(slug, link);
    scheduleBackground(writeCacheEntry(linkCacheKey, link));
  }

  if (!link) {
    // Unknown slug → fast 404. No tracking, no cache write of garbage.
    return notFound();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // [CACHE REFRESH] Step 3 — SWR background refresh (never blocks 302).
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
  //   UA: regex on a short string (~µs)
  //   IP: header read (~µs)
  //   Everything else is deferred to background.
  // ═══════════════════════════════════════════════════════════════════════
  const ua = request.headers.get("user-agent") || "";
  const isBot = BOT_REGEX.test(ua);
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "";

  // ═══════════════════════════════════════════════════════════════════════
  // [HOT PATH] Step 5 — Settings on demand.
  //   Only fetched when the link is in waiting mode OR hit click_limit.
  //   Common real-redirect path never touches settings.
  // ═══════════════════════════════════════════════════════════════════════
  let defaultWaiting: string | null = null;
  const needsSettings =
    link.mode === "waiting" ||
    (link.click_limit !== null && link.click_count >= link.click_limit);

  if (needsSettings) {
    if (memSettings.current) {
      defaultWaiting = memSettings.current.value;
      const ageS = (Date.now() - memSettings.current.storedAt) / 1000;
      if (ageS > CACHE_TTL_SECONDS) {
        scheduleBackground(
          (async () => {
            const fresh = await fetchDefaultWaiting();
            memSettings.current = { value: fresh, storedAt: Date.now() };
            await writeCacheEntry(SETTINGS_CACHE_KEY, fresh);
          })(),
        );
      }
    } else {
      const cachedSettings =
        await readCacheEntry<string | null>(SETTINGS_CACHE_KEY);
      if (cachedSettings) {
        defaultWaiting = cachedSettings.value;
        memSettings.current = {
          value: cachedSettings.value,
          storedAt: cachedSettings.storedAt,
        };
      } else {
        // Absolute cold miss for settings — single DB hit, then cached forever (SWR).
        defaultWaiting = await fetchDefaultWaiting();
        memSettings.current = { value: defaultWaiting, storedAt: Date.now() };
        scheduleBackground(writeCacheEntry(SETTINGS_CACHE_KEY, defaultWaiting));
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // [HOT PATH] Step 6 — Pick destination (pure CPU, no I/O).
  // ═══════════════════════════════════════════════════════════════════════
  const { url: destination, mode: modeAtClick } = pickDestination(
    link,
    defaultWaiting,
    isBot,
    ip,
  );

  if (!destination) {
    // No real, decoy, or waiting URL configured — 404 instead of redirecting somewhere weird.
    return notFound();
  }

  const redirectMs = Date.now() - t0;

  // ═══════════════════════════════════════════════════════════════════════
  // [HOT PATH] Step 7 — RESPOND. Nothing below this line touches the response.
  // ═══════════════════════════════════════════════════════════════════════
  const response = new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      "Cache-Control": "no-store",
      "X-Cache": cacheStatus,
      "Server-Timing": `redirect;dur=${redirectMs}`,
    },
  });

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
