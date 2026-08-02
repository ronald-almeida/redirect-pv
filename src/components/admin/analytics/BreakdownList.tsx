import { cn } from "@/lib/utils";
import { nf } from "@/lib/format";
import type { Breakdown } from "@/lib/business-analytics";

/** Ranking horizontal com barra proporcional — leitura imediata do que performa. */
export function BreakdownList({
  title,
  subtitle,
  rows,
  emptyLabel = "Sem dados no período",
  showConversion = false,
}: {
  title: string;
  subtitle?: string;
  rows: Breakdown[];
  emptyLabel?: string;
  showConversion?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.total));

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
                  <p className="text-[13px] font-bold tabular-nums">{nf(r.total)}</p>
                  <p className="text-[10.5px] text-muted-foreground tabular-nums">
                    {r.share.toFixed(1)}%
                    {showConversion && r.total > 0 && (
                      <> · {((r.redirected / r.total) * 100).toFixed(0)}% real</>
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full bg-primary")}
                  style={{ width: `${Math.max(3, (r.total / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
