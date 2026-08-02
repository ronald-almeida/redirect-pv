import { useCallback, useMemo, useState } from "react";
import type { AdminPeriod } from "@/components/admin/AdminShell";
import { adminPeriodToRange } from "@/lib/admin-period";
import type { DateRange } from "@/lib/date-range";

/**
 * Estado de período + busca compartilhado pelas rotas admin.
 * Padrão: HOJE.
 */
export function useAdminFilters(initial: AdminPeriod = "today") {
  const [period, setPeriod] = useState<AdminPeriod>(initial);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [search, setSearch] = useState("");

  const range = useMemo<DateRange>(
    () => adminPeriodToRange(period, customStart, customEnd),
    [period, customStart, customEnd],
  );

  const onCustomRange = useCallback((s: string, e: string) => {
    setCustomStart(s);
    setCustomEnd(e);
  }, []);

  return {
    period,
    setPeriod,
    customStart,
    customEnd,
    onCustomRange,
    search,
    setSearch,
    range,
  };
}

/** Props prontas para repassar ao `<AdminShell />`. */
export function shellPeriodProps(f: ReturnType<typeof useAdminFilters>) {
  return {
    period: f.period,
    onPeriod: f.setPeriod,
    customStart: f.customStart,
    customEnd: f.customEnd,
    onCustomRange: f.onCustomRange,
  };
}
