import { formatRel, nf } from "@/lib/format";
import { USAGE_META } from "@/lib/domain-usage";
import { rateLatency } from "@/lib/latency-rating";
import type { DomainAnalytics } from "@/lib/analytics/model";
import { cn } from "@/lib/utils";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("truncate text-[13px] font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function fullDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

/** Analytics por domínio — cards no mobile e no desktop, nunca tabela larga. */
export function DomainAnalyticsCards({ rows }: { rows: DomainAnalytics[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-[12px] text-muted-foreground">
        Nenhum domínio com dados.
      </p>
    );
  }

  return (
    <div className="grid gap-2.5 lg:grid-cols-2">
      {rows.map((d) => {
        const usage = USAGE_META[d.level];
        const lat = rateLatency(d.avgRedirectMs);
        return (
          <article key={d.id} className="rounded-xl border border-border bg-card p-4">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-[14px] font-bold">{d.domain}</h3>
                <p className="text-[11px] text-muted-foreground">
                  {d.isPrimary ? "Principal · " : ""}
                  {d.archived ? "Arquivado" : "Em uso"}
                </p>
              </div>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[10.5px] font-semibold",
                  usage.text,
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", usage.dot)} />
                {usage.label}
              </span>
            </header>

            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
              <Stat label="Slugs" value={nf(d.totalSlugs)} />
              <Stat label="Ativas" value={nf(d.activeSlugs)} tone="text-primary" />
              <Stat label="Espera" value={nf(d.waitingSlugs)} />
              <Stat label="Arquivadas" value={nf(d.archivedSlugs)} />
              <Stat label="Cliques totais" value={nf(d.totalClicks)} />
              <Stat label="Cliques mês" value={nf(d.clicksMonth)} />
              <Stat label="Último clique" value={formatRel(d.lastClickAt)} />
              <Stat
                label="Tempo médio"
                value={d.avgRedirectMs ? `${nf(d.avgRedirectMs)} ms` : "—"}
                tone={lat.className}
              />
            </div>

            <footer className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2.5 text-[10.5px] text-muted-foreground">
              <span>Primeira utilização: {fullDate(d.firstUseAt)}</span>
              <span>Última utilização: {fullDate(d.lastUseAt)}</span>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
