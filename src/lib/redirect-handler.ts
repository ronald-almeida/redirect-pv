/**
 * Redirect hot path — NO CACHE.
 *
 * Every request fetches fresh link data directly from Supabase. All caching
 * (edge cache, per-isolate memory, TTL/SWR) has been removed to guarantee
 * that admin edits (e.g. flipping mode to "real") take effect on the very
 * next request.
 *
 * Analytics/metrics still run in the background via waitUntil so they
 * never block the response.
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

// Raw PostgREST — bypasses supabase-js for ~5ms savings.
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
      "Cache-Control": "no-store",
      ...(init?.headers || {}),
    },
    // @ts-ignore - Cloudflare-specific: never cache upstream fetch
    cf: { cacheTtl: 0, cacheEverything: false },
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

// ── Destination resolution (pure CPU, no I/O) ──────────────────────────────
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
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function waitingHtml(linkName: string | null, redirectMs: number): Response {
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
      "Server-Timing": `redirect;dur=${redirectMs}`,
    },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// MAIN ENTRY — no cache, fresh Supabase read on every request
// ───────────────────────────────────────────────────────────────────────────
export async function handleRedirect(
  request: Request,
  slug: string,
): Promise<Response> {
  const t0 = Date.now();

  const link = await fetchLink(slug);

  if (!link) {
    const ms = Date.now() - t0;
    return waitingHtml(null, ms);
  }

  const ua = request.headers.get("user-agent") || "";
  const isBot = BOT_REGEX.test(ua);
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "";

  const picked = pickDestination(link, isBot, ip);
  const modeAtClick = picked.mode;
  const redirectMs = Date.now() - t0;

  console.log("[redirect] link data:", JSON.stringify({
    slug, mode: link.mode, real_url: link.real_url,
    active: link.active, expires_at: link.expires_at, owner_only: link.owner_only,
    click_limit: link.click_limit, click_count: link.click_count,
  }));
  console.log("[redirect] picked:", picked.kind, "modeAtClick:", modeAtClick);

  const response =
    picked.kind === "real"
      ? transitionHtml(picked.url)
      : waitingHtml(link.name ?? null, redirectMs);

  // [BACKGROUND TRACKING]
  if (!isBot) {
    const linkId = link.id;
    const reqUrl = request.url;
    const reqHeaders = request.headers;

    scheduleBackground(
      (async () => {
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
            cache_status: "NONE",
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
