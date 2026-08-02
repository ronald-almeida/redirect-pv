import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { DateRange } from "@/lib/date-range";
import {
  auditKey,
  fetchAuditPage,
  DEFAULT_AUDIT_FILTERS,
  type AuditFilters,
} from "@/lib/supabase/queries/audit";

/** Histórico de Alterações paginado — filtros executados no banco. */
export function useAudit(range: DateRange) {
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_AUDIT_FILTERS);

  const patch = (p: Partial<AuditFilters>) =>
    setFilters((f) => ({ ...f, ...p, page: p.page ?? 0 }));

  const query = useQuery({
    queryKey: auditKey(range, filters),
    queryFn: () => fetchAuditPage(range, filters),
    enabled: !!range.start,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    rows: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    filters,
    patch,
    reset: () => setFilters(DEFAULT_AUDIT_FILTERS),
  };
}
