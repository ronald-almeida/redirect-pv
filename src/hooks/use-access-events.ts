import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { DateRange } from "@/lib/date-range";
import { supabase } from "@/integrations/supabase/client";
import {
  accessKey,
  fetchAccessFacets,
  fetchAccessPage,
  resultOf,
  type AccessFilters,
  type AccessRow,
  DEFAULT_ACCESS_FILTERS,
} from "@/lib/supabase/queries/access-events";
import type { DomainRow, LinkRow } from "@/lib/bigcloak";

/**
 * Eventos operacionais com scroll infinito. A busca textual é resolvida sobre
 * a lista de links (pequena) e convertida num `in(link_id)` executado no banco.
 * O Realtime cobre apenas eventos recentes: novos acessos entram no topo.
 */
export function useAccessEvents(range: DateRange, links: LinkRow[], domains: DomainRow[]) {
  const [filters, setFilters] = useState<AccessFilters>(DEFAULT_ACCESS_FILTERS);
  const [live, setLive] = useState<AccessRow[]>([]);

  const patch = (p: Partial<AccessFilters>) => {
    setLive([]);
    setFilters((f) => ({ ...f, ...p }));
  };

  const domainById = useMemo(
    () => new Map(domains.map((d) => [d.id, d.domain])),
    [domains],
  );

  /** null = sem restrição de link (nenhum filtro textual/entidade aplicado). */
  const linkIds = useMemo<string[] | null>(() => {
    const term = filters.search.trim().toLowerCase();
    const hasFilter = term.length > 0 || filters.domainId !== "all" || filters.linkId !== "all";
    if (!hasFilter) return null;

    return links
      .filter((l) => {
        if (filters.linkId !== "all" && l.id !== filters.linkId) return false;
        if (filters.domainId !== "all" && l.domain_id !== filters.domainId) return false;
        if (!term) return true;
        const dom = l.domain_id ? (domainById.get(l.domain_id) ?? "") : "";
        return (
          l.slug.toLowerCase().includes(term) ||
          (l.name ?? "").toLowerCase().includes(term) ||
          dom.toLowerCase().includes(term) ||
          (l.real_url ?? "").toLowerCase().includes(term)
        );
      })
      .map((l) => l.id);
  }, [links, filters.search, filters.domainId, filters.linkId, domainById]);

  const query = useInfiniteQuery({
    queryKey: accessKey(range, filters, linkIds),
    queryFn: ({ pageParam }) => fetchAccessPage(range, filters, linkIds, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    enabled: !!range.start,
    staleTime: 10_000,
  });

  const facets = useQuery({
    queryKey: ["access-facets", range.start?.toISOString() ?? null],
    queryFn: () => fetchAccessFacets(range),
    enabled: !!range.start,
    staleTime: 120_000,
  });

  const pages = query.data?.pages ?? [];
  const fetched = useMemo(() => pages.flatMap((p) => p.rows), [pages]);

  /** Filtros aplicados a um evento chegado por Realtime. */
  const matchesRef = useRef<(r: AccessRow) => boolean>(() => false);
  matchesRef.current = (r: AccessRow) => {
    if (range.start && new Date(r.created_at) < range.start) return false;
    if (range.end && new Date(r.created_at) >= range.end) return false;
    if (linkIds && !linkIds.includes(r.link_id)) return false;
    if (filters.device !== "all" && r.device !== filters.device) return false;
    if (filters.country !== "all" && r.country !== filters.country) return false;
    if (filters.result !== "all" && resultOf(r.mode_at_click) !== filters.result) return false;
    return true;
  };

  useEffect(() => {
    const channel = supabase
      .channel("access-events-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "clicks" },
        (payload) => {
          const row = payload.new as AccessRow;
          if (!row?.id || !matchesRef.current(row)) return;
          setLive((prev) =>
            prev.some((p) => p.id === row.id) ? prev : [row, ...prev].slice(0, 50),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const rows = useMemo(() => {
    if (live.length === 0) return fetched;
    const seen = new Set(fetched.map((r) => r.id));
    return [...live.filter((r) => !seen.has(r.id)), ...fetched];
  }, [live, fetched]);

  const total = (pages[0]?.total ?? 0) + live.filter((l) => !fetched.some((f) => f.id === l.id)).length;

  const reset = useCallback(() => {
    setLive([]);
    setFilters(DEFAULT_ACCESS_FILTERS);
  }, []);

  return {
    ...query,
    rows,
    total,
    liveCount: live.length,
    filters,
    patch,
    reset,
    devices: facets.data?.devices ?? [],
    countries: facets.data?.countries ?? [],
  };
}
