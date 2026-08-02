import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminShell, type AdminPeriod } from "@/components/admin/AdminShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminPeriodToRange } from "@/lib/admin-period";
import { useAnalytics } from "@/hooks/use-analytics";
import { AnalyticsKpis } from "@/components/admin/analytics/AnalyticsKpis";
import { BarList, ClicksTimeChart } from "@/components/admin/analytics/AnalyticsCharts";
import { DomainAnalyticsCards } from "@/components/admin/analytics/DomainAnalyticsCards";
import { LinkAnalyticsList } from "@/components/admin/analytics/LinkAnalyticsList";
import { MonthlyReportCard } from "@/components/admin/analytics/MonthlyReportCard";
import { ExportMenu } from "@/components/admin/analytics/ExportMenu";
import { nf } from "@/lib/format";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics operacional · Big Cloak" },
      {
        name: "description",
        content:
          "Cliques por dia, domínio e link, tempo de redirect e relatório mensal consolidado do Big Cloak.",
      },
      { property: "og:title", content: "Analytics operacional · Big Cloak" },
      {
        property: "og:description",
        content: "Qual domínio está sendo mais usado, qual link recebeu mais acessos e como está o redirect.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

const PERIOD_HINT: Record<AdminPeriod, string> = {
  today: "hoje",
  yesterday: "ontem",
  "7d": "nos últimos 7 dias",
  "30d": "nos últimos 30 dias",
  custom: "no período selecionado",
};

function AnalyticsPage() {
  const [period, setPeriod] = useState<AdminPeriod>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const range = useMemo(
    () => adminPeriodToRange(period, customStart, customEnd),
    [period, customStart, customEnd],
  );

  const {
    overview,
    domainRows,
    linkRows,
    series,
    domainBars,
    topLinks,
    results,
    devices,
    monthly,
    periodTotal,
    isLoading,
  } = useAnalytics(range);

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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[19px] font-bold tracking-tight">Analytics</h1>
            <p className="text-[12.5px] text-muted-foreground">
              {isLoading
                ? "Carregando dados…"
                : `${nf(periodTotal)} cliques ${PERIOD_HINT[period]}.`}
            </p>
          </div>
          <ExportMenu />
        </div>

        <AnalyticsKpis o={overview} />

        <Tabs defaultValue="visao" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="visao" className="text-[12.5px]">
              Visão geral
            </TabsTrigger>
            <TabsTrigger value="dominios" className="text-[12.5px]">
              Domínios
            </TabsTrigger>
            <TabsTrigger value="links" className="text-[12.5px]">
              Links
            </TabsTrigger>
            <TabsTrigger value="mensal" className="text-[12.5px]">
              Relatório mensal
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visao" className="mt-3 space-y-2.5">
            <ClicksTimeChart
              data={series}
              title="Cliques ao longo do tempo"
              subtitle={`Volume de acessos ${PERIOD_HINT[period]}.`}
            />
            <div className="grid gap-2.5 lg:grid-cols-2">
              <BarList
                title="Cliques por domínio"
                subtitle="Qual domínio está sendo mais utilizado"
                rows={domainBars}
              />
              <BarList
                title="Links mais acessados"
                subtitle="Top 10 do período"
                rows={topLinks}
              />
            </div>
            <div className="grid gap-2.5 lg:grid-cols-2">
              <BarList
                title="Distribuição dos acessos"
                subtitle="Redirect, espera e erro"
                rows={results}
              />
              <BarList
                title="Dispositivos"
                subtitle="Desktop, mobile e tablet"
                rows={devices}
              />
            </div>
          </TabsContent>

          <TabsContent value="dominios" className="mt-3">
            <DomainAnalyticsCards rows={domainRows} />
          </TabsContent>

          <TabsContent value="links" className="mt-3">
            <LinkAnalyticsList rows={linkRows} />
          </TabsContent>

          <TabsContent value="mensal" className="mt-3">
            <MonthlyReportCard r={monthly} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminShell>
  );
}
