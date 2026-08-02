/**
 * Estado consolidado do Dashboard.
 * Um único ponto de entrada para totais, séries, feed e alertas — evita
 * hooks múltiplos disputando cache e simplifica os componentes.
 */
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayBrtYmd, rangeForPreset, type RangePreset } from "@/lib/date-range";
import {
  dashboardSeriesKey,
  dashboardTotalsKey,
  fetchDashboardSeries,
  fetchDashboardTotals,
  fetchRecentClicks,
  recentClicksKey,
  type DashClick,
} from "@/lib/supabase/queries/dashboard";
import { alertsKey, dismissAlert, fetchOpenAlerts } from "@/lib/supabase/queries/alerts";

const TOTALS_STALE_MS = 20_000;
const SERIES_STALE_MS = 30_000;
const FEED_STALE_MS = 15_000;

export function useDashboardTotals() {
  const dayKey = todayBrtYmd();
  return useQuery({
    queryKey: dashboardTotalsKey(dayKey),
    queryFn: () => fetchDashboardTotals(),
    staleTime: TOTALS_STALE_MS,
    refetchInterval: 30_000,
  });
}

export type ChartPreset = Extract<RangePreset, "today" | "7d" | "30d">;

export function useDashboardSeries(preset: ChartPreset) {
  const range = useMemo(() => rangeForPreset(preset), [preset]);
  return useQuery({
    queryKey: dashboardSeriesKey(range),
    queryFn: () => fetchDashboardSeries(range),
    staleTime: SERIES_STALE_MS,
    refetchInterval: 45_000,
  });
}

export function useRecentClicks() {
  return useQuery({
    queryKey: recentClicksKey,
    queryFn: () => fetchRecentClicks(20),
    staleTime: FEED_STALE_MS,
    refetchInterval: 20_000,
  });
}

export function useOpenAlerts() {
  return useQuery({
    queryKey: alertsKey,
    queryFn: fetchOpenAlerts,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dismissAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: alertsKey }),
  });
}

/**
 * Assina a tabela `clicks` para o Dashboard refletir novos acessos em tempo
 * real, sem precisar recarregar a página.
 */
export function useDashboardRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("bigcloak-dashboard-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "clicks" },
        () => {
          void qc.invalidateQueries({ queryKey: ["dashboard"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => {
          void qc.invalidateQueries({ queryKey: alertsKey });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);
}

/** Contagem de cliques em espera por link, base para os alertas derivados. */
export function waitingClicksByLink(rows: DashClick[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.mode_at_click.startsWith("waiting")) continue;
    out.set(r.link_id, (out.get(r.link_id) ?? 0) + 1);
  }
  return out;
}
