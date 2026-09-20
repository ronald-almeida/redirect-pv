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
<meta name="description" content="Conheça a ${brand}, nossos serviços e canais de atendimento."/>
<title>${brand}</title>`;

  const pages: Record<number, string> = {
    1: `<!doctype html><html lang="pt-BR"><head>${sharedHead}<style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#0a0a0a;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.shell{width:min(1120px,100% - 40px);margin:auto}.top{position:sticky;top:0;z-index:10;background:rgba(10,10,10,.88);border-bottom:1px solid #262626;backdrop-filter:blur(14px)}.nav{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:20px}.logo{display:flex;align-items:center;gap:10px;min-width:0;font-size:18px;font-weight:800}.logo i{width:12px;height:12px;flex:none;border-radius:3px;background:#6366f1;box-shadow:0 0 20px rgba(99,102,241,.7)}.logo span{overflow-wrap:anywhere}.links{display:none;gap:24px;color:#a3a3a3;font-size:14px}.links a:hover{color:#fff}.hero{min-height:630px;display:grid;align-content:center;padding:88px 0 72px;border-bottom:1px solid #202020}.eyebrow{margin:0 0 20px;color:#818cf8;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.12em}.hero h1{max-width:850px;margin:0;font-size:clamp(42px,9vw,82px);line-height:1.02;letter-spacing:-.04em}.hero .company{display:block;color:#818cf8;overflow-wrap:anywhere}.hero p{max-width:620px;margin:28px 0 34px;color:#a3a3a3;font-size:18px;line-height:1.7}.cta{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:7px;background:#6366f1;color:#fff;font-weight:700;transition:transform .2s,background .2s}.cta:hover{background:#4f46e5;transform:translateY(-2px)}section{padding:82px 0;border-bottom:1px solid #202020}.kicker{color:#818cf8;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em}.title{max-width:720px;margin:12px 0 20px;font-size:clamp(30px,6vw,48px);line-height:1.12;letter-spacing:-.03em}.copy{max-width:720px;color:#a3a3a3;font-size:17px;line-height:1.8}.cards{display:grid;gap:14px;margin-top:38px}.card{padding:28px;background:#111;border:1px solid #292929;border-radius:8px;transition:transform .25s,border-color .25s}.card:hover{transform:translateY(-4px);border-color:#6366f1}.num{color:#818cf8;font:700 13px ui-monospace,monospace}.card h3{margin:24px 0 10px;font-size:21px}.card p{margin:0;color:#a3a3a3;line-height:1.7}.contact{display:grid;gap:42px}.details{display:grid;gap:14px;margin-top:28px}.detail{color:#d4d4d4}.detail b{display:block;margin-bottom:4px;color:#737373;font-size:12px;text-transform:uppercase;letter-spacing:.08em}form{display:grid;gap:14px;padding:24px;background:#111;border:1px solid #292929;border-radius:8px}label{font-size:13px;color:#d4d4d4}input,textarea{width:100%;margin-top:7px;padding:13px 14px;border:1px solid #363636;border-radius:6px;background:#171717;color:#fff;font:inherit;outline:none}input:focus,textarea:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}textarea{min-height:110px;resize:vertical}button{min-height:48px;border:0;border-radius:6px;background:#6366f1;color:#fff;font:700 15px inherit;cursor:pointer}button:hover{background:#4f46e5}.foot{padding:28px 0;color:#737373;font-size:13px}.reveal{animation:rise .7s ease both}@supports(animation-timeline:view()){.reveal{animation:rise linear both;animation-timeline:view();animation-range:entry 10% cover 32%}}@keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}@media(min-width:720px){.links{display:flex}.cards{grid-template-columns:repeat(3,1fr)}.contact{grid-template-columns:1fr 1fr;align-items:start}.hero{min-height:720px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.reveal,.cta,.card{animation:none;transition:none}}
