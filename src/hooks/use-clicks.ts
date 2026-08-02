import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "@/lib/date-range";
import {
  clicksKey,
  fetchClicks,
  latestCacheByLink,
  type AdminClickRow,
} from "@/lib/supabase/queries/clicks";

export function useClicks(range: DateRange) {
  const query = useQuery({
    queryKey: clicksKey(range),
    queryFn: () => fetchClicks(range),
    enabled: !!range.start,
    staleTime: 15_000,
  });

  const clicks = useMemo<AdminClickRow[]>(() => query.data ?? [], [query.data]);
  const cacheByLink = useMemo(() => latestCacheByLink(clicks), [clicks]);

  /** Cliques agrupados por link — evita `filter` dentro do render de cada linha. */
  const clicksByLink = useMemo(() => {
    const map = new Map<string, AdminClickRow[]>();
    for (const c of clicks) {
      const list = map.get(c.link_id);
      if (list) list.push(c);
      else map.set(c.link_id, [c]);
    }
    return map;
  }, [clicks]);

  return { ...query, clicks, cacheByLink, clicksByLink };
}
