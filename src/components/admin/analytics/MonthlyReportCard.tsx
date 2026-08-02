import { CalendarRange } from "lucide-react";
import { nf } from "@/lib/format";
import { rateLatency } from "@/lib/latency-rating";
import type { MonthlyReport } from "@/lib/analytics/model";
import { BarList } from "./AnalyticsCharts";
import { cn } from "@/lib/utils";

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[17px] font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

/** Relatório mensal consolidado — inclui links e domínios arquivados. */
export function MonthlyReportCard({ r }: { r: MonthlyReport }) {
  const lat = rateLatency(r.avgRedirectMs);
  return (
    <div className="space-y-2.5">
      <section className="rounded-xl border border-border bg-card p-4">
        <header className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-[13.5px] font-bold capitalize">{r.monthLabel}</h2>
            <p className="text-[11px] text-muted-foreground">
              Consolidado do mês — mantém o histórico de itens arquivados.
            </p>
          </div>
        </header>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="Cliques" value={nf(r.clicks)} />
          <Metric label="Links utilizados" value={nf(r.linksUsed)} />
          <Metric label="Domínios utilizados" value={nf(r.domainsUsed)} />
          <Metric label="Redirect médio" value={`${r.redirectRate.toFixed(1)}%`} tone="text-primary" />
          <Metric
            label="Tempo médio"
            value={r.avgRedirectMs ? `${nf(r.avgRedirectMs)} ms` : "—"}
            tone={lat.className}
          />
        </div>
      </section>

      <div className="grid gap-2.5 lg:grid-cols-2">
        <BarList title="Top links do mês" rows={r.topLinks} emptyLabel="Sem cliques neste mês" />
        <BarList title="Top domínios do mês" rows={r.topDomains} emptyLabel="Sem cliques neste mês" />
      </div>
    </div>
  );
}
