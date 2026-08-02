/**
 * Analytics de Negócio — responde "o que está gerando resultado?".
 * Nada de métrica técnica de infraestrutura aqui (isso vive em Eventos/Latência).
 */
import { useMemo } from "react";
import type { AdminClickRow } from "@/lib/supabase/queries/clicks";
import type { DomainRow, LinkRow } from "@/lib/bigcloak";
import { resultOf } from "@/lib/supabase/queries/access-events";

export interface BusinessKpis {
  total: number;
  redirected: number;
  waiting: number;
  conversion: number; // % de acessos que viraram redirecionamento real
  activeLinks: number;
  avgMs: number;
}

export function businessKpis(clicks: AdminClickRow[]): BusinessKpis {
  let redirected = 0;
  let waiting = 0;
  let msSum = 0;
  let msCount = 0;
  const linkIds = new Set<string>();

  for (const c of clicks) {
    const r = resultOf(c.mode_at_click);
    if (r === "redirected") redirected++;
    else if (r === "waiting") waiting++;
    if (c.redirect_ms) {
      msSum += c.redirect_ms;
      msCount++;
    }
    linkIds.add(c.link_id);
  }

  const total = clicks.length;
  return {
    total,
    redirected,
    waiting,
    conversion: total ? (redirected / total) * 100 : 0,
    activeLinks: linkIds.size,
    avgMs: msCount ? Math.round(msSum / msCount) : 0,
  };
}

export interface Breakdown {
  id: string;
  label: string;
  sublabel?: string;
  total: number;
  redirected: number;
  share: number;
}

function rank(map: Map<string, Breakdown>, total: number, limit: number) {
  return [...map.values()]
    .map((b) => ({ ...b, share: total ? (b.total / total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function breakdownByLink(
  clicks: AdminClickRow[],
  links: LinkRow[],
  limit = 8,
): Breakdown[] {
  const byId = new Map(links.map((l) => [l.id, l]));
  const map = new Map<string, Breakdown>();
  for (const c of clicks) {
    const l = byId.get(c.link_id);
    const entry =
      map.get(c.link_id) ??
      {
        id: c.link_id,
        label: l?.name?.trim() || l?.slug || "Link removido",
        sublabel: l ? `/${l.slug}` : undefined,
        total: 0,
        redirected: 0,
        share: 0,
      };
    entry.total++;
    if (resultOf(c.mode_at_click) === "redirected") entry.redirected++;
    map.set(c.link_id, entry);
  }
  return rank(map, clicks.length, limit);
}

export function breakdownByDomain(
  clicks: AdminClickRow[],
  links: LinkRow[],
  domains: DomainRow[],
  limit = 6,
): Breakdown[] {
  const linkById = new Map(links.map((l) => [l.id, l]));
  const domainById = new Map(domains.map((d) => [d.id, d.domain]));
  const map = new Map<string, Breakdown>();
  for (const c of clicks) {
    const l = linkById.get(c.link_id);
    const id = l?.domain_id ?? "none";
    const entry =
      map.get(id) ??
      {
        id,
        label: (l?.domain_id ? domainById.get(l.domain_id) : null) ?? "Sem domínio",
        total: 0,
        redirected: 0,
        share: 0,
      };
    entry.total++;
    if (resultOf(c.mode_at_click) === "redirected") entry.redirected++;
    map.set(id, entry);
  }
  return rank(map, clicks.length, limit);
}

function countBy(clicks: AdminClickRow[], key: "device" | "country", limit: number): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const c of clicks) {
    const id = c[key] || "Desconhecido";
    const entry = map.get(id) ?? { id, label: id, total: 0, redirected: 0, share: 0 };
    entry.total++;
    map.set(id, entry);
  }
  return rank(map, clicks.length, limit);
}

export const breakdownByDevice = (c: AdminClickRow[]) => countBy(c, "device", 5);
export const breakdownByCountry = (c: AdminClickRow[]) => countBy(c, "country", 6);

/** Série diária de acessos e redirecionamentos, pronta para o gráfico. */
export function dailySeries(clicks: AdminClickRow[]) {
  const map = new Map<string, { day: string; acessos: number; redirecionados: number }>();
  for (const c of clicks) {
    const d = new Date(c.created_at);
    const key = d.toISOString().slice(0, 10);
    const entry = map.get(key) ?? {
      day: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      acessos: 0,
      redirecionados: 0,
    };
    entry.acessos++;
    if (resultOf(c.mode_at_click) === "redirected") entry.redirecionados++;
    map.set(key, entry);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

/** Hook único: todos os recortes de negócio calculados uma vez só. */
export function useBusinessAnalytics(
  clicks: AdminClickRow[],
  links: LinkRow[],
  domains: DomainRow[],
) {
  return useMemo(
    () => ({
      kpis: businessKpis(clicks),
      byLink: breakdownByLink(clicks, links),
      byDomain: breakdownByDomain(clicks, links, domains),
      byDevice: breakdownByDevice(clicks),
      byCountry: breakdownByCountry(clicks),
      series: dailySeries(clicks),
    }),
    [clicks, links, domains],
  );
}