</style></head><body><header class="top"><nav class="shell nav" aria-label="Navegação principal"><a class="logo" href="#inicio"><i></i><span>${brand}</span></a><div class="links"><a href="#sobre">Sobre</a><a href="#servicos">Serviços</a><a href="#contato">Contato</a></div></nav></header><main><section class="hero" id="inicio"><div class="shell reveal"><p class="eyebrow">Tecnologia que gera resultados</p><h1>Soluções digitais para o seu negócio crescer <span class="company">${brand}</span></h1><p>Estratégia, tecnologia e execução para transformar ideias em experiências digitais que fortalecem marcas e aceleram negócios.</p><a class="cta" href="#contato">Fale com nossa equipe</a></div></section><section id="sobre"><div class="shell reveal"><span class="kicker">Sobre nós</span><h2 class="title">Construímos o futuro digital ao lado dos nossos clientes.</h2><p class="copy">A ${brand} nasceu para aproximar empresas de boas oportunidades por meio da tecnologia. Nossa missão é criar soluções simples, eficientes e alinhadas aos objetivos de cada negócio, unindo visão estratégica e excelência técnica.</p></div></section><section id="servicos"><div class="shell reveal"><span class="kicker">O que fazemos</span><h2 class="title">Especialistas para cada etapa da sua evolução.</h2><div class="cards"><article class="card"><span class="num">01</span><h3>Desenvolvimento Web</h3><p>Sites e plataformas rápidas, seguras e pensadas para oferecer uma experiência memorável.</p></article><article class="card"><span class="num">02</span><h3>Marketing Digital</h3><p>Estratégias orientadas por dados para ampliar alcance, relacionamento e conversões.</p></article><article class="card"><span class="num">03</span><h3>Consultoria</h3><p>Diagnóstico e direcionamento para tomar melhores decisões e acelerar a transformação digital.</p></article></div></div></section><section id="contato"><div class="shell contact reveal"><div><span class="kicker">Contato</span><h2 class="title">Vamos conversar sobre o seu próximo projeto.</h2><p class="copy">Conte o que você precisa. Nossa equipe responderá assim que possível.</p><div class="details"><div class="detail"><b>Telefone</b>(11) 4000-0000</div><div class="detail"><b>E-mail</b>contato@empresa.com.br</div></div></div><form><label>Nome<input name="nome" autocomplete="name" required placeholder="Seu nome"/></label><label>E-mail<input name="email" type="email" autocomplete="email" required placeholder="voce@empresa.com"/></label><label>Mensagem<textarea name="mensagem" required placeholder="Como podemos ajudar?"></textarea></label><button type="submit">Enviar mensagem</button></form></div></section></main><footer><div class="shell foot">© ${new Date().getFullYear()} ${brand}. Todos os direitos reservados.</div></footer></body></html>`,
    2: `<!doctype html><html lang="pt-BR"><head>${sharedHead}<style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fbfdfb;color:#183229;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.shell{width:min(1080px,100% - 40px);margin:auto}.top{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.92);border-bottom:1px solid #dfeae3;backdrop-filter:blur(14px)}.nav{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:18px}.logo{display:flex;align-items:center;gap:11px;min-width:0;color:#174d38;font-size:18px;font-weight:800}.mark{display:grid;width:32px;height:32px;flex:none;place-items:center;border-radius:50%;background:#e1f3e8;color:#277a54;font-size:18px}.logo span{overflow-wrap:anywhere}.links{display:none;gap:24px;color:#557166;font-size:14px}.links a:hover{color:#21734e}.hero{min-height:600px;display:grid;align-content:center;padding:84px 0;background:linear-gradient(145deg,#f3faf5,#e4f4e9)}.hero-box{max-width:820px}.eyebrow{display:inline-block;margin:0 0 20px;padding:7px 11px;border:1px solid #b9ddc6;border-radius:999px;color:#277a54;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.hero h1{margin:0;color:#163c2d;font:700 clamp(40px,8vw,72px)/1.08 Georgia,serif;letter-spacing:-.03em}.hero .company{display:block;margin-top:10px;color:#2d7a55;overflow-wrap:anywhere}.hero p{max-width:620px;margin:26px 0 34px;color:#557166;font-size:18px;line-height:1.75}.cta{display:inline-flex;align-items:center;justify-content:center;min-height:49px;padding:0 23px;border-radius:7px;background:#277a54;color:#fff;font-weight:700;transition:transform .2s,background .2s}.cta:hover{background:#1c6142;transform:translateY(-2px)}section:not(.hero){padding:78px 0}.soft{background:#edf7f0}.kicker{color:#277a54;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.09em}.title{max-width:700px;margin:12px 0 20px;color:#183f30;font:700 clamp(30px,6vw,46px)/1.15 Georgia,serif}.copy{max-width:720px;color:#587068;font-size:17px;line-height:1.8}.story{display:grid;gap:28px}.promise{padding:25px;border-left:3px solid #67a881;background:#fff;color:#315e4c;font:italic 20px/1.55 Georgia,serif;box-shadow:0 10px 30px rgba(31,88,61,.06)}.cards{display:grid;gap:14px;margin-top:36px}.card{padding:28px;border:1px solid #d9e9df;border-radius:8px;background:#fff;box-shadow:0 12px 35px rgba(30,91,61,.06);transition:transform .25s,box-shadow .25s}.card:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(30,91,61,.11)}.icon{display:grid;width:42px;height:42px;place-items:center;border-radius:50%;background:#e2f2e8;color:#277a54;font-size:19px}.card h3{margin:22px 0 10px;color:#204f3c;font-size:21px}.card p{margin:0;color:#637a70;line-height:1.7}.contact{display:grid;gap:40px}.details{display:grid;gap:14px;margin-top:25px}.detail{color:#355d4d}.detail b{display:block;margin-bottom:3px;color:#789186;font-size:12px;text-transform:uppercase;letter-spacing:.08em}form{display:grid;gap:14px;padding:24px;border:1px solid #d9e9df;border-radius:8px;background:#fff;box-shadow:0 12px 35px rgba(30,91,61,.06)}label{color:#355d4d;font-size:13px}input,textarea{width:100%;margin-top:7px;padding:13px 14px;border:1px solid #cbded2;border-radius:6px;background:#fbfdfb;color:#183229;font:inherit;outline:none}input:focus,textarea:focus{border-color:#4c956c;box-shadow:0 0 0 3px rgba(76,149,108,.15)}textarea{min-height:110px;resize:vertical}button{min-height:48px;border:0;border-radius:6px;background:#277a54;color:#fff;font:700 15px inherit;cursor:pointer}button:hover{background:#1c6142}.foot{padding:28px 0;border-top:1px solid #dfeae3;color:#71877e;font-size:13px}.reveal{animation:rise .7s ease both}@supports(animation-timeline:view()){.reveal{animation:rise linear both;animation-timeline:view();animation-range:entry 10% cover 32%}}@keyframes rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}@media(min-width:720px){.links{display:flex}.story{grid-template-columns:1.35fr .65fr;align-items:center}.cards{grid-template-columns:repeat(3,1fr)}.contact{grid-template-columns:1fr 1fr;align-items:start}.hero{min-height:690px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.reveal,.cta,.card{animation:none;transition:none}}
