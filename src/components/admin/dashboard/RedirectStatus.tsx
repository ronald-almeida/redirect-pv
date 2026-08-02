import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { AdminClickRow } from "@/lib/supabase/queries/clicks";
import { pct } from "@/lib/format";

interface RedirectStatusProps {
  clicks: AdminClickRow[];
  periodLabel: string;
}

/** Considera sucesso todo clique que resolveu em um dos modos conhecidos. */
export function RedirectStatus({ clicks, periodLabel }: RedirectStatusProps) {
  const total = clicks.length;
  const ok = clicks.filter(
    (c) =>
      c.mode_at_click.startsWith("real") ||
      c.mode_at_click.startsWith("decoy") ||
      c.mode_at_click.startsWith("waiting"),
  ).length;
  const fail = total - ok;

  const data = [
    { name: "Sucesso", value: ok, color: "#34D399" },
    { name: "Falhas", value: fail, color: "#F43F5E" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold tracking-tight">Status dos Redirecionamentos</h3>
        <span className="shrink-0 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
          {periodLabel}
        </span>
      </div>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
        <div className="relative h-[170px] w-[170px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={total ? data : [{ name: "—", value: 1, color: "#1B2029" }]}
                dataKey="value"
                innerRadius={55}
                outerRadius={78}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {(total ? data : [{ color: "#1B2029" }]).map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[22px] font-semibold leading-none tabular-nums">
              {pct(ok, total)}%
            </span>
            <span className="mt-0.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Sucesso
            </span>
          </div>
        </div>
        <div className="w-full flex-1 space-y-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                <span className="font-medium">{d.name}</span>
              </div>
              <div className="tabular-nums text-muted-foreground">
                {d.value} <span className="opacity-70">({pct(d.value, total)}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
