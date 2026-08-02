import { nf } from "@/lib/format";

export interface DomainTraffic {
  domain: string;
  clicks: number;
}

interface ClicksByDomainProps {
  data: DomainTraffic[];
  loading?: boolean;
  hasDomains: boolean;
}

export function ClicksByDomain({ data, loading, hasDomains }: ClicksByDomainProps) {
  const top = data.slice(0, 6);
  const max = top.reduce((m, d) => Math.max(m, d.clicks), 0);

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h2 className="text-[15px] font-semibold tracking-tight">Cliques por domínio</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Onde o tráfego está concentrado
      </p>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-secondary/50" />
            ))}
          </div>
        ) : !hasDomains ? (
          <div className="flex flex-col items-center gap-1 py-8 text-center">
            <p className="text-[13px] font-medium">Nenhum domínio cadastrado</p>
            <p className="text-[11.5px] text-muted-foreground">
              Adicione um domínio para acompanhar o tráfego por origem.
            </p>
          </div>
        ) : top.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-8 text-center">
            <p className="text-[13px] font-medium">Sem tráfego no período</p>
            <p className="text-[11.5px] text-muted-foreground">
              Os domínios aparecem aqui assim que receberem acessos.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {top.map((d) => (
              <li key={d.domain}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-mono text-[12.5px]">{d.domain}</span>
                  <span className="shrink-0 text-[12.5px] font-semibold tabular-nums">
                    {nf(d.clicks)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${max ? Math.max(3, (d.clicks / max) * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
