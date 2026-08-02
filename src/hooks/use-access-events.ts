import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { DateRange } from "@/lib/date-range";
import {
  accessKey,
  fetchAccessFacets,
  fetchAccessPage,
  type AccessFilters,
  DEFAULT_ACCESS_FILTERS,
} from "@/lib/supabase/queries/access-events";
import type { DomainRow, LinkRow } from "@/lib/bigcloak";

/**
 * Eventos operacionais paginados. A busca textual é resolvida sobre a lista
 * de links (pequena) e convertida num `in(link_id)` executado no banco.
 */
export function useAccessEvents(range: DateRange, links: LinkRow[], domains: DomainRow[]) {
  const [filters, setFilters] = useState<AccessFilters>(DEFAULT_ACCESS_FILTERS);

  const patch = (p: Partial<AccessFilters>) =>
    setFilters((f) => ({ ...f, ...p, page: p.page ?? 0 }));

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

  const query = useQuery({
    queryKey: accessKey(range, filters, linkIds),
    queryFn: () => fetchAccessPage(range, filters, linkIds),
    enabled: !!range.start,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });

  const facets = useQuery({
    queryKey: ["access-facets", range.start?.toISOString() ?? null],
    queryFn: () => fetchAccessFacets(range),
    enabled: !!range.start,
    staleTime: 120_000,
  });

  return {
    ...query,
    rows: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    filters,
    patch,
    reset: () => setFilters(DEFAULT_ACCESS_FILTERS),
    devices: facets.data?.devices ?? [],
    countries: facets.data?.countries ?? [],
  };
}
