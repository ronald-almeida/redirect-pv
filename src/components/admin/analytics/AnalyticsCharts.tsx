import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { nf } from "@/lib/format";
import type { BarDatum, TimePoint } from "@/lib/analytics/model";

const AXIS = "#52525B";
const GRID = "#1C1C20";

/** Cliques ao longo do tempo — compacto no mobile, confortável no desktop. */
export function ClicksTimeChart({
  data,
  title,
  subtitle,
}: {
  data: TimePoint[];
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-[13.5px] font-bold">{title}</h2>
      {subtitle && <p className="text-[11.5px] text-muted-foreground">{subtitle}</p>}
      <div className="mt-3 h-[170px] sm:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 6, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="gCliques" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#13C286" stopOpacity={0.38} />
                <stop offset="100%" stopColor="#13C286" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              stroke={AXIS}
              tickLine={false}
              axisLine={false}
              fontSize={10}
              minTickGap={16}
            />
            <YAxis stroke={AXIS} tickLine={false} axisLine={false} fontSize={10} width={40} />
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
              dataKey="cliques"
              name="Cliques"
              stroke="#13C286"
              strokeWidth={2}
              fill="url(#gCliques)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/** Barras horizontais — leitura instantânea de ranking. */
export function BarList({
  title,
  subtitle,
  rows,
  emptyLabel = "Sem dados no período",
  suffix,
}: {
  title: string;
  subtitle?: string;
  rows: BarDatum[];
  emptyLabel?: string;
  suffix?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-[13.5px] font-bold">{title}</h2>
        {subtitle && <p className="text-[11.5px] text-muted-foreground">{subtitle}</p>}
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{r.label}</p>
                  {r.sublabel && (
                    <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                      {r.sublabel}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-bold tabular-nums">
                    {nf(r.value)}
                    {suffix}
                  </p>
                  <p className="text-[10.5px] tabular-nums text-muted-foreground">
                    {r.share.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
