import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DomainRow, LinkRow } from "@/lib/bigcloak";
import {
  buildDomainUsage,
  DEFAULT_USAGE_THRESHOLDS,
  EMPTY_USAGE,
  type DomainUsage,
  type UsageClick,
  type UsageThresholds,
} from "@/lib/domain-usage";

const WINDOW_DAYS = 30;
export const domainUsageKey = ["domain-usage", WINDOW_DAYS] as const;

/** Cliques dos últimos 30 dias, só com os campos usados no índice. */
async function fetchUsageClicks(): Promise<UsageClick[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("clicks")
    .select("link_id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50_000);
  if (error) throw error;
  return (data ?? []) as UsageClick[];
}

/**
 * Índice de utilização por domínio (métrica operacional, não reputacional).
 * Agrega em memória para suportar centenas de domínios sem N+1 de requisições.
 */
export function useDomainUsage(
  domains: DomainRow[],
  links: LinkRow[],
  thresholds: UsageThresholds = DEFAULT_USAGE_THRESHOLDS,
) {
  const query = useQuery({
    queryKey: domainUsageKey,
    queryFn: fetchUsageClicks,
    staleTime: 60_000,
  });

  const usageByDomain = useMemo(() => {
    const clicks = query.data ?? [];
    const linksByDomain = new Map<string, LinkRow[]>();
    const linkDomain = new Map<string, string>();
    for (const l of links) {
      if (!l.domain_id) continue;
      linkDomain.set(l.id, l.domain_id);
      const list = linksByDomain.get(l.domain_id);
      if (list) list.push(l);
      else linksByDomain.set(l.domain_id, [l]);
    }

    const clicksByDomain = new Map<string, UsageClick[]>();
    for (const c of clicks) {
      const domainId = linkDomain.get(c.link_id);
      if (!domainId) continue;
      const list = clicksByDomain.get(domainId);
      if (list) list.push(c);
      else clicksByDomain.set(domainId, [c]);
    }

    const map = new Map<string, DomainUsage>();
    for (const d of domains) {
      map.set(
        d.id,
        buildDomainUsage(linksByDomain.get(d.id) ?? [], clicksByDomain.get(d.id) ?? [], thresholds),
      );
    }
    return map;
  }, [domains, links, query.data, thresholds]);

  const getUsage = (id: string): DomainUsage => usageByDomain.get(id) ?? EMPTY_USAGE;

  return { ...query, usageByDomain, getUsage };
}
