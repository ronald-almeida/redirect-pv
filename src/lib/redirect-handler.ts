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
  const themes = ["id01", "id02", "id10"] as const;
  const theme = themes[Math.floor(Math.random() * themes.length)];
  const year = new Date().getFullYear();

  const body = `<!doctype html>
<html lang="pt-BR" data-estilo="${theme}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<meta name="description" content="Conheça a ${brand}, nossos serviços e canais de atendimento."/>
<title>${brand}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}body.modal-open{overflow:hidden}a{color:inherit;text-decoration:none}button{font:inherit}.shell{width:min(1120px,calc(100% - 40px));margin-inline:auto}.top{position:sticky;top:0;z-index:20;border-bottom:1px solid var(--border);background:var(--header);backdrop-filter:blur(16px)}.nav{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:flex;min-width:0;align-items:center;gap:11px;font-family:var(--font-title);font-size:16px}.brand-mark{width:25px;height:25px;flex:none;border:6px solid var(--accent);background:var(--accent2);border-radius:var(--radius)}.brand-name{overflow-wrap:anywhere}.nav-links{display:none;align-items:center;gap:24px;color:var(--muted);font-size:14px;font-weight:600}.nav-links a{transition:color .2s}.nav-links a:hover{color:var(--accent)}.hero{position:relative;overflow:hidden;min-height:650px;display:grid;align-items:center;padding:76px 0;background:var(--hero-bg);border-bottom:1px solid var(--border)}.hero-inner{position:relative;z-index:1;display:grid;gap:36px;text-align:var(--hero-align)}.eyebrow{margin:0 0 18px;color:var(--accent);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.hero h1{max-width:850px;margin:0;font-family:var(--font-title);font-size:clamp(40px,9vw,78px);line-height:1.03;letter-spacing:0;overflow-wrap:anywhere}.hero h1 span{display:block;color:var(--accent)}.subtitle{max-width:650px;margin:24px 0 30px;color:var(--muted);font-size:17px;line-height:1.75}.actions{display:flex;flex-direction:column;gap:11px;align-items:var(--action-align)}.btn{display:inline-flex;min-height:50px;align-items:center;justify-content:center;padding:0 22px;border:1px solid var(--accent);border-radius:var(--button-radius);font-weight:700;transition:transform .2s,box-shadow .2s,background .2s}.btn:hover{transform:translateY(-2px);box-shadow:var(--button-shadow)}.btn-primary{background:var(--accent);color:var(--on-accent)}.btn-secondary{background:transparent;color:var(--text);border-color:var(--border-strong)}.hero-art{display:none;min-height:310px;border:1px solid var(--border);border-radius:var(--radius);background:var(--art);position:relative;overflow:hidden}.hero-art:before,.hero-art:after{content:"";position:absolute;border:1px solid var(--accent);inset:16%;transform:rotate(12deg)}.hero-art:after{inset:29%;border-color:var(--accent2);transform:rotate(-10deg)}section{scroll-margin-top:68px}.info-section,.registry{padding:74px 0}.section-head{max-width:680px;margin-bottom:32px}.section-label{color:var(--accent);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.11em}.section-head h2{margin:10px 0 0;font-family:var(--font-title);font-size:clamp(29px,6vw,46px);line-height:1.12;letter-spacing:0}.cards{display:grid;gap:16px}.card{padding:26px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow);transition:transform .25s,border-color .25s}.card:hover{transform:translateY(-5px);border-color:var(--accent)}.card-icon{display:grid;width:42px;height:42px;place-items:center;margin-bottom:22px;border-radius:var(--icon-radius);background:var(--accent-soft);color:var(--accent);font-weight:800}.card h3{margin:0 0 10px;font-family:var(--font-title);font-size:20px;letter-spacing:0}.card p{margin:0;color:var(--muted);line-height:1.7}.card a{display:inline-block;margin-top:18px;color:var(--accent);font-size:14px;font-weight:700}.registry{background:var(--section-bg);border-block:1px solid var(--border)}.table-wrap{overflow:hidden;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow)}table{width:100%;border-collapse:collapse}th,td{display:block;padding:13px 18px;text-align:left}th{padding-bottom:2px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}td{padding-top:2px;font-weight:600;overflow-wrap:anywhere}tr{display:block;border-bottom:1px solid var(--border)}tr:last-child{border-bottom:0}.footer{padding:30px 0;background:var(--footer-bg);color:var(--footer-text)}.footer-inner{display:flex;flex-direction:column;gap:18px}.footer-brand{font-family:var(--font-title);overflow-wrap:anywhere}.copyright{margin-top:5px;color:var(--muted);font-size:12px}.legal-links{display:flex;flex-wrap:wrap;gap:18px}.legal-link{padding:0;border:0;background:none;color:var(--footer-text);cursor:pointer;font-size:13px;text-decoration:underline;text-underline-offset:4px}.modal[hidden]{display:none}.modal{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.72);animation:fade .2s ease}.modal-panel{width:min(620px,100%);max-height:min(720px,90vh);overflow:auto;padding:25px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);box-shadow:0 24px 80px rgba(0,0,0,.35);animation:rise .25s ease}.modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.modal h2{margin:0;font-family:var(--font-title);font-size:25px;letter-spacing:0}.modal p{color:var(--muted);line-height:1.75}.close{display:grid;width:42px;height:42px;flex:none;place-items:center;border:1px solid var(--border);border-radius:var(--button-radius);background:transparent;color:var(--text);font-size:25px;cursor:pointer}.reveal{animation:rise .65s ease both}@supports(animation-timeline:view()){.reveal{animation:rise linear both;animation-timeline:view();animation-range:entry 8% cover 28%}}@keyframes rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}@keyframes fade{from{opacity:0}to{opacity:1}}
html[data-estilo="id01"]{--bg:#0b0d10;--text:#f7f4ed;--muted:#a9acb2;--surface:#101318;--section-bg:#0e1115;--header:rgba(11,13,16,.9);--footer-bg:#07090b;--footer-text:#f7f4ed;--accent:#f2b134;--accent2:#3ddc97;--accent-soft:rgba(242,177,52,.12);--on-accent:#171006;--border:#272c33;--border-strong:#4d555f;--radius:0px;--button-radius:0px;--icon-radius:0px;--font-title:"Archivo Black",sans-serif;--hero-align:left;--action-align:flex-start;--hero-bg:linear-gradient(120deg,#0b0d10 60%,#101820);--art:repeating-linear-gradient(90deg,transparent 0 31px,rgba(242,177,52,.08) 32px),repeating-linear-gradient(0deg,transparent 0 31px,rgba(61,220,151,.07) 32px);--shadow:none;--button-shadow:6px 6px 0 #3ddc97}
html[data-estilo="id02"]{--bg:#f6f4fd;--text:#29243b;--muted:#6f6880;--surface:#fff;--section-bg:#efebfa;--header:rgba(246,244,253,.88);--footer-bg:#282139;--footer-text:#fff;--accent:#0ea5a3;--accent2:#ff6fa5;--accent-soft:rgba(14,165,163,.11);--on-accent:#fff;--border:#ded8ee;--border-strong:#a9a0c2;--radius:28px;--button-radius:999px;--icon-radius:999px;--font-title:Poppins,sans-serif;--hero-align:center;--action-align:center;--hero-bg:radial-gradient(circle at 18% 25%,rgba(255,111,165,.2) 0 7%,transparent 24%),radial-gradient(circle at 82% 72%,rgba(14,165,163,.18) 0 8%,transparent 25%),#f6f4fd;--art:radial-gradient(circle at center,#fff 0 18%,rgba(255,111,165,.35) 19% 34%,rgba(14,165,163,.22) 35% 51%,transparent 52%);--shadow:0 18px 48px rgba(55,40,92,.09);--button-shadow:0 10px 26px rgba(14,165,163,.25)}
html[data-estilo="id10"]{--bg:#f5f6f8;--text:#20243a;--muted:#667085;--surface:#fff;--section-bg:#eceef3;--header:rgba(245,246,248,.9);--footer-bg:#20243a;--footer-text:#fff;--accent:#3949ab;--accent2:#7382df;--accent-soft:rgba(57,73,171,.1);--on-accent:#fff;--border:#d9dde6;--border-strong:#939bb1;--radius:10px;--button-radius:10px;--icon-radius:10px;--font-title:"Space Grotesk",sans-serif;--hero-align:left;--action-align:flex-start;--hero-bg:linear-gradient(135deg,#f5f6f8 72%,#e7e9f3);--art:linear-gradient(135deg,rgba(57,73,171,.12),transparent 60%),repeating-linear-gradient(0deg,transparent 0 44px,rgba(57,73,171,.08) 45px);--shadow:0 12px 35px rgba(32,36,58,.07);--button-shadow:0 10px 24px rgba(57,73,171,.22)}
@media(min-width:720px){.nav-links{display:flex}.actions{flex-direction:row}.cards{grid-template-columns:repeat(3,1fr)}tr{display:table-row}th,td{display:table-cell;padding:17px 20px}th{width:34%;font-size:12px}.footer-inner{flex-direction:row;align-items:center;justify-content:space-between}.legal-links{justify-content:flex-end}}
@media(min-width:900px){.hero-inner{grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);align-items:center}.hero-art{display:block}html[data-estilo="id02"] .hero-inner{display:block;max-width:880px}html[data-estilo="id02"] .subtitle{margin-inline:auto}html[data-estilo="id02"] .hero-art{display:none}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.reveal,.card,.btn,.modal,.modal-panel{animation:none;transition:none}}
</style>
</head>
<body>
<header class="top"><nav class="shell nav" aria-label="Navegação principal"><a class="brand" href="#inicio"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">${brand}</span></a><div class="nav-links"><a href="#inicio">Início</a><a href="#sobre">Sobre</a><a href="#servicos">Serviços</a><a href="#contato">Contato</a></div></nav></header>
<main>
<section class="hero" id="inicio"><div class="shell hero-inner reveal"><div><p class="eyebrow">Estratégia, confiança e resultados</p><h1>Soluções que movem negócios. <span>${brand}</span></h1><p class="subtitle">Transformamos necessidades em soluções claras, eficientes e feitas para aproximar pessoas, empresas e novas oportunidades.</p><div class="actions"><a class="btn btn-primary" href="#servicos">Conhecer serviços</a><a class="btn btn-secondary" href="#contato">Falar conosco</a></div></div><div class="hero-art" aria-hidden="true"></div></div></section>
<section class="info-section" aria-labelledby="destaques"><div class="shell reveal"><div class="section-head"><span class="section-label">Conheça nossa empresa</span><h2 id="destaques">Parceria em cada etapa</h2></div><div class="cards"><article class="card" id="sobre"><span class="card-icon">01</span><h3>Sobre Nós</h3><p>A ${brand} une experiência, proximidade e compromisso para construir relações duradouras e resultados consistentes.</p><a href="#cadastro">Saiba mais →</a></article><article class="card" id="servicos"><span class="card-icon">02</span><h3>Nossos Serviços</h3><p>Oferecemos soluções personalizadas, atendimento ágil e acompanhamento cuidadoso para cada necessidade.</p><a href="#cadastro">Ver informações →</a></article><article class="card" id="contato"><span class="card-icon">03</span><h3>Contato</h3><p>Nossa equipe está pronta para ouvir você, esclarecer dúvidas e apresentar o melhor caminho.</p><a href="mailto:contato@empresa.com.br">Enviar e-mail →</a></article></div></div></section>
<section class="registry" id="cadastro" aria-labelledby="cadastro-titulo"><div class="shell reveal"><div class="section-head"><span class="section-label">Transparência</span><h2 id="cadastro-titulo">Informações cadastrais</h2></div><div class="table-wrap"><table><tbody><tr><th scope="row">Nome empresarial</th><td>${brand}</td></tr><tr><th scope="row">Área de atuação</th><td>Serviços e soluções empresariais</td></tr><tr><th scope="row">Atendimento</th><td>Segunda a sexta, em horário comercial</td></tr><tr><th scope="row">Canal de contato</th><td>contato@empresa.com.br</td></tr></tbody></table></div></div></section>
</main>
<footer class="footer"><div class="shell footer-inner"><div><div class="footer-brand">${brand}</div><div class="copyright">© ${year} ${brand}. Todos os direitos reservados.</div></div><div class="legal-links"><button class="legal-link" type="button" data-open-modal="privacy">Política de Privacidade</button><button class="legal-link" type="button" data-open-modal="terms">Termos de Uso</button></div></div></footer>
<div class="modal" id="privacy" role="dialog" aria-modal="true" aria-labelledby="privacy-title" hidden><div class="modal-panel"><div class="modal-head"><h2 id="privacy-title">Política de Privacidade</h2><button class="close" type="button" aria-label="Fechar Política de Privacidade" data-close-modal>×</button></div><p>A ${brand} respeita sua privacidade. Informações enviadas voluntariamente em nossos canais são utilizadas somente para responder solicitações, prestar atendimento e cumprir obrigações aplicáveis.</p><p>Não comercializamos dados pessoais. Você pode solicitar informações, correção ou exclusão pelos canais de contato apresentados nesta página.</p></div></div>
<div class="modal" id="terms" role="dialog" aria-modal="true" aria-labelledby="terms-title" hidden><div class="modal-panel"><div class="modal-head"><h2 id="terms-title">Termos de Uso</h2><button class="close" type="button" aria-label="Fechar Termos de Uso" data-close-modal>×</button></div><p>Ao acessar esta página, você concorda em utilizar seu conteúdo de forma lícita e responsável. As informações têm caráter institucional e podem ser atualizadas sem aviso prévio.</p><p>Marcas, textos e demais conteúdos pertencem à ${brand} ou a seus respectivos titulares. O uso indevido é proibido.</p></div></div>
<script>
(function(){var last=null;function close(modal){if(!modal)return;modal.hidden=true;document.body.classList.remove('modal-open');if(last)last.focus()}document.querySelectorAll('[data-open-modal]').forEach(function(button){button.addEventListener('click',function(){var modal=document.getElementById(button.getAttribute('data-open-modal'));if(!modal)return;last=button;modal.hidden=false;document.body.classList.add('modal-open');var closer=modal.querySelector('[data-close-modal]');if(closer)closer.focus()})});document.querySelectorAll('[data-close-modal]').forEach(function(button){button.addEventListener('click',function(){close(button.closest('.modal'))})});document.querySelectorAll('.modal').forEach(function(modal){modal.addEventListener('click',function(event){if(event.target===modal)close(modal)})});document.addEventListener('keydown',function(event){if(event.key==='Escape')close(document.querySelector('.modal:not([hidden])'))})})();
</script>
</body>
</html>`;

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
