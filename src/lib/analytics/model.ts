/**
 * Analytics Inteligente — Big Cloak (Fase 6).
 *
 * Regra de produto: Analytics é OPERACIONAL. Cada número existe para responder
 * uma pergunta de decisão ("qual domínio está sendo mais usado?", "qual link
 * recebeu mais acessos?"). Nada de métrica técnica de infraestrutura aqui —
 * isso vive em Latência/Eventos.
 *
 * Todo o cálculo acontece neste módulo, a partir de UMA carga consolidada de
 * cliques + links + domínios. Os componentes apenas exibem.
 */
import type { AdminClickRow } from "@/lib/supabase/queries/clicks";
import type { DomainRow, LinkRow } from "@/lib/bigcloak";
import { usageLevel, type UsageLevel } from "@/lib/domain-usage";

const DAY = 86_400_000;

export type AccessResult = "redirected" | "waiting" | "error";

/** Resultado do acesso a partir do modo registrado no clique. */
export function resultOfMode(mode: string | null | undefined): AccessResult {
  const m = (mode ?? "").toLowerCase();
  if (m === "real" || m === "decoy" || m === "redirect") return "redirected";
  if (m === "waiting" || m === "wait" || m === "transition") return "waiting";
  return "error";
}

/** Normaliza o dispositivo em Desktop / Mobile / Tablet / Desconhecido. */
export function deviceLabel(raw: string | null | undefined): string {
  const d = (raw ?? "").toLowerCase();
  if (d.includes("tablet") || d.includes("ipad")) return "Tablet";
  if (d.includes("mobile") || d.includes("phone") || d.includes("android") || d.includes("ios"))
    return "Mobile";
  if (d.includes("desktop") || d.includes("pc") || d.includes("mac") || d.includes("win"))
    return "Desktop";
  return "Desconhecido";
}

/* ------------------------------------------------------------------ */
/* Visão geral                                                         */
/* ------------------------------------------------------------------ */

export interface AnalyticsOverview {
  clicksToday: number;
  clicksWeek: number;
  clicksMonth: number;
  totalLinks: number;
  activeLinks: number;
  waitingLinks: number;
  avgRedirectMs: number;
}

