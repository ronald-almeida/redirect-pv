import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/format";

export type HealthState = "ok" | "warn" | "bad" | "idle";

const DOT: Record<HealthState, string> = {
  ok: "bg-primary",
  warn: "bg-warning",
  bad: "bg-destructive",
  idle: "bg-muted-foreground",
};

const TEXT: Record<HealthState, string> = {
  ok: "text-primary",
  warn: "text-warning",
  bad: "text-destructive",
  idle: "text-muted-foreground",
};

export interface HealthItem {
  label: string;
  status: string;
  state: HealthState;
}

interface SystemHealthProps {
  items: HealthItem[];
  checkedAt?: string;
  loading?: boolean;
}

export function SystemHealth({ items, checkedAt, loading }: SystemHealthProps) {
  const worst: HealthState = items.some((i) => i.state === "bad")
    ? "bad"
    : items.some((i) => i.state === "warn")
      ? "warn"
      : items.length
        ? "ok"
        : "idle";

  const summary =
    worst === "ok"
      ? "Tudo funcionando"
      : worst === "warn"
        ? "Requer atenção"
        : worst === "bad"
          ? "Problema detectado"
          : "Verificando";

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            {worst === "ok" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            )}
            <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", DOT[worst])} />
          </span>
          <h2 className="text-[15px] font-semibold tracking-tight">Saúde do Sistema</h2>
        </div>
        <span className={cn("text-[12px] font-semibold", TEXT[worst])}>{summary}</span>
      </div>

      <div className="mt-4 space-y-px overflow-hidden rounded-lg border border-border">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between bg-background/40 px-3 py-3">
                <div className="h-3 w-28 animate-pulse rounded bg-secondary" />
                <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
              </div>
            ))
          : items.map((it) => (
              <div
                key={it.label}
                className="flex items-center justify-between gap-3 bg-background/40 px-3 py-3"
              >
                <span className="text-[13px] text-muted-foreground">{it.label}</span>
                <span className="flex items-center gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full", DOT[it.state])} />
                  <span className={cn("text-[13px] font-semibold", TEXT[it.state])}>
                    {it.status}
                  </span>
                </span>
              </div>
            ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11.5px] text-muted-foreground">
        <span>Última verificação: {checkedAt ? formatClock(checkedAt) : "—"}</span>
        <Link to="/admin/latency" className="font-semibold text-primary hover:underline">
          Ver detalhes
        </Link>
      </div>
    </section>
  );
}
