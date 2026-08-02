/**
 * Big Cloak — redirect hot path. NO CACHE.
 *
 * Toda requisição lê os dados frescos direto do banco, garantindo que uma
 * edição no painel valha no próximo acesso. A resolução de slug foi
 * consolidada em UMA única consulta (antes eram até 4 sequenciais).
 *
 * Analytics/métricas continuam rodando em segundo plano via waitUntil e
 * nunca bloqueiam a resposta.
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

/** Atraso da tela de transição antes do destino real (ms). */
const TRANSITION_MS = 600;

type LinkRow = {
  id: string;
  slug: string;
  name: string | null;
  mode: string;
  real_url: string | null;
  decoy_url: string | null;
  active: boolean;
  archived_at: string | null;
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
  "id,slug,name,mode,real_url,decoy_url,active,archived_at,expires_at,click_limit,click_count,allowed_countries,blocked_ips,real_urls,ab_test,rotation_index,owner_only,owner_ips";

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
      "Cache-Control": "no-store",
      ...(init?.headers || {}),
    },
    // @ts-ignore - Cloudflare-specific: never cache upstream fetch
    cf: { cacheTtl: 0, cacheEverything: false },
  });
}

async function fetchMany(query: string): Promise<LinkRow[]> {
  try {
    const r = await pgRest(query);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? (j as LinkRow[]) : [];
  } catch {
    return [];
  }
}

/**
 * Resolve o slug em UMA consulta.
 *
 * Candidatos (mesma tolerância de antes, agora em paralelo no Postgres):
 * 1. caminho completo + query string (alguns slugs contêm "?")
 * 2. caminho puro
 * 3. último segmento do caminho
 * 4. último segmento + query string
 *
 * Só cai para a busca por sufixo (LIKE) se nenhum candidato exato bater.
 */
async function fetchLink(slug: string, search: string): Promise<LinkRow | null> {
  const bare = slug.replace(/^\/+/, "");
  if (!bare) return null;

  const last = bare.split("/").filter(Boolean).pop() || bare;
  const candidates = Array.from(
    new Set([bare + (search || ""), bare, last, last + (search || "")]),
  ).filter(Boolean);

  // PostgREST `or` precisa de valores entre aspas quando contêm vírgula/ponto.
  const orExpr = candidates.map((c) => `slug.eq."${c.replace(/"/g, '\\"')}"`).join(",");
  const rows = await fetchMany(
    `links?or=(${encodeURIComponent(orExpr)})&select=${LINK_COLUMNS}&limit=${candidates.length}`,
  );

  if (rows.length > 0) {
    // Respeita a ordem de prioridade dos candidatos.
    for (const c of candidates) {
      const hit = rows.find((r) => r.slug === c);
      if (hit) return hit;
    }
    return rows[0];
  }

  // Fallback: slug salvo como URL completa colada (ex.: "https//dom.com/abc").
  const suffix = await fetchMany(
    `links?slug=like.*${encodeURIComponent(last)}*&select=${LINK_COLUMNS}&limit=1`,
  );
  return suffix[0] ?? null;
}

// ── Destination resolution (pure CPU, no I/O) ──────────────────────────────
type Pick = { kind: "real"; url: string; mode: string } | { kind: "waiting"; mode: string };

function pickDestination(link: LinkRow, isBot: boolean, ip: string): Pick {
  if (isBot) return { kind: "waiting", mode: "waiting:bot" };
  if (link.archived_at) return { kind: "waiting", mode: "waiting:archived" };
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
  const jsSafe = destination.replace(
    /[\\'"<>]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  const body = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Redirecionando…</title>
<link rel="preconnect" href="${safe}"/>
<meta http-equiv="refresh" content="2;url=${safe}"/>
<style>
  :root{color-scheme:dark}
  html,body{margin:0;height:100%;background:#0B0F0E;color:#E8EDEA;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:24px;text-align:center}
  .spinner{width:52px;height:52px;border-radius:50%;border:3px solid rgba(255,255,255,.07);border-top-color:#34D399;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{margin:0;font-size:15px;color:#8A968F;letter-spacing:.01em}
</style></head>
<body><div class="wrap"><div class="spinner" aria-hidden="true"></div>
<p>Estamos te redirecionando…</p></div>
<script>setTimeout(function(){window.location.replace("${jsSafe}")},${TRANSITION_MS});</script>
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
  html,body{margin:0;height:100%;background:#0B0F0E;color:#E8EDEA;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center}
  .brand{font-size:15px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#34D399;margin-bottom:40px}
  .pulse{position:relative;width:96px;height:96px;margin-bottom:36px}
  .pulse::before,.pulse::after{content:"";position:absolute;inset:0;border-radius:50%;background:rgba(52,211,153,.14);animation:pulse 2.4s cubic-bezier(.4,0,.6,1) infinite}
  .pulse::after{animation-delay:1.2s}
  .dot{position:absolute;inset:32px;border-radius:50%;background:#34D399;box-shadow:0 0 32px rgba(52,211,153,.5)}
  @keyframes pulse{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.6);opacity:0}}
  h1{margin:0 0 14px;font-size:22px;font-weight:600;letter-spacing:-.01em;color:#F1F5F3;max-width:520px}
  p{margin:0;font-size:14.5px;line-height:1.6;color:#8A968F;max-width:460px}
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
export async function handleRedirect(request: Request, slug: string): Promise<Response> {
  const t0 = Date.now();

  let search = "";
  let host = "";
  try {
    const u = new URL(request.url);
    search = u.search;
    host = u.host;
  } catch {
    /* ignore */
  }

  const link = await fetchLink(slug, search);

  if (!link) {
    return waitingHtml(null, Date.now() - t0);
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
            host: host || null,
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
