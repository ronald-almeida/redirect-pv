/**
 * Índice de Utilização do Domínio — Big Cloak.
 *
 * ATENÇÃO (regra de produto): este índice é OPERACIONAL.
 * Ele mede apenas o quanto o domínio está sendo usado dentro do sistema
 * (slugs cadastradas, volume e frequência de cliques). Ele NÃO representa
 * reputação, qualidade, risco, aprovação ou probabilidade de bloqueio do
 * domínio, e nenhuma inferência desse tipo deve ser adicionada aqui.
 *
 * Toda a lógica vive neste módulo para que a página de Domínios continue
 * apenas exibindo os dados. Novas fontes (Cloudflare, uptime, alertas)
 * devem ser adicionadas como campos novos em `DomainUsage`, sem reescrever
 * os componentes.
 */
import type { DomainRow, LinkRow } from "@/lib/bigcloak";

export type UsageLevel = "low" | "moderate" | "high";

/** Regras configuráveis do índice — ajuste aqui, não nos componentes. */
export interface UsageThresholds {
  /** Slugs não arquivadas a partir das quais a utilização sobe de faixa. */
  slugsModerate: number;
  slugsHigh: number;
  /** Cliques nos últimos 30 dias. */
  clicks30Moderate: number;
  clicks30High: number;
  /** Dias com pelo menos um clique nos últimos 30 dias (frequência de uso). */
  activeDaysModerate: number;
  activeDaysHigh: number;
}

export const DEFAULT_USAGE_THRESHOLDS: UsageThresholds = {
  slugsModerate: 5,
  slugsHigh: 20,
  clicks30Moderate: 100,
  clicks30High: 1000,
  activeDaysModerate: 5,
  activeDaysHigh: 15,
};

export const USAGE_META: Record<UsageLevel, { label: string; dot: string; text: string }> = {
  low: { label: "Baixa utilização", dot: "bg-primary", text: "text-primary" },
  moderate: { label: "Utilização moderada", dot: "bg-[#F59E0B]", text: "text-[#F59E0B]" },
  high: { label: "Alta utilização", dot: "bg-destructive", text: "text-destructive" },
};

/** Clique mínimo necessário para o cálculo (mantém o payload pequeno). */
export interface UsageClick {
  link_id: string;
  created_at: string;
}

export interface DomainUsage {
  totalSlugs: number;
  activeSlugs: number;
  waitingSlugs: number;
  archivedSlugs: number;
  clicks: number;
  clicks7d: number;
  clicks30d: number;
  activeDays30d: number;
  lastClickAt: string | null;
  firstUseAt: string | null;
  lastUseAt: string | null;
  avgRedirectMs: number;
  /** Usado pelos indicadores de saúde (atividade nas últimas 24h). */
  recentClicks: number;
  level: UsageLevel;
  score: number;
}

export const EMPTY_USAGE: DomainUsage = {
  totalSlugs: 0,
  activeSlugs: 0,
  waitingSlugs: 0,
  archivedSlugs: 0,
  clicks: 0,
  clicks7d: 0,
  clicks30d: 0,
  activeDays30d: 0,
  lastClickAt: null,
  firstUseAt: null,
  lastUseAt: null,
  avgRedirectMs: 0,
  recentClicks: 0,
  level: "low",
  score: 0,
};

const DAY = 86_400_000;

function band(value: number, moderate: number, high: number): number {
  if (value >= high) return 2;
  if (value >= moderate) return 1;
  return 0;
}

/** Faixa final = maior faixa entre slugs, volume e frequência. */
export function usageLevel(
  u: Pick<DomainUsage, "totalSlugs" | "archivedSlugs" | "clicks30d" | "activeDays30d">,
  t: UsageThresholds = DEFAULT_USAGE_THRESHOLDS,
): { level: UsageLevel; score: number } {
  const liveSlugs = u.totalSlugs - u.archivedSlugs;
  const score = Math.max(
    band(liveSlugs, t.slugsModerate, t.slugsHigh),
    band(u.clicks30d, t.clicks30Moderate, t.clicks30High),
    band(u.activeDays30d, t.activeDaysModerate, t.activeDaysHigh),
  );
  return { level: score === 2 ? "high" : score === 1 ? "moderate" : "low", score };
}