</style></head><body><header class="top"><nav class="shell nav" aria-label="Navegação principal"><a class="logo" href="#inicio"><i class="mark">✦</i><span>${brand}</span></a><div class="links"><a href="#sobre">Sobre</a><a href="#servicos">Cuidados</a><a href="#contato">Contato</a></div></nav></header><main><section class="hero" id="inicio"><div class="shell hero-box reveal"><span class="eyebrow">Cuidado em cada detalhe</span><h1>Cuidando da sua saúde com excelência e dedicação <span class="company">${brand}</span></h1><p>Atendimento humano, profissionais qualificados e acompanhamento próximo para você se sentir seguro em todas as etapas.</p><a class="cta" href="#contato">Agende seu atendimento</a></div></section><section id="sobre"><div class="shell story reveal"><div><span class="kicker">Nossa história</span><h2 class="title">Saúde começa com escuta, confiança e acolhimento.</h2><p class="copy">A ${brand} nasceu do propósito de cuidar das pessoas por inteiro. Nossa missão é oferecer uma experiência de saúde clara e acolhedora, combinando conhecimento, prevenção e atenção genuína às necessidades de cada paciente.</p></div><aside class="promise">“Excelência clínica com o cuidado humano que você merece.”</aside></div></section><section class="soft" id="servicos"><div class="shell reveal"><span class="kicker">Nossos cuidados</span><h2 class="title">Acompanhamento para cada momento.</h2><div class="cards"><article class="card"><span class="icon">✚</span><h3>Consultas</h3><p>Avaliação atenciosa e orientação individualizada com foco no seu bem-estar.</p></article><article class="card"><span class="icon">⌁</span><h3>Exames</h3><p>Processos seguros e eficientes para apoiar diagnósticos e decisões de cuidado.</p></article><article class="card"><span class="icon">♡</span><h3>Acompanhamento</h3><p>Continuidade, prevenção e proximidade para cuidar da sua saúde ao longo do tempo.</p></article></div></div></section><section id="contato"><div class="shell contact reveal"><div><span class="kicker">Fale conosco</span><h2 class="title">Estamos prontos para cuidar de você.</h2><p class="copy">Envie sua mensagem e nossa equipe entrará em contato para orientar seu atendimento.</p><div class="details"><div class="detail"><b>Telefone</b>(11) 4000-0000</div><div class="detail"><b>E-mail</b>atendimento@empresa.com.br</div></div></div><form><label>Nome<input name="nome" autocomplete="name" required placeholder="Seu nome"/></label><label>Telefone<input name="telefone" type="tel" autocomplete="tel" required placeholder="(00) 00000-0000"/></label><label>Mensagem<textarea name="mensagem" required placeholder="Como podemos cuidar de você?"></textarea></label><button type="submit">Enviar mensagem</button></form></div></section></main><footer><div class="shell foot">© ${new Date().getFullYear()} ${brand}. Todos os direitos reservados.</div></footer></body></html>`,
    3: `<!doctype html><html lang="pt-BR"><head>${sharedHead}<style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fff;color:#182536;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.shell{width:min(1120px,100% - 40px);margin:auto}.top{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.94);border-bottom:1px solid #dce3ea;backdrop-filter:blur(14px)}.nav{min-height:70px;display:flex;align-items:center;justify-content:space-between;gap:20px}.logo{display:flex;align-items:center;gap:11px;min-width:0;color:#1e3a5f;font-size:18px;font-weight:800}.logo i{display:block;width:26px;height:26px;flex:none;border:7px solid #1e3a5f;border-top-color:#4b759f}.logo span{overflow-wrap:anywhere}.links{display:none;gap:25px;color:#546679;font-size:14px;font-weight:600}.links a:hover{color:#1e3a5f}.hero{min-height:620px;display:grid;align-content:center;padding:90px 0;background:#f2f5f8;border-bottom:1px solid #dce3ea}.hero-grid{display:grid;gap:46px}.eyebrow{margin:0 0 19px;color:#416b94;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.hero h1{max-width:850px;margin:0;color:#172e4b;font-size:clamp(40px,8vw,74px);line-height:1.04;letter-spacing:-.04em}.hero .company{display:block;margin-top:10px;color:#416b94;overflow-wrap:anywhere}.hero p{max-width:620px;margin:27px 0 34px;color:#5a6c7d;font-size:18px;line-height:1.7}.cta{display:inline-flex;align-items:center;justify-content:center;min-height:49px;padding:0 23px;border-radius:5px;background:#1e3a5f;color:#fff;font-weight:700;transition:transform .2s,background .2s}.cta:hover{background:#142b48;transform:translateY(-2px)}.metric{align-self:end;padding:26px;border-top:4px solid #1e3a5f;background:#fff;box-shadow:0 16px 40px rgba(30,58,95,.1)}.metric strong{display:block;color:#1e3a5f;font-size:42px}.metric span{color:#657588;font-size:14px}section:not(.hero){padding:80px 0}.band{background:#1e3a5f;color:#fff}.kicker{color:#416b94;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.band .kicker{color:#a9c6df}.title{max-width:730px;margin:12px 0 20px;color:#1e3a5f;font-size:clamp(30px,6vw,47px);line-height:1.13;letter-spacing:-.025em}.band .title{color:#fff}.copy{max-width:730px;color:#607083;font-size:17px;line-height:1.8}.band .copy{color:#cedae6}.about{display:grid;gap:32px}.principles{display:grid;gap:12px}.principle{padding:16px 18px;border-left:3px solid #416b94;background:#f3f6f9;color:#334e69;font-weight:600}.cards{display:grid;gap:14px;margin-top:36px}.card{padding:29px;border:1px solid #d8e0e8;border-radius:6px;background:#fff;transition:transform .25s,border-color .25s,box-shadow .25s}.card:hover{transform:translateY(-4px);border-color:#7896b3;box-shadow:0 16px 35px rgba(30,58,95,.09)}.num{color:#416b94;font:700 13px ui-monospace,monospace}.card h3{margin:24px 0 10px;color:#1e3a5f;font-size:21px}.card p{margin:0;color:#657588;line-height:1.7}.contact{display:grid;gap:42px}.details{display:grid;gap:14px;margin-top:27px}.detail{color:#e2eaf2}.detail b{display:block;margin-bottom:4px;color:#9eb5ca;font-size:12px;text-transform:uppercase;letter-spacing:.08em}form{display:grid;gap:14px;padding:25px;background:#fff;color:#263a50;border-radius:6px}label{font-size:13px;font-weight:600}input,textarea{width:100%;margin-top:7px;padding:13px 14px;border:1px solid #c8d3de;border-radius:4px;background:#f8fafb;color:#182536;font:inherit;outline:none}input:focus,textarea:focus{border-color:#416b94;box-shadow:0 0 0 3px rgba(65,107,148,.14)}textarea{min-height:110px;resize:vertical}button{min-height:48px;border:0;border-radius:4px;background:#1e3a5f;color:#fff;font:700 15px inherit;cursor:pointer}button:hover{background:#142b48}.foot{padding:29px 0;color:#758496;font-size:13px}.reveal{animation:rise .7s ease both}@supports(animation-timeline:view()){.reveal{animation:rise linear both;animation-timeline:view();animation-range:entry 10% cover 32%}}@keyframes rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}@media(min-width:720px){.links{display:flex}.hero-grid{grid-template-columns:1fr 260px;align-items:end}.about{grid-template-columns:1.3fr .7fr;align-items:center}.cards{grid-template-columns:repeat(3,1fr)}.contact{grid-template-columns:1fr 1fr;align-items:start}.hero{min-height:710px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.reveal,.cta,.card{animation:none;transition:none}}