export function buildOverview(clicks: AdminClickRow[], links: LinkRow[]): AnalyticsOverview {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startWeek = now.getTime() - 7 * DAY;
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let clicksToday = 0;
  let clicksWeek = 0;
  let clicksMonth = 0;
  let msSum = 0;
  let msCount = 0;

  for (const c of clicks) {
    const t = new Date(c.created_at).getTime();
    if (t >= startToday) clicksToday++;
    if (t >= startWeek) clicksWeek++;
    if (t >= startMonth) clicksMonth++;
    if (c.redirect_ms && t >= startMonth) {
      msSum += c.redirect_ms;
      msCount++;
    }
  }

  const live = links.filter((l) => !l.archived_at);
  return {
    clicksToday,
    clicksWeek,
    clicksMonth,
    totalLinks: live.length,
    activeLinks: live.filter((l) => l.active && l.mode !== "waiting").length,
    waitingLinks: live.filter((l) => l.mode === "waiting").length,
    avgRedirectMs: msCount ? Math.round(msSum / msCount) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Analytics por domínio                                               */
/* ------------------------------------------------------------------ */

export interface DomainAnalytics {
  id: string;
  domain: string;
  isPrimary: boolean;
  archived: boolean;
  totalSlugs: number;
  activeSlugs: number;
  waitingSlugs: number;
  archivedSlugs: number;
  totalClicks: number;
  clicksMonth: number;
  lastClickAt: string | null;
  avgRedirectMs: number;
  firstUseAt: string | null;
  lastUseAt: string | null;
  /** Índice OPERACIONAL de utilização — nunca reputação/risco. */
  level: UsageLevel;
}

const NO_DOMAIN_ID = "__none__";

export function buildDomainAnalytics(
  clicks: AdminClickRow[],
  links: LinkRow[],
  domains: DomainRow[],
): DomainAnalytics[] {
  const startMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).getTime();
  const domainOfLink = new Map<string, string>();
  const linksByDomain = new Map<string, LinkRow[]>();

  for (const l of links) {
    const key = l.domain_id ?? NO_DOMAIN_ID;
    domainOfLink.set(l.id, key);
    const list = linksByDomain.get(key);
    if (list) list.push(l);
    else linksByDomain.set(key, [l]);
  }

  interface Agg {
    clicksMonth: number;
    windowClicks: number;
    msSum: number;
    msCount: number;
    lastClickAt: string | null;
    days: Set<string>;
  }
  const agg = new Map<string, Agg>();
  const getAgg = (key: string) => {
    let a = agg.get(key);
    if (!a) {
      a = { clicksMonth: 0, windowClicks: 0, msSum: 0, msCount: 0, lastClickAt: null, days: new Set() };
      agg.set(key, a);
    }
    return a;
  };

  for (const c of clicks) {
    const key = domainOfLink.get(c.link_id);
    if (!key) continue;
    const a = getAgg(key);
    const t = new Date(c.created_at).getTime();
    a.windowClicks++;
    a.days.add(c.created_at.slice(0, 10));
    if (t >= startMonth) a.clicksMonth++;
    if (c.redirect_ms) {
      a.msSum += c.redirect_ms;
      a.msCount++;
    }
    if (!a.lastClickAt || c.created_at > a.lastClickAt) a.lastClickAt = c.created_at;
  }

  const rows: DomainAnalytics[] = [];
  const push = (id: string, name: string, d?: DomainRow) => {
    const ls = linksByDomain.get(id) ?? [];
    if (!d && ls.length === 0) return;
    const a = agg.get(id);
    let totalClicks = 0;
    let firstUseAt: string | null = null;
    let lastUseAt: string | null = null;
    let lastClickAt = a?.lastClickAt ?? null;

    for (const l of ls) {
      totalClicks += l.click_count ?? 0;
      if (!firstUseAt || l.created_at < firstUseAt) firstUseAt = l.created_at;
      if (!lastUseAt || l.created_at > lastUseAt) lastUseAt = l.created_at;
      if (l.last_click_at && (!lastClickAt || l.last_click_at > lastClickAt))
        lastClickAt = l.last_click_at;
    }

    const archivedSlugs = ls.filter((l) => !!l.archived_at).length;
    const base = {
      totalSlugs: ls.length,
      archivedSlugs,
      clicks30d: a?.windowClicks ?? 0,
      activeDays30d: a?.days.size ?? 0,
    };

    rows.push({
      id,
      domain: name,
      isPrimary: !!d?.is_primary,
      archived: !!d?.archived_at,
      totalSlugs: ls.length,
      activeSlugs: ls.filter((l) => !l.archived_at && l.active && l.mode !== "waiting").length,
      waitingSlugs: ls.filter((l) => !l.archived_at && l.mode === "waiting").length,
      archivedSlugs,
      totalClicks,
      clicksMonth: a?.clicksMonth ?? 0,
      lastClickAt,
      avgRedirectMs: a?.msCount ? Math.round(a.msSum / a.msCount) : 0,
      firstUseAt,
      lastUseAt,
      level: usageLevel(base).level,
    });
  };

  for (const d of domains) push(d.id, d.domain, d);
  push(NO_DOMAIN_ID, "Sem domínio");

  return rows.sort((a, b) => b.clicksMonth - a.clicksMonth || b.totalClicks - a.totalClicks);
}

/* ------------------------------------------------------------------ */
/* Analytics por link                                                  */
/* ------------------------------------------------------------------ */

export interface LinkAnalytics {
  id: string;
  name: string;
  slug: string;
  domain: string;
  destination: string;
  status: "active" | "waiting" | "archived" | "inactive";
  clicks: number;
  clicksWindow: number;
  lastClickAt: string | null;
  avgMs: number;
  maxMs: number;
  minMs: number;
}

export const LINK_STATUS_LABEL: Record<LinkAnalytics["status"], string> = {
  active: "Ativo",
  waiting: "Em espera",
  archived: "Arquivado",
  inactive: "Inativo",
};

export function linkStatus(l: LinkRow): LinkAnalytics["status"] {
  if (l.archived_at) return "archived";
  if (l.mode === "waiting") return "waiting";
  if (!l.active) return "inactive";
  return "active";
}

export function buildLinkAnalytics(
  clicks: AdminClickRow[],
  links: LinkRow[],
  domains: DomainRow[],
): LinkAnalytics[] {
  const domainById = new Map(domains.map((d) => [d.id, d.domain]));
  interface Agg {
    count: number;
    msSum: number;
    msCount: number;
    max: number;
    min: number;
    last: string | null;
  }
  const agg = new Map<string, Agg>();

  for (const c of clicks) {
    let a = agg.get(c.link_id);
    if (!a) {
      a = { count: 0, msSum: 0, msCount: 0, max: 0, min: Number.POSITIVE_INFINITY, last: null };
      agg.set(c.link_id, a);
    }
    a.count++;
    if (c.redirect_ms) {
      a.msSum += c.redirect_ms;
      a.msCount++;
      if (c.redirect_ms > a.max) a.max = c.redirect_ms;
      if (c.redirect_ms < a.min) a.min = c.redirect_ms;
    }
    if (!a.last || c.created_at > a.last) a.last = c.created_at;
  }

  return links
    .map<LinkAnalytics>((l) => {
      const a = agg.get(l.id);
      return {
        id: l.id,
        name: l.name?.trim() || l.slug,
        slug: l.slug,
        domain: (l.domain_id ? domainById.get(l.domain_id) : null) ?? "Sem domínio",
        destination: l.real_url || l.decoy_url || "—",
        status: linkStatus(l),
        clicks: l.click_count ?? 0,
        clicksWindow: a?.count ?? 0,
        lastClickAt: a?.last ?? l.last_click_at,
        avgMs: a?.msCount ? Math.round(a.msSum / a.msCount) : (l.avg_redirect_ms ?? 0),
        maxMs: a?.max ?? 0,
        minMs: a && Number.isFinite(a.min) ? a.min : 0,
      };
    })
    .sort((a, b) => b.clicksWindow - a.clicksWindow || b.clicks - a.clicks);
}

/* ------------------------------------------------------------------ */
/* Gráficos                                                            */
/* ------------------------------------------------------------------ */

export interface TimePoint {
  label: string;
  cliques: number;
}

export type TimeGrain = "hour" | "day";

/** Série de cliques ao longo do tempo — horária para Hoje, diária para 7d/30d. */
export function clicksOverTime(
  clicks: AdminClickRow[],
  start: Date,
  end: Date,
  grain: TimeGrain,
): TimePoint[] {
  const points = new Map<string, TimePoint>();
  const step = grain === "hour" ? 3_600_000 : DAY;
  const cursor = new Date(start);
  if (grain === "hour") cursor.setMinutes(0, 0, 0);
  else cursor.setHours(0, 0, 0, 0);

  for (let t = cursor.getTime(); t <= end.getTime(); t += step) {
    const d = new Date(t);
    const key = grain === "hour" ? d.toISOString().slice(0, 13) : d.toISOString().slice(0, 10);
    points.set(key, {
      label:
        grain === "hour"
          ? `${String(d.getHours()).padStart(2, "0")}h`
          : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      cliques: 0,
    });
  }

  for (const c of clicks) {
    const d = new Date(c.created_at);
    if (d < start || d > end) continue;
    const key = grain === "hour" ? d.toISOString().slice(0, 13) : d.toISOString().slice(0, 10);
    const p = points.get(key);
    if (p) p.cliques++;
  }

  return [...points.values()];
}

export interface BarDatum {
  id: string;
  label: string;
  sublabel?: string;
  value: number;
  share: number;
}

function toBars(map: Map<string, { label: string; sublabel?: string; value: number }>, limit: number) {
  const total = [...map.values()].reduce((s, v) => s + v.value, 0);
  return [...map.entries()]
    .map<BarDatum>(([id, v]) => ({
      id,
      label: v.label,
      sublabel: v.sublabel,
      value: v.value,
      share: total ? (v.value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function clicksByDomainBars(rows: DomainAnalytics[], limit = 8): BarDatum[] {
  const map = new Map<string, { label: string; value: number }>();
  for (const r of rows) map.set(r.id, { label: r.domain, value: r.clicksMonth });
  return toBars(map, limit).filter((b) => b.value > 0);
}

export function topLinksBars(rows: LinkAnalytics[], limit = 10): BarDatum[] {
  const map = new Map<string, { label: string; sublabel?: string; value: number }>();
  for (const r of rows) map.set(r.id, { label: r.name, sublabel: `/${r.slug}`, value: r.clicksWindow });
  return toBars(map, limit).filter((b) => b.value > 0);
}

export function resultDistribution(clicks: AdminClickRow[]): BarDatum[] {
  const counters: Record<AccessResult, number> = { redirected: 0, waiting: 0, error: 0 };
  for (const c of clicks) counters[resultOfMode(c.mode_at_click)]++;
  const map = new Map<string, { label: string; value: number }>([
    ["redirected", { label: "Redirect", value: counters.redirected }],
    ["waiting", { label: "Espera", value: counters.waiting }],
    ["error", { label: "Erro", value: counters.error }],
  ]);
  return toBars(map, 3);
}

export function deviceDistribution(clicks: AdminClickRow[]): BarDatum[] {
  const map = new Map<string, { label: string; value: number }>();
  for (const c of clicks) {
    const label = deviceLabel(c.device);
    const cur = map.get(label);
    if (cur) cur.value++;
    else map.set(label, { label, value: 1 });
  }
  return toBars(map, 4);
}

/* ------------------------------------------------------------------ */
/* Relatório mensal                                                    */
/* ------------------------------------------------------------------ */

export interface MonthlyReport {
  monthLabel: string;
  clicks: number;
  linksUsed: number;
  domainsUsed: number;
  topLinks: BarDatum[];
  topDomains: BarDatum[];
  redirectRate: number;
  avgRedirectMs: number;
}

/**
 * Consolidado do mês corrente. Inclui links/domínios arquivados de propósito:
 * o histórico precisa continuar íntegro mesmo após o arquivamento.
 */
export function buildMonthlyReport(
  clicks: AdminClickRow[],
  links: LinkRow[],
  domains: DomainRow[],
): MonthlyReport {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthClicks = clicks.filter((c) => new Date(c.created_at).getTime() >= startMonth);

  const linkById = new Map(links.map((l) => [l.id, l]));
  const domainById = new Map(domains.map((d) => [d.id, d.domain]));
  const perLink = new Map<string, { label: string; sublabel?: string; value: number }>();
  const perDomain = new Map<string, { label: string; value: number }>();
  let redirected = 0;
  let msSum = 0;
  let msCount = 0;

  for (const c of monthClicks) {
    if (resultOfMode(c.mode_at_click) === "redirected") redirected++;
    if (c.redirect_ms) {
      msSum += c.redirect_ms;
      msCount++;
    }
    const l = linkById.get(c.link_id);
    const lEntry = perLink.get(c.link_id);
    if (lEntry) lEntry.value++;
    else
      perLink.set(c.link_id, {
        label: l?.name?.trim() || l?.slug || "Link removido",
        sublabel: l ? `/${l.slug}` : undefined,
        value: 1,
      });

    const dKey = l?.domain_id ?? NO_DOMAIN_ID;
    const dEntry = perDomain.get(dKey);
    if (dEntry) dEntry.value++;
    else
      perDomain.set(dKey, {
        label: (l?.domain_id ? domainById.get(l.domain_id) : null) ?? "Sem domínio",
        value: 1,
      });
  }

  return {
    monthLabel: now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    clicks: monthClicks.length,
    linksUsed: perLink.size,
    domainsUsed: perDomain.size,
    topLinks: toBars(perLink, 5),
    topDomains: toBars(perDomain, 5),
    redirectRate: monthClicks.length ? (redirected / monthClicks.length) * 100 : 0,
    avgRedirectMs: msCount ? Math.round(msSum / msCount) : 0,
  };
}
