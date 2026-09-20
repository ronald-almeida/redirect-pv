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


function waitingHtml(linkName: string | null, redirectMs: number): Response {
  const brand = escapeHtml((linkName && linkName.trim()) || "Contato");
  const pageIndex = Math.floor(Math.random() * 3) + 1;
  const sharedHead = `<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>${brand}</title>`;

  const pages: Record<number, string> = {
    1: `<!doctype html><html lang="pt-BR"><head>${sharedHead}<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#fff;color:#171717;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased}body{min-height:100vh;display:grid;place-items:center}.wrap{width:min(100%,720px);padding:40px 24px;text-align:center}.brand{margin:0 0 22px;font-size:clamp(36px,8vw,72px);line-height:1.05;font-weight:800;overflow-wrap:anywhere}.message{margin:0;color:#666;font-size:clamp(17px,3vw,21px);line-height:1.6}.dots{height:18px;margin-top:28px;display:flex;align-items:center;justify-content:center;gap:8px}.dots i{display:block;width:7px;height:7px;border-radius:50%;background:#303030;animation:dot 1.2s ease-in-out infinite}.dots i:nth-child(2){animation-delay:.16s}.dots i:nth-child(3){animation-delay:.32s}@keyframes dot{0%,60%,100%{transform:translateY(0);opacity:.28}30%{transform:translateY(-7px);opacity:1}}@media(prefers-reduced-motion:reduce){.dots i{animation:none;opacity:.55}}
</style></head><body><main class="wrap"><h1 class="brand">${brand}</h1><p class="message">Em breve entraremos em contato com você.</p><div class="dots" aria-label="Aguardando"><i></i><i></i><i></i></div></main></body></html>`,
    2: `<!doctype html><html lang="pt-BR"><head>${sharedHead}<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0a0a0a;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased}body{min-height:100vh;display:grid;place-items:center;overflow:hidden}.wrap{width:min(100%,760px);padding:40px 24px;text-align:center}.pulse{position:relative;width:90px;height:90px;margin:0 auto 42px}.pulse:before,.pulse:after{content:"";position:absolute;inset:0;border:1px solid #8b5cf6;border-radius:50%;animation:pulse 2.4s ease-out infinite}.pulse:after{animation-delay:1.2s}.core{position:absolute;inset:30px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#a855f7);box-shadow:0 0 34px rgba(139,92,246,.6)}.brand{margin:0 0 20px;font-size:clamp(38px,8vw,76px);line-height:1.06;font-weight:800;overflow-wrap:anywhere;background:linear-gradient(90deg,#818cf8,#c084fc);-webkit-background-clip:text;background-clip:text;color:transparent}.message{margin:0 auto;max-width:560px;color:#a3a3a3;font-size:clamp(17px,3vw,21px);line-height:1.65}@keyframes pulse{0%{transform:scale(.55);opacity:.9}100%{transform:scale(1.65);opacity:0}}@media(prefers-reduced-motion:reduce){.pulse:before,.pulse:after{animation:none;opacity:.28}}
</style></head><body><main class="wrap"><div class="pulse" aria-hidden="true"><span class="core"></span></div><h1 class="brand">${brand}</h1><p class="message">Estamos preparando algo especial para você. Aguarde.</p></main></body></html>`,
    3: `<!doctype html><html lang="pt-BR"><head>${sharedHead}<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;color:#27233a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased}body{min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#dff4ff 0%,#eee5ff 100%)}.card{width:min(100%,620px);padding:clamp(36px,8vw,64px) clamp(24px,7vw,56px);text-align:center;background:#fff;border:1px solid rgba(99,102,241,.12);border-radius:24px;box-shadow:0 24px 70px rgba(76,70,130,.14)}.wave{display:flex;justify-content:center;align-items:end;gap:6px;height:38px;margin:0 auto 28px}.wave i{display:block;width:8px;height:20px;border-radius:8px;background:#818cf8;animation:wave 1s ease-in-out infinite}.wave i:nth-child(2){height:30px;animation-delay:.12s}.wave i:nth-child(3){height:24px;animation-delay:.24s}.wave i:nth-child(4){height:34px;animation-delay:.36s}.wave i:nth-child(5){animation-delay:.48s}.brand{margin:0 0 18px;color:#4f46e5;font-size:clamp(32px,7vw,58px);line-height:1.08;font-weight:800;overflow-wrap:anywhere}.message{margin:0;color:#67627b;font-size:clamp(16px,3vw,20px);line-height:1.65}@keyframes wave{0%,100%{transform:translateY(0) scaleY(.65);opacity:.55}50%{transform:translateY(-7px) scaleY(1);opacity:1}}@media(max-width:480px){body{padding:16px}.card{border-radius:18px}}@media(prefers-reduced-motion:reduce){.wave i{animation:none}}
</style></head><body><main class="card"><div class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><h1 class="brand">${brand}</h1><p class="message">Olá! Em breve um de nossos atendentes entrará em contato.</p></main></body></html>`,
  };
  const body = pages[pageIndex];
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
      ? new Response(null, {
          status: 302,
          headers: { Location: picked.url, "Cache-Control": "no-store" },
        })
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