</style></head><body><header class="top"><nav class="shell nav" aria-label="Navegação principal"><a class="logo" href="#inicio"><i></i><span>${brand}</span></a><div class="links"><a href="#sobre">Empresa</a><a href="#servicos">Soluções</a><a href="#contato">Contato</a></div></nav></header><main><section class="hero" id="inicio"><div class="shell hero-grid reveal"><div><p class="eyebrow">Estratégia para avançar</p><h1>Transformando desafios em oportunidades de crescimento <span class="company">${brand}</span></h1><p>Ajudamos empresas a tomar decisões mais seguras, organizar a gestão e construir caminhos sustentáveis para crescer.</p><a class="cta" href="#contato">Converse com um consultor</a></div><aside class="metric"><strong>360°</strong><span>Visão completa do seu negócio</span></aside></div></section><section id="sobre"><div class="shell about reveal"><div><span class="kicker">Quem somos</span><h2 class="title">Experiência, método e parceria para gerar valor.</h2><p class="copy">A ${brand} foi criada para apoiar líderes diante de decisões complexas. Nossa missão é transformar informação em direção estratégica, trabalhando lado a lado com cada cliente para construir resultados consistentes e duradouros.</p></div><div class="principles"><div class="principle">Decisões orientadas por dados</div><div class="principle">Execução com responsabilidade</div><div class="principle">Relacionamentos de longo prazo</div></div></div></section><section id="servicos"><div class="shell reveal"><span class="kicker">Nossas soluções</span><h2 class="title">Clareza estratégica para negócios em movimento.</h2><div class="cards"><article class="card"><span class="num">01</span><h3>Consultoria Empresarial</h3><p>Análise de cenários e soluções sob medida para desafios de crescimento e competitividade.</p></article><article class="card"><span class="num">02</span><h3>Gestão</h3><p>Processos, indicadores e rotinas que tornam a operação mais eficiente e previsível.</p></article><article class="card"><span class="num">03</span><h3>Planejamento Estratégico</h3><p>Prioridades claras e planos viáveis para conectar visão de futuro à execução diária.</p></article></div></div></section><section class="band" id="contato"><div class="shell contact reveal"><div><span class="kicker">Contato</span><h2 class="title">Seu próximo ciclo de crescimento começa com uma conversa.</h2><p class="copy">Compartilhe seu desafio. Nossa equipe retornará para entender o contexto da sua empresa.</p><div class="details"><div class="detail"><b>Telefone</b>(11) 4000-0000</div><div class="detail"><b>E-mail</b>contato@empresa.com.br</div></div></div><form><label>Nome<input name="nome" autocomplete="name" required placeholder="Seu nome"/></label><label>E-mail corporativo<input name="email" type="email" autocomplete="email" required placeholder="voce@empresa.com"/></label><label>Mensagem<textarea name="mensagem" required placeholder="Conte-nos sobre o seu desafio"></textarea></label><button type="submit">Enviar mensagem</button></form></div></section></main><footer><div class="shell foot">© ${new Date().getFullYear()} ${brand}. Todos os direitos reservados.</div></footer></body></html>`,
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
