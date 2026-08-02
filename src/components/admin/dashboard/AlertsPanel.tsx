import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Info, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertLevel, DashboardAlert } from "@/lib/dashboard-alerts";

const LEVEL: Record<
  AlertLevel,
  { icon: typeof AlertTriangle; ring: string; text: string; label: string }
> = {
  critical: {
    icon: ShieldAlert,
    ring: "border-destructive/40 bg-destructive/[0.06]",
    text: "text-destructive",
    label: "Crítico",
  },
  warning: {
    icon: AlertTriangle,
    ring: "border-warning/40 bg-warning/[0.06]",
    text: "text-warning",
    label: "Atenção",
  },
  info: {
    icon: Info,
    ring: "border-border bg-background/40",
    text: "text-muted-foreground",
    label: "Informação",
  },
};

interface AlertsPanelProps {
  alerts: DashboardAlert[];
  loading?: boolean;
  onDismiss: (a: DashboardAlert) => void;
}

export function AlertsPanel({ alerts, loading, onDismiss }: AlertsPanelProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Alertas</h2>
        {alerts.length > 0 && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums">
            {alerts.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-lg bg-secondary/60" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
          <Check className="h-5 w-5 text-primary" />
          <p className="text-[13px] font-medium">Nenhum alerta no momento</p>
          <p className="text-[11.5px] text-muted-foreground">
            Tudo está operando dentro do esperado.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {alerts.map((a) => {
            const meta = LEVEL[a.level];
            const Icon = meta.icon;
            return (
              <li key={a.id} className={cn("rounded-lg border p-3", meta.ring)}>
                <div className="flex items-start gap-2.5">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.text)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10.5px] font-bold uppercase tracking-wide", meta.text)}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13px] font-semibold leading-snug">{a.title}</p>
                    {a.description && (
                      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                        {a.description}
                      </p>
                    )}
                    <div className="mt-2.5 flex items-center gap-2">
                      <Link
                        to={a.actionTo}
                        className="tap inline-flex items-center rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        {a.actionLabel}
                      </Link>
                    </div>
                  </div>
                  {a.dismissible && (
                    <button
                      type="button"
                      aria-label="Dispensar alerta"
                      onClick={() => onDismiss(a)}
                      className="tap -mr-1 -mt-1 shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
