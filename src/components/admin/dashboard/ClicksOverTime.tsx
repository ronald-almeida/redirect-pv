import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import type { ChartPreset } from "@/hooks/use-dashboard";
import type { DashClick } from "@/lib/supabase/queries/dashboard";
import { brtDayStart } from "@/lib/date-range";

const OPTIONS: { key: ChartPreset; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

interface ClicksOverTimeProps {
  clicks: DashClick[];
  preset: ChartPreset;
  onPreset: (p: ChartPreset) => void;
  loading?: boolean;
  error?: boolean;
}

/** Agrupa por hora (hoje) ou por dia (7d / 30d). */
function buildSeries(clicks: DashClick[], preset: ChartPreset) {
  const now = new Date();
  if (preset === "today") {
    const buckets = new Array<number>(24).fill(0);
    const start = brtDayStart(now, 0).getTime();
    for (const c of clicks) {
      const h = Math.floor((new Date(c.created_at).getTime() - start) / 3_600_000);
      if (h >= 0 && h < 24) buckets[h]++;
    }
    const currentHour = Math.floor((now.getTime() - start) / 3_600_000);
    return buckets.slice(0, Math.max(1, Math.min(24, currentHour + 1))).map((v, i) => ({
      label: `${String(i).padStart(2, "0")}h`,
      value: v,
    }));
  }

  const days = preset === "7d" ? 7 : 30;
  const out: { label: string; value: number }[] = [];
  const counts = new Map<string, number>();
  for (const c of clicks) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(c.created_at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = brtDayStart(now, i);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const [, m, day] = key.split("-");
    out.push({ label: `${day}/${m}`, value: counts.get(key) ?? 0 });
  }
  return out;
}

export function ClicksOverTime({
  clicks,
  preset,
  onPreset,
  loading,
  error,
}: ClicksOverTimeProps) {
  const data = useMemo(() => buildSeries(clicks, preset), [clicks, preset]);
  const total = useMemo(() => data.reduce((a, b) => a + b.value, 0), [data]);

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Cliques ao longo do tempo</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">
            {total.toLocaleString("pt-BR")} acessos no período
          </p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg border border-border bg-background/50 p-0.5">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onPreset(o.key)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
                preset === o.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-[190px] w-full md:h-[220px]">
        {loading ? (
          <div className="h-full w-full animate-pulse rounded-lg bg-secondary/50" />
        ) : error ? (
          <div className="flex h-full items-center justify-center text-[12.5px] text-muted-foreground">
            Não foi possível carregar o gráfico.
          </div>
        ) : total === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-[13px] font-medium">Nenhum clique neste período</p>
            <p className="text-[11.5px] text-muted-foreground">
              Os acessos aparecem aqui em tempo real.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={18}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={38}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
                formatter={(v: number) => [`${v} acessos`, ""]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#clicksFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
