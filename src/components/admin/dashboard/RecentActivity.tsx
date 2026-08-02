import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { rateLatency } from "@/lib/latency-rating";

export interface ActivityItem {
  id: string;
  time: string;
  name: string;
  slug: string;
  domain: string;
  ms: number | null;
  redirected: boolean;
}

interface RecentActivityProps {
  items: ActivityItem[];
  loading?: boolean;
  error?: boolean;
}

export function RecentActivity({ items, loading, error }: RecentActivityProps) {
  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 md:px-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Atividade recente</h2>
        <Link
          to="/admin/analytics"
          className="text-[12px] font-semibold text-primary hover:underline"
        >
          Ver tudo
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2 p-4 md:p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[52px] animate-pulse rounded-lg bg-secondary/60" />
          ))}
        </div>
      ) : error ? (
        <div className="px-4 py-10 text-center md:px-5">
          <p className="text-[13px] font-medium">Não foi possível carregar os acessos</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Verifique sua conexão e tente novamente em instantes.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center md:px-5">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <p className="text-[13px] font-medium">Nenhum acesso registrado ainda</p>
          <p className="text-[12px] text-muted-foreground">
            Assim que um cliente abrir um link, ele aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="max-h-[420px] divide-y divide-border overflow-y-auto overscroll-contain">
          {items.map((it) => {
            const rating = rateLatency(it.ms);
            return (
              <li key={it.id} className="flex items-start gap-3 px-4 py-3 md:px-5">
                <span className="mt-[3px] w-[42px] shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
                  {it.time}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold leading-tight">{it.name}</p>
                  <p className="mt-0.5 truncate font-mono text-[11.5px] text-muted-foreground">
                    {it.domain ? `${it.domain}/` : "/"}
                    {it.slug}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[11.5px]">
                    {it.redirected ? (
                      <>
                        <ArrowRight className="h-3 w-3 text-primary" />
                        <span className="text-muted-foreground">
                          Redirecionado{" "}
                          {it.ms ? (
                            <span className={cn("font-semibold tabular-nums", rating.className)}>
                              em {it.ms} ms
                            </span>
                          ) : null}
                        </span>
                      </>
                    ) : (
                      <>
                        <Hourglass className="h-3 w-3 text-warning" />
                        <span className="text-muted-foreground">Página de espera</span>
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
