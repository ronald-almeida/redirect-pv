import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: number | null; // percent
  icon: React.ComponentType<{ className?: string }>;
  series?: number[];
  accent?: "lime" | "violet" | "cyan" | "orange" | "rose";
  suffix?: string;
  deltaLabel?: string;
}

const ACCENT: Record<NonNullable<MetricCardProps["accent"]>, { line: string; bg: string; text: string; glow: string }> = {
  lime:   { line: "#A3E635", bg: "rgba(163,230,53,0.12)", text: "text-primary",          glow: "shadow-[0_0_40px_-12px_rgba(163,230,53,0.55)]" },
  violet: { line: "#A78BFA", bg: "rgba(167,139,250,0.14)", text: "text-[#A78BFA]",        glow: "shadow-[0_0_40px_-12px_rgba(167,139,250,0.55)]" },
  cyan:   { line: "#22D3EE", bg: "rgba(34,211,238,0.14)",  text: "text-[#22D3EE]",        glow: "shadow-[0_0_40px_-12px_rgba(34,211,238,0.55)]" },
  orange: { line: "#F59E0B", bg: "rgba(245,158,11,0.14)",  text: "text-[#F59E0B]",        glow: "shadow-[0_0_40px_-12px_rgba(245,158,11,0.55)]" },
  rose:   { line: "#F43F5E", bg: "rgba(244,63,94,0.14)",   text: "text-destructive",      glow: "shadow-[0_0_40px_-12px_rgba(244,63,94,0.55)]" },
};

export function MetricCard({ label, value, delta, icon: Icon, series, accent = "lime", suffix, deltaLabel = "vs ontem" }: MetricCardProps) {
  const a = ACCENT[accent];
  const deltaPositive = (delta ?? 0) >= 0;
  const data = (series ?? []).map((v, i) => ({ i, v }));

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-[0_0_0_1px_rgba(163,230,53,0.08),0_20px_40px_-20px_rgba(0,0,0,0.6)]">
      {/* subtle radial glow in background */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-60 blur-3xl"
        style={{ background: a.bg }}
      />

      <div className="relative flex items-start justify-between">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <div
          className={cn("flex h-10 w-10 items-center justify-center rounded-xl", a.glow)}
          style={{ background: a.bg, color: a.line }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>

      <div className="relative mt-5 flex items-baseline gap-1.5">
        <span className="text-[36px] font-bold tracking-tight tabular-nums text-foreground leading-none">
          {value}
        </span>
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>

      <div className="relative mt-5 flex items-end justify-between gap-3">
        {delta !== undefined && delta !== null ? (
          <div className="flex items-center gap-1.5 text-[11.5px]">
            <span className={cn(
              "rounded-md px-1.5 py-0.5 font-semibold tabular-nums",
              deltaPositive ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
            )}>
              {deltaPositive ? "+" : ""}{delta.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">{deltaLabel}</span>
          </div>
        ) : <span />}

        {data.length > 1 && (
          <div className="h-10 w-[55%]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={a.line}
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