/**
 * Consolida as métricas de utilização de um domínio.
 * `clicks` deve conter apenas os cliques dos últimos 30 dias das slugs do domínio.
 */
export function buildDomainUsage(
  links: LinkRow[],
  clicks: UsageClick[],
  thresholds: UsageThresholds = DEFAULT_USAGE_THRESHOLDS,
): DomainUsage {
  const now = Date.now();
  let total = 0;
  let lastClickAt: string | null = null;
  let firstUseAt: string | null = null;
  let lastUseAt: string | null = null;
  let msSum = 0;
  let msCount = 0;

  for (const l of links) {
    total += l.click_count ?? 0;
    if (!firstUseAt || l.created_at < firstUseAt) firstUseAt = l.created_at;
    if (!lastUseAt || l.created_at > lastUseAt) lastUseAt = l.created_at;
    if (l.last_click_at && (!lastClickAt || l.last_click_at > lastClickAt))
      lastClickAt = l.last_click_at;
    const ms = l.avg_redirect_ms ?? 0;
    if (ms > 0) {
      msSum += ms;
      msCount += 1;
    }
  }

  let clicks7d = 0;
  let clicks30d = 0;
  let recentClicks = 0;
  const days = new Set<string>();

  for (const c of clicks) {
    const age = now - new Date(c.created_at).getTime();
    if (age > 30 * DAY) continue;
    clicks30d += 1;
    days.add(c.created_at.slice(0, 10));
    if (age <= 7 * DAY) clicks7d += 1;
    if (age <= DAY) recentClicks += 1;
    if (!lastClickAt || c.created_at > lastClickAt) lastClickAt = c.created_at;
  }

  const base = {
    totalSlugs: links.length,
    activeSlugs: links.filter((l) => !l.archived_at && l.active && l.mode !== "waiting").length,
    waitingSlugs: links.filter((l) => !l.archived_at && l.mode === "waiting").length,
    archivedSlugs: links.filter((l) => !!l.archived_at).length,
    clicks: total,
    clicks7d,
    clicks30d,
    activeDays30d: days.size,
    lastClickAt,
    firstUseAt,
    lastUseAt,
    avgRedirectMs: msCount ? Math.round(msSum / msCount) : 0,
    recentClicks,
  };

  return { ...base, ...usageLevel(base, thresholds) };
}

/* ------------------------------------------------------------------ */
/* Timeline do domínio                                                 */
/* ------------------------------------------------------------------ */

export type TimelineKind =
  | "created"
  | "primary"
  | "first_slug"
  | "last_slug"
  | "last_click"
  | "archived"
  | "restored";

export interface TimelineEvent {
  kind: TimelineKind;
  label: string;
  at: string | null;
  detail?: string;
}

/**
 * Histórico resumido, derivado dos dados já existentes (domínio + slugs + cliques).
 * Novos eventos (checagem de DNS, alertas, SSL) entram como novos `kind`.
 */
export function buildDomainTimeline(
  d: DomainRow,
  links: LinkRow[],
  usage: DomainUsage,
): TimelineEvent[] {
  const sorted = [...links].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const events: TimelineEvent[] = [
    { kind: "created", label: "Domínio cadastrado", at: d.created_at },
  ];

  if (d.is_primary) {
    events.push({
      kind: "primary",
      label: "Definido como principal",
      at: d.last_checked_at ?? d.created_at,
    });
  }
  if (first) {
    events.push({
      kind: "first_slug",
      label: "Primeira slug criada",
      at: first.created_at,
      detail: `/${first.slug}`,
    });
  }
  if (last && last.id !== first?.id) {
    events.push({
      kind: "last_slug",
      label: "Última slug criada",
      at: last.created_at,
      detail: `/${last.slug}`,
    });
  }
  if (usage.lastClickAt) {
    events.push({ kind: "last_click", label: "Último clique registrado", at: usage.lastClickAt });
  }
  if (d.archived_at) {
    events.push({ kind: "archived", label: "Domínio arquivado", at: d.archived_at });
  }


  return events
    .filter((e) => !!e.at)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}
