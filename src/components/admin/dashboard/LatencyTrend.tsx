import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface LatencyTrendProps {
  series: { t: string; ms: number }[];
  periodLabel: string;
}

export function LatencyTrend({ series, periodLabel }: LatencyTrendProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold tracking-tight">Latência por Período</h3>
        <span className="shrink-0 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
          {periodLabel}
        </span>
      </div>
      <div className="-mx-2 mt-4 h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
            <defs>
              <linearGradient id="lat-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1B2029" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#7E8794", fontSize: 10 }}
              interval={Math.max(1, Math.floor(series.length / 6))}
            />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "#7E8794", fontSize: 10 }} width={36} />
            <Tooltip
              contentStyle={{
                background: "#0E1116",
                border: "1px solid #1B2029",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#F5F7F5" }}
              formatter={(v: number) => [`${v}ms`, "Latência"]}
            />
            <Area
              type="monotone"
              dataKey="ms"
              stroke="#34D399"
              strokeWidth={2}
              fill="url(#lat-fill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
