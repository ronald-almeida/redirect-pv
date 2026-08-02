import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  /** Sufixo pequeno depois do número (ex.: "ms"). */
  unit?: string;
  /** Variação percentual em relação ao período anterior. */
  delta?: number | null;
  deltaLabel?: string;
  /** Explicação curta — usar apenas quando o número não se explica sozinho. */
  hint?: string;
  /** Selo de status (ex.: "Excelente"). */
  badge?: { label: string; className: string };
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaLabel = "vs. período anterior",
  hint,
  badge,
  loading,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
        <div className="mt-3 h-8 w-20 animate-pulse rounded bg-secondary" />
        <div className="mt-3 h-3 w-28 animate-pulse rounded bg-secondary" />
      </div>
    );
  }

  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const up = (delta ?? 0) > 0;
  const flat = (delta ?? 0) === 0;
  const DeltaIcon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/25 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-muted-foreground">{label}</p>
        {badge && (
          <span
            className={cn(
              "shrink-0 rounded-full border border-border px-2 py-0.5 text-[10.5px] font-semibold",
              badge.className,
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-[28px] font-bold leading-none tracking-tight tabular-nums md:text-[32px]">
          {value}
        </span>
        {unit && <span className="text-[13px] font-medium text-muted-foreground">{unit}</span>}
      </div>

      {hasDelta ? (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px]">
          <DeltaIcon
            className={cn(
              "h-3.5 w-3.5",
              flat ? "text-muted-foreground" : up ? "text-primary" : "text-destructive",
            )}
          />
          <span
            className={cn(
              "font-semibold tabular-nums",
              flat ? "text-muted-foreground" : up ? "text-primary" : "text-destructive",
            )}
          >
            {flat ? "estável" : `${up ? "+" : ""}${delta!.toFixed(0)}%`}
          </span>
          <span className="text-muted-foreground">{deltaLabel}</span>
        </div>
      ) : hint ? (
        <p className="mt-2.5 text-[11.5px] text-muted-foreground">{hint}</p>
      ) : (
        <div className="mt-2.5 h-[17px]" />
      )}
    </div>
  );
}
