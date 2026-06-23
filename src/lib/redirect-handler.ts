import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cloudflare Workers `waitUntil` — resolved eagerly at module load.
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
  // Fire-and-forget. Don't block the response.
  if (waitUntilImpl) {
    try {
      waitUntilImpl(p);
      return;
    } catch {
      /* fall through */
    }
  }
  // If waitUntil isn't ready yet, await its resolution then register.
  // This still runs OFF the hot path because the caller doesn't await us.
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

// Edge cache. We serve stale entries instantly and revalidate in the background.
const CACHE_TTL_SECONDS = 300; // fresh window
const CACHE_SWR_SECONDS = 3600; // entries up to 1h old still get served, then refresh
const cacheKeyForSlug = (slug: string) =>
  new Request(`https://cache.internal/link/${encodeURIComponent(slug)}`);
const SETTINGS_CACHE_KEY = new Request(
  "https://cache.internal/settings/default_waiting",
);

// ── In-memory isolate cache ────────────────────────────────────────────────
// Workers isolates stay warm for many requests. Reading from a Map is ~µs vs
// ~5–20ms for the edge Cache API. This is the single biggest hot-path win.
type MemEntry<T> = { value: T; storedAt: number };
const MEM_MAX = 500;
const memLinks = new Map<string, MemEntry<LinkRow | null>>();
const memSettings: { current: MemEntry<string | null> | null } = { current: null };

function memGet(slug: string): MemEntry<LinkRow | null> | null {
  const hit = memLinks.get(slug);
  if (!hit) return null;
  // refresh LRU position
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
          // Keep on edge for up to SWR window; we manage freshness ourselves.
          "Cache-Control": `public, max-age=${CACHE_SWR_SECONDS}, s-maxage=${CACHE_SWR_SECONDS}`,
        },
      }),
    );
  } catch {
    /* ignore */
  }
}

export async function purgeSlugCache(slug: string): Promise<boolean> {
  memLinks.delete(slug);
  const cache = getEdgeCache();
  if (!cache) return false;
  try {
    return await cache.delete(cacheKeyForSlug(slug));
  } catch {
    return false;
  }
}

const BOT_REGEX =
  /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|whatsapp|telegram|discord|slack|linkedin|embedly|preview|fetch|monitor|curl|wget|python-requests|httpclient|axios|headless/i;

const FALLBACK = "https://google.com";

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

// Raw PostgREST fetch — bypasses supabase-js overhead on the hot path.
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

function pickDestination(
  link: LinkRow,
  defaultWaiting: string | null,
  isBot: boolean,
  ip: string,
): { url: string; mode: string } {
  const decoy = link.decoy_url || defaultWaiting || FALLBACK;
  const waiting = defaultWaiting || link.decoy_url || FALLBACK;

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

export async function handleRedirect(
  request: Request,
  slug: string,
): Promise<Response> {
  const startTime = Date.now();
  const url = new URL(request.url);
  const linkCacheKey = cacheKeyForSlug(slug);

  // 1. Edge cache — serve stale instantly if present.
  const cached = await readCacheEntry<LinkRow | null>(linkCacheKey);
  let link: LinkRow | null = cached?.value ?? null;
  let cacheStatus: "HIT" | "STALE" | "MISS" = "MISS";
  let revalidate = false;

  if (cached) {
    const age = (Date.now() - cached.storedAt) / 1000;
    if (age <= CACHE_TTL_SECONDS) {
      cacheStatus = "HIT";
    } else {
      cacheStatus = "STALE";
      revalidate = true;
    }
  }

  // 2. Cache miss → fetch link AND settings in parallel (saves a round-trip
  //    when the mode ends up being `waiting` or hits a click limit).
  let defaultWaitingPromise: Promise<string | null> | null = null;
  if (!cached) {
    const [linkRes, waitingRes] = await Promise.all([
      fetchLink(slug),
      fetchDefaultWaiting(),
    ]);
    link = linkRes;
    defaultWaitingPromise = Promise.resolve(waitingRes);
    scheduleBackground(writeCacheEntry(linkCacheKey, link));
    scheduleBackground(writeCacheEntry(SETTINGS_CACHE_KEY, waitingRes));
  } else if (revalidate) {
    scheduleBackground(
      (async () => {
        const fresh = await fetchLink(slug);
        await writeCacheEntry(linkCacheKey, fresh);
      })(),
    );
  }

  if (!link) {
    return Response.redirect(FALLBACK, 302);
  }

  // 3. Default waiting URL — only needed for waiting/limit modes.
  let defaultWaiting: string | null = null;
  if (
    link.mode === "waiting" ||
    (link.click_limit !== null && link.click_count >= link.click_limit)
  ) {
    if (defaultWaitingPromise) {
      defaultWaiting = await defaultWaitingPromise;
    } else {
      const cachedSettings = await readCacheEntry<string | null>(SETTINGS_CACHE_KEY);
      if (cachedSettings) {
        defaultWaiting = cachedSettings.value;
        const age = (Date.now() - cachedSettings.storedAt) / 1000;
        if (age > CACHE_TTL_SECONDS) {
          scheduleBackground(
            (async () => {
              const fresh = await fetchDefaultWaiting();
              await writeCacheEntry(SETTINGS_CACHE_KEY, fresh);
            })(),
          );
        }
      } else {
        defaultWaiting = await fetchDefaultWaiting();
        scheduleBackground(writeCacheEntry(SETTINGS_CACHE_KEY, defaultWaiting));
      }
    }
  }

  const ua = request.headers.get("user-agent") || "";
  const isBot = BOT_REGEX.test(ua);
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "";
  const country = request.headers.get("cf-ipcountry") || null;
  const device = /mobile|android|iphone|ipad|ipod/i.test(ua)
    ? "mobile"
    : "desktop";

  // Prefetch / link-preview detection.
  const purpose =
    request.headers.get("purpose") ||
    request.headers.get("x-purpose") ||
    request.headers.get("sec-purpose") ||
    "";
  const isPrefetch =
    /prefetch|preview|prerender/i.test(purpose) ||
    request.headers.get("x-moz") === "prefetch" ||
    (request.headers.get("sec-fetch-dest") === "empty" &&
      request.headers.get("sec-fetch-mode") === "no-cors" &&
      request.headers.get("sec-fetch-site") === "none");

  const cfRay = request.headers.get("cf-ray") || "";
  const skipTracking = isBot || isPrefetch;

  const { url: destination, mode: modeAtClick } = pickDestination(
    link,
    defaultWaiting,
    isBot,
    ip,
  );

  const redirectMs = Date.now() - startTime;

  // 4. Build and return response IMMEDIATELY. All writes go to background.
  const response = new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      "Cache-Control": "no-store",
      "X-Cache": cacheStatus,
      "Server-Timing": `redirect;dur=${redirectMs}`,
    },
  });

  if (!skipTracking) {
    const linkId = link.id;
    const utmSource = url.searchParams.get("utm_source");
    const utmMedium = url.searchParams.get("utm_medium");
    const utmCampaign = url.searchParams.get("utm_campaign");

    scheduleBackground(
      (async () => {
        // cf-ray dedup off the hot path
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
