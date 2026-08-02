import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { DateRange } from "@/lib/date-range";
import {
  auditKey,
  fetchAuditPage,
  DEFAULT_AUDIT_FILTERS,
  type AuditFilters,
} from "@/lib/supabase/queries/audit";

/** Histórico de Alterações com scroll infinito — filtros executados no banco. */
export function useAudit(range: DateRange) {
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_AUDIT_FILTERS);

  const patch = (p: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...p }));

  const query = useInfiniteQuery({
    queryKey: auditKey(range, filters),
    queryFn: ({ pageParam }) => fetchAuditPage(range, filters, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    enabled: !!range.start,
    staleTime: 15_000,
  });

  const pages = query.data?.pages ?? [];
  const rows = useMemo(() => pages.flatMap((p) => p.rows), [pages]);

  return {
    ...query,
    rows,
    total: pages[0]?.total ?? 0,
    filters,
    patch,
    reset: () => setFilters(DEFAULT_AUDIT_FILTERS),
  };
}
