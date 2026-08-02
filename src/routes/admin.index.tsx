import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Link2, MousePointerClick, Activity, Target } from "lucide-react";
import { AdminShell, type AdminPeriod } from "@/components/admin/AdminShell";
import { MetricCard } from "@/components/admin/MetricCard";
import { ClickDistribution } from "@/components/admin/dashboard/ClickDistribution";
import { LatencyTrend } from "@/components/admin/dashboard/LatencyTrend";
import { RedirectStatus } from "@/components/admin/dashboard/RedirectStatus";
import { useAdminFilters, shellPeriodProps } from "@/hooks/use-admin-filters";
import { useClicks } from "@/hooks/use-clicks";
import { useLinks, useLinksRealtime } from "@/hooks/use-links";
import { bucketCounts, bucketLatency, latencySeries } from "@/lib/supabase/queries/clicks";
import { nf } from "@/lib/format";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Visão Geral · Big Cloak" },
      { name: "description", content: "Painel operacional do Big Cloak: cliques, latência e saúde dos redirecionamentos." },
    ],
  }),
  component: DashboardPage,
});

const PERIOD_SHORT: Record<AdminPeriod, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "7 dias",
  "30d": "30 dias",
  custom: "Período",
};

function DashboardPage() {
  const filters = useAdminFilters("today");
  const { data: links = [] } = useLinks();
  const { clicks } = useClicks(filters.range);
  useLinksRealtime();

  // Recalcula séries a cada minuto para que os baldes "até agora" avancem.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const metrics = useMemo(() => {
    const totalClicks = clicks.length;
    const activeSlugs = links.filter((l) => l.active).length;
    const latencies = links.map((l) => l.avg_redirect_ms ?? 0).filter((n) => n > 0);
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;
    const resolved = clicks.filter(
      (c) => c.mode_at_click.startsWith("real") || c.mode_at_click.startsWith("decoy"),
    ).length;
    const success = totalClicks ? Math.round((resolved / totalClicks) * 1000) / 10 : 0;

    return {
      totalClicks,
      activeSlugs,
      avgLatency,
      success,
      totalSpark: bucketCounts(clicks, filters.range),
      latSpark: bucketLatency(clicks, filters.range),
    };
  }, [clicks, links, filters.range]);

  const latSeries = useMemo(() => latencySeries(clicks, filters.range), [clicks, filters.range]);
  const periodLabel = PERIOD_SHORT[filters.period];

  return (
    <AdminShell {...shellPeriodProps(filters)}>
      <div className="max-w-[1480px] space-y-8 px-4 py-8 md:px-10 md:py-9">
        <header className="border-b border-border/60 pb-6">
          <h1 className="text-[28px] font-bold leading-[1.1] tracking-tight md:text-[40px] md:leading-[1.05]">
            Visão Geral
          </h1>
          <p className="mt-2 text-[13px] font-light text-muted-foreground/80 md:mt-2.5 md:text-[14px]">
            Acompanhe o desempenho dos seus links em tempo real
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 xl:grid-cols-4">
          <MetricCard
            label="Cliques no total"
            value={nf(metrics.totalClicks)}
            icon={MousePointerClick}
            series={metrics.totalSpark}
            accent="lime"
          />
          <MetricCard
            label="Latência média"
            value={metrics.avgLatency}
            suffix="ms"
            icon={Activity}
            series={metrics.latSpark}
            accent="violet"
          />
          <MetricCard
            label="Slugs ativos"
            value={metrics.activeSlugs}
            icon={Link2}
            accent="cyan"
            suffix={`/ ${links.length}`}
          />
          <MetricCard
            label="Taxa de sucesso"
            value={`${metrics.success.toFixed(1)}%`}
            icon={Target}
            accent="orange"
          />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ClickDistribution clicks={clicks} periodLabel={periodLabel} />
          <LatencyTrend series={latSeries} periodLabel={periodLabel} />
          <RedirectStatus clicks={clicks} periodLabel={periodLabel} />
        </section>
      </div>
    </AdminShell>
  );
}
