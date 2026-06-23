import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: number | null; // percent
  icon: React.ComponentType<{ className?: string }>;
  series?: number[];
  accent?: "default" | "success" | "warning" | "danger" | "indigo";
  suffix?: string;
}

const ACCENT: Record<string, { line: string; tint: string; text: string }> = {
  default: { line: "#A1A1AA", tint: "rgba(161,161,170,0.15)", text: "text-foreground" },
  success: { line: "#34D399", tint: "rgba(52,211,153,0.18)", text: "text-[--success]" },
  warning: { line: "#FBBF24", tint: "rgba(251,191,36,0.18)", text: "text-warning" },
  danger:  { line: "#F43F5E", tint: "rgba(244,63,94,0.18)", text: "text-destructive" },
  indigo:  { line: "#6366F1", tint: "rgba(99,102,241,0.20)", text: "text-foreground" },
};

export function MetricCard({ label, value, delta, icon: Icon, series, accent = "default", suffix }: MetricCardProps) {
  const a = ACCENT[accent];
  const deltaPositive = (delta ?? 0) >= 0;
  const data = (series ?? []).map((v, i) => ({ i, v }));

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        {delta !== undefined && delta !== null && (
          <span className={cn(
            "rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums",
            deltaPositive
              ? "border-[--success]/25 text-[--success] bg-[--success]/8"
              : "border-destructive/25 text-destructive bg-destructive/8",
          )}>
            {deltaPositive ? "+" : ""}{delta.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={cn("text-[28px] font-semibold tracking-tight tabular-nums", a.text)}>{value}</span>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {data.length > 1 && (
        <div className="mt-3 h-10 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <defs>
                <linearGradient id={`spark-${accent}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={a.line} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={a.line} stopOpacity={1} />
                </linearGradient>
              </defs>
              <Line
                type="monotone"
                dataKey="v"
                stroke={`url(#spark-${accent})`}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
