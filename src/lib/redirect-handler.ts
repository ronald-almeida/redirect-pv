import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cloudflare Workers provides a top-level `waitUntil` from the
// `cloudflare:workers` virtual module that hooks into the current
// request's execution context. We resolve it EAGERLY at module load
// so the first request doesn't lose its tracking promise to the async
// dynamic import resolving after the response is sent.
let waitUntilImpl: ((p: Promise<unknown>) => void) | null = null;
const waitUntilReady: Promise<void> = (async () => {
  try {
    // @ts-expect-error - virtual module provided by the Workers runtime
    const mod: any = await import(/* @vite-ignore */ "cloudflare:workers");
    waitUntilImpl = mod.waitUntil ?? null;
    console.log(`[redirect] waitUntil ${waitUntilImpl ? "ready" : "unavailable"}`);
  } catch {
    waitUntilImpl = null;
    console.log("[redirect] waitUntil unavailable (non-Workers runtime)");
  }
})();

async function waitUntilSafe(p: Promise<unknown>): Promise<void> {
  // Make sure the Workers runtime resolution finished before we decide
  // whether to register the promise or await it inline.
  await waitUntilReady;
  if (waitUntilImpl) {
    try {
      waitUntilImpl(p);
      return;
    } catch (e) {
      console.error("[redirect] waitUntil registration failed", e);
    }
  }
  // Fallback: await inline so the promise actually completes (e.g. local SSR).
  try {
    await p;
  } catch (e) {
    console.error("[redirect] inline tracking failed", e);
  }
}

// Cloudflare Cache API helpers. `caches.default` exists only in the Workers
// runtime; in local dev SSR we silently no-op.
const CACHE_TTL_SECONDS = 30;
const cacheKeyForSlug = (slug: string) =>
  new Request(`https://cache.internal/link/${encodeURIComponent(slug)}`);
const SETTINGS_CACHE_KEY = new Request(
  "https://cache.internal/settings/default_waiting",
);

function getEdgeCache(): Cache | null {
  try {
    // @ts-ignore - `caches` is a Workers global
    return typeof caches !== "undefined" && caches?.default ? caches.default : null;
  } catch {
    return null;
  }
}

async function readCachedJSON<T>(key: Request): Promise<T | null> {
  const cache = getEdgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(key);
    if (!hit) return null;
    return (await hit.json()) as T;
  } catch {
    return null;
  }
}

