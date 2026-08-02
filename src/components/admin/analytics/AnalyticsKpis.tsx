import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Link2,
  MousePointerClick,
  PauseCircle,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import { nf } from "@/lib/format";
import { rateLatency } from "@/lib/latency-rating";
import type { AnalyticsOverview } from "@/lib/analytics/model";
import { cn } from "@/lib/utils";

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10.5px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("mt-2 text-[22px] font-bold leading-none tabular-nums", tone)}>{value}</p>
      {hint && <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Visão geral operacional — responde "quantos cliques tive hoje?". */
export function AnalyticsKpis({ o }: { o: AnalyticsOverview }) {
  const latency = rateLatency(o.avgRedirectMs);
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      <Kpi icon={MousePointerClick} label="Cliques hoje" value={nf(o.clicksToday)} />
      <Kpi icon={TrendingUp} label="Cliques semana" value={nf(o.clicksWeek)} hint="Últimos 7 dias" />
      <Kpi icon={Clock} label="Cliques mês" value={nf(o.clicksMonth)} hint="Mês corrente" />
      <Kpi icon={Link2} label="Total de links" value={nf(o.totalLinks)} hint="Não arquivados" />
      <Kpi icon={Zap} label="Links ativos" value={nf(o.activeLinks)} tone="text-primary" />
      <Kpi icon={PauseCircle} label="Em espera" value={nf(o.waitingLinks)} />
      <Kpi
        icon={Timer}
        label="Redirect médio"
        value={o.avgRedirectMs ? `${nf(o.avgRedirectMs)} ms` : "—"}
        hint={latency.label}
        tone={latency.className}
      />
    </div>
  );
}
