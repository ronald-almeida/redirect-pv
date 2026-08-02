/**
 * Hook consolidado do Analytics.
 *
 * UMA única query de cliques cobre todos os recortes da tela (período
 * selecionado, hoje, semana, mês e relatório mensal). Isso evita consultas
 * duplicadas e mantém o cache do TanStack Query eficiente.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLinks } from "@/hooks/use-links";
import { useDomains } from "@/hooks/use-domains";
import { fetchClicks } from "@/lib/supabase/queries/clicks";
import type { DateRange } from "@/lib/date-range";
import {
  buildDomainAnalytics,
  buildLinkAnalytics,
  buildMonthlyReport,
  buildOverview,
  clicksByDomainBars,
  clicksOverTime,
  deviceDistribution,
  resultDistribution,
  topLinksBars,
  type TimeGrain,
} from "@/lib/analytics/model";

const DAY = 86_400_000;

/** Janela mínima carregada: cobre hoje, 7d, 30d e o mês corrente. */
function baseSince(range: DateRange): Date {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const start30 = now.getTime() - 30 * DAY;
  const periodStart = range.start?.getTime() ?? start30;
  return new Date(Math.min(startMonth, start30, periodStart));
}

export function useAnalytics(range: DateRange) {
  const since = useMemo(() => baseSince(range), [range]);

  const clicksQuery = useQuery({
    queryKey: ["analytics-clicks", since.toISOString().slice(0, 13)],
    queryFn: () => fetchClicks({ start: since, end: null, preset: "custom" }),
    staleTime: 60_000,
  });

  const { data: links = [], isLoading: loadingLinks } = useLinks();
  const { domains, isLoading: loadingDomains } = useDomains();

  const clicks = useMemo(() => clicksQuery.data ?? [], [clicksQuery.data]);

  const periodClicks = useMemo(() => {
    const start = range.start?.getTime() ?? 0;
    const end = range.end?.getTime() ?? Date.now();
    return clicks.filter((c) => {
      const t = new Date(c.created_at).getTime();
      return t >= start && t <= end;
    });
  }, [clicks, range]);

  const grain: TimeGrain = useMemo(() => {
    const start = range.start?.getTime() ?? Date.now() - 7 * DAY;
    const end = range.end?.getTime() ?? Date.now();
    return end - start <= 36 * 3_600_000 ? "hour" : "day";
  }, [range]);

  const data = useMemo(() => {
    const domainRows = buildDomainAnalytics(periodClicks, links, domains);
    const linkRows = buildLinkAnalytics(periodClicks, links, domains);
    return {
      overview: buildOverview(clicks, links),
      domainRows,
      linkRows,
      series: clicksOverTime(
        periodClicks,
        range.start ?? new Date(Date.now() - 7 * DAY),
        range.end ?? new Date(),
        grain,
      ),
      domainBars: clicksByDomainBars(domainRows),
      topLinks: topLinksBars(linkRows),
      results: resultDistribution(periodClicks),
      devices: deviceDistribution(periodClicks),
      monthly: buildMonthlyReport(clicks, links, domains),
      periodTotal: periodClicks.length,
    };
  }, [clicks, periodClicks, links, domains, grain, range]);

  return {
    ...data,
    isLoading: clicksQuery.isLoading || loadingLinks || loadingDomains,
    isFetching: clicksQuery.isFetching,
    error: clicksQuery.error,
  };
}