async function writeCachedJSON(key: Request, value: unknown, ttl = CACHE_TTL_SECONDS) {
  const cache = getEdgeCache();
  if (!cache) return;
  try {
    await cache.put(
      key,
      new Response(JSON.stringify(value), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}`,
        },
      }),
    );
  } catch {
    /* ignore cache failures */
  }
}

export async function purgeSlugCache(slug: string): Promise<boolean> {
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

type CachedLink = {
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
} | null;

function pickDestination(
  link: any,
  defaultWaiting: string | null,
  isBot: boolean,
  ip: string,
): { url: string; mode: string } {
  const decoy = link.decoy_url || defaultWaiting || FALLBACK;
  const waiting = defaultWaiting || link.decoy_url || FALLBACK;

  if (isBot) return { url: decoy, mode: `decoy:bot` };
  if (!link.active) return { url: decoy, mode: `decoy:inactive` };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now())
    return { url: decoy, mode: `decoy:expired` };
  if (Array.isArray(link.blocked_ips) && ip && link.blocked_ips.includes(ip))
    return { url: decoy, mode: `decoy:blocked_ip` };
  if (
    link.owner_only &&
    (!ip || !Array.isArray(link.owner_ips) || !link.owner_ips.includes(ip))
  )
    return { url: decoy, mode: `decoy:owner_only` };
  if (link.click_limit !== null && link.click_count >= link.click_limit)
    return { url: waiting, mode: `waiting:limit` };

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
  console.log(`[redirect] hit slug=${slug}`);
  const url = new URL(request.url);
  const linkCacheKey = cacheKeyForSlug(slug);

  // 1. Try the edge cache first.
  let link = await readCachedJSON<CachedLink>(linkCacheKey);
  let cacheHit = link !== null;

  // 2. Fall back to Supabase on miss.
  if (!cacheHit) {
    const { data } = await supabaseAdmin
      .from("links")
      .select(
        "id, mode, real_url, decoy_url, active, expires_at, click_limit, click_count, allowed_countries, blocked_ips, real_urls, ab_test, rotation_index, owner_only, owner_ips",
      )
      .eq("slug", slug)
      .maybeSingle();
    link = (data as CachedLink) ?? null;
    // Cache both hits and misses (short TTL) to absorb bursts of bad traffic.
    void waitUntilSafe(writeCachedJSON(linkCacheKey, link));
  }

  if (!link) {
    return Response.redirect(FALLBACK, 302);
  }

  // 3. Default waiting URL — also cached.
  let defaultWaiting: string | null = null;
  if (
    link.mode === "waiting" ||
    (link.click_limit !== null && link.click_count >= link.click_limit)
  ) {
    const cachedSettings = await readCachedJSON<{ url: string | null }>(
      SETTINGS_CACHE_KEY,
    );
    if (cachedSettings) {
      defaultWaiting = cachedSettings.url;
    } else {
      const { data: settings } = await supabaseAdmin
        .from("settings")
        .select("default_waiting_url")
        .limit(1)
        .maybeSingle();
      defaultWaiting = settings?.default_waiting_url ?? null;
      void waitUntilSafe(
        writeCachedJSON(SETTINGS_CACHE_KEY, { url: defaultWaiting }),
      );
    }
  }

  const ua = request.headers.get("user-agent") || "";
  const isBot = BOT_REGEX.test(ua);
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("cf-connecting-ip") ||
    "";
  const country = request.headers.get("cf-ipcountry") || null;
  const device = /mobile|android|iphone|ipad|ipod/i.test(ua)
    ? "mobile"
    : "desktop";

  const { url: destination, mode: modeAtClick } = pickDestination(
    link,
    defaultWaiting,
    isBot,
    ip,
  );

  // Measure end-to-end handler time so we can store it on the click row
  // and update the link's running average. Captured BEFORE the response
  // is built so it reflects the actual redirect latency.
  const redirectMs = Date.now() - startTime;

  // Fire-and-forget tracking. Each write is independent (Promise.allSettled),
  // so a failure in one step (e.g. metrics RPC) cannot roll back the others.
  // Logged explicitly so failures are visible in worker logs.
  console.log(
    `[redirect] tracking start link_id=${link.id} slug=${slug} mode=${modeAtClick} ms=${redirectMs}`,
  );

  const trackStep = async <T,>(label: string, p: PromiseLike<T>): Promise<T | null> => {
    try {
      const res: any = await p;
      if (res?.error) {
        console.error(`[redirect] ${label} ERROR`, JSON.stringify(res.error));
      } else {
        console.log(`[redirect] ${label} OK`);
      }
      return res;
    } catch (e: any) {
      console.error(
        `[redirect] ${label} FAILED`,
        JSON.stringify({ message: e?.message, name: e?.name, stack: e?.stack, raw: e }),
      );
      return null;
    }
  };

  const trackingPromise = (async () => {
    const results = await Promise.allSettled([
      trackStep(
        "increment_link_click",
        supabaseAdmin.rpc("increment_link_click", { _link_id: link!.id }),
      ),
      trackStep(
        "record_redirect_metrics",
        supabaseAdmin.rpc("record_redirect_metrics", {
          _link_id: link!.id,
          _ms: redirectMs,
        }),
      ),
      trackStep(
        "clicks.insert",
        supabaseAdmin.from("clicks").insert({
          link_id: link!.id,
          mode_at_click: modeAtClick,
          ip: ip || null,
          country,
          device,
          is_vpn: false,
          redirect_ms: redirectMs,
          utm_source: url.searchParams.get("utm_source"),
          utm_medium: url.searchParams.get("utm_medium"),
          utm_campaign: url.searchParams.get("utm_campaign"),
        }),
      ),
    ]);
    console.log(
      `[redirect] tracking done`,
      results.map((r) => r.status).join(","),
    );
  })();

  void waitUntilSafe(trackingPromise);

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      "Cache-Control": "no-store",
      "X-Cache": cacheHit ? "HIT" : "MISS",
      "Server-Timing": `redirect;dur=${redirectMs}`,
    },
  });
}
