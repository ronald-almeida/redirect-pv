import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Globe, MousePointerClick, Smartphone, Timer, TrendingUp } from "lucide-react";
import { AdminShell, type AdminPeriod } from "@/components/admin/AdminShell";
import { BreakdownList } from "@/components/admin/analytics/BreakdownList";
import { adminPeriodToRange } from "@/lib/admin-period";
import { nf } from "@/lib/format";
import { useClicks } from "@/hooks/use-clicks";
import { useLinks } from "@/hooks/use-links";
import { useDomains } from "@/hooks/use-domains";
import { useBusinessAnalytics } from "@/lib/business-analytics";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics de negócio · Big Cloak" },
      {
        name: "description",
        content:
          "Descubra quais links e domínios geram mais acessos e redirecionamentos reais no Big Cloak.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const CHART = { grid: "#1C1C20", axis: "#52525B" };

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-[24px] font-bold leading-none tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[11.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AnalyticsPage() {
  const [period, setPeriod] = useState<AdminPeriod>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const range = useMemo(
    () => adminPeriodToRange(period, customStart, customEnd),
    [period, customStart, customEnd],
  );

  const { clicks, isLoading } = useClicks(range);
  const { data: links = [] } = useLinks();
  const { domains } = useDomains();
  const { kpis, byLink, byDomain, byDevice, byCountry, series } = useBusinessAnalytics(
    clicks,
    links,
    domains,
  );

  return (
    <AdminShell
      period={period}
      onPeriod={setPeriod}
      customStart={customStart}
      customEnd={customEnd}
      onCustomRange={(s, e) => {
        setCustomStart(s);
        setCustomEnd(e);
      }}
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight">Analytics</h1>
          <p className="text-[12.5px] text-muted-foreground">
            O que está gerando resultado no período selecionado.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            icon={MousePointerClick}
            label="Acessos"
            value={nf(kpis.total)}
            hint={isLoading ? "Carregando…" : `${kpis.activeLinks} links acessados`}
          />
          <Kpi
            icon={TrendingUp}
            label="Redirecionados"
            value={nf(kpis.redirected)}
            hint={`${kpis.conversion.toFixed(1)}% dos acessos`}
          />
          <Kpi
            icon={BarChart3}
            label="Página de espera"
            value={nf(kpis.waiting)}
            hint="Acessos sem destino ativo"
          />
          <Kpi
            icon={Timer}
            label="Tempo médio"
            value={kpis.avgMs ? `${kpis.avgMs} ms` : "—"}
            hint="Do clique até o destino"
          />
        </div>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-[13.5px] font-bold">Acessos ao longo do tempo</h2>
          <p className="text-[11.5px] text-muted-foreground">
            Comparativo entre total de acessos e redirecionamentos reais.
          </p>
          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gAcessos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#13C286" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#13C286" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke={CHART.axis}
                  tickLine={false}
                  axisLine={false}
                  fontSize={10.5}
                />
                <YAxis
                  stroke={CHART.axis}
                  tickLine={false}
                  axisLine={false}
                  fontSize={10.5}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0F0F10",
                    border: "1px solid #27272A",
                    borderRadius: 8,
                    fontSize: 11.5,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="acessos"
                  name="Acessos"
                  stroke="#13C286"
                  strokeWidth={2}
                  fill="url(#gAcessos)"
                />
                <Area
                  type="monotone"
                  dataKey="redirecionados"
                  name="Redirecionados"
                  stroke="#38BDF8"
                  strokeWidth={1.5}
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <BreakdownList
            title="Links com melhor desempenho"
            subtitle="Ordenados por volume de acessos"
            rows={byLink}
            showConversion
          />
          <BreakdownList
            title="Desempenho por domínio"
            subtitle="Distribuição do tráfego entre os domínios"
            rows={byDomain}
            showConversion
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <BreakdownList
            title="Dispositivos"
            subtitle="De onde os acessos chegam"
            rows={byDevice}
          />
          <BreakdownList title="Países" subtitle="Origem geográfica dos acessos" rows={byCountry} />
        </div>

        <p className="flex items-center gap-1.5 pb-2 text-[11.5px] text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          Dados do período selecionado.
          <Smartphone className="ml-2 h-3.5 w-3.5" />
          Otimizado para consulta rápida no celular.
        </p>
      </div>
    </AdminShell>
  );
}
