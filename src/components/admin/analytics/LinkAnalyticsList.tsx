import { useState } from "react";
import { formatRel, nf } from "@/lib/format";
import { rateLatency } from "@/lib/latency-rating";
import { LINK_STATUS_LABEL, type LinkAnalytics } from "@/lib/analytics/model";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const PAGE = 12;

const STATUS_TONE: Record<LinkAnalytics["status"], string> = {
  active: "text-primary border-primary/40",
  waiting: "text-warning border-warning/40",
  archived: "text-muted-foreground border-border",
  inactive: "text-muted-foreground border-border",
};

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("truncate text-[12.5px] font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

/** Analytics por link — cards densos, paginados no cliente sobre dados já carregados. */
export function LinkAnalyticsList({ rows }: { rows: LinkAnalytics[] }) {
  const [visible, setVisible] = useState(PAGE);
  const shown = rows.slice(0, visible);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-[12px] text-muted-foreground">
        Nenhum link com dados no período.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {shown.map((l) => {
        const lat = rateLatency(l.avgMs);
        return (
          <article key={l.id} className="rounded-xl border border-border bg-card p-3.5">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-[13.5px] font-bold">{l.name}</h3>
                <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                  {l.domain}/{l.slug}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  STATUS_TONE[l.status],
                )}
              >
                {LINK_STATUS_LABEL[l.status]}
              </span>
            </header>

            <p className="mt-2 truncate text-[11px] text-muted-foreground">
              Destino: <span className="text-foreground/80">{l.destination}</span>
            </p>

            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
              <Cell label="Cliques" value={nf(l.clicksWindow)} tone="text-primary" />
              <Cell label="Último acesso" value={formatRel(l.lastClickAt)} />
              <Cell
                label="Redirect médio"
                value={l.avgMs ? `${nf(l.avgMs)} ms` : "—"}
                tone={lat.className}
              />
              <Cell label="Máximo" value={l.maxMs ? `${nf(l.maxMs)} ms` : "—"} />
              <Cell label="Mínimo" value={l.minMs ? `${nf(l.minMs)} ms` : "—"} />
            </div>
          </article>
        );
      })}

      {visible < rows.length && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setVisible((v) => v + PAGE)}
        >
          Carregar mais ({rows.length - visible} restantes)
        </Button>
      )}
    </div>
  );
}
