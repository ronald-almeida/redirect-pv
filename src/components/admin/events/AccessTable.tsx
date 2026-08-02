import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  RESULT_ICON,
  RESULT_LABEL,
  RESULT_TONE,
  resultOf,
  type AccessRow,
} from "@/lib/supabase/queries/access-events";

export interface AccessView extends AccessRow {
  linkName: string;
  slug: string;
  domain: string;
  destination: string;
}

function ResultBadge({ mode }: { mode: string }) {
  const r = resultOf(mode);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap",
        RESULT_TONE[r],
      )}
    >
      <span aria-hidden>{RESULT_ICON[r]}</span>
      {RESULT_LABEL[r]}
    </span>
  );
}

function ms(v: number | null) {
  return v ? `${v}ms` : "—";
}

export function AccessTable({
  rows,
  onSelect,
}: {
  rows: AccessView[];
  onSelect: (r: AccessView) => void;
}) {
  return (
    <>
      {/* Desktop — tabela densa */}
      <div className="hidden md:block">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 w-36">Horário</th>
              <th className="px-3 py-2.5">Link</th>
              <th className="px-3 py-2.5 w-40">Domínio</th>
              <th className="px-3 py-2.5">URL de destino</th>
              <th className="px-3 py-2.5 w-40">Resultado</th>
              <th className="px-3 py-2.5 w-20 text-right">Tempo</th>
              <th className="px-3 py-2.5 w-24">Dispositivo</th>
              <th className="px-3 py-2.5 w-16">País</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => onSelect(r)}
                className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-secondary/40"
              >
                <td className="px-4 py-2.5 font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {formatDateTime(r.created_at)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[13px] font-bold">{r.linkName}</span>
                    <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                      /{r.slug}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 truncate text-muted-foreground">{r.domain || "—"}</td>
                <td className="max-w-[240px] truncate px-3 py-2.5 text-muted-foreground">
                  {r.destination || "—"}
                </td>
                <td className="px-3 py-2.5">
                  <ResultBadge mode={r.mode_at_click} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{ms(r.redirect_ms)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.device || "—"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.country || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — cards, sem tabela horizontal */}
      <div className="space-y-2 p-3 md:hidden">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r)}
            className="flex w-full items-start gap-3 rounded-xl border border-border bg-secondary/30 p-3 text-left transition-colors active:bg-secondary/60"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold leading-tight">
                  {r.linkName}
                </span>
                <ResultBadge mode={r.mode_at_click} />
              </div>
              <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                /{r.slug}
                {r.domain ? ` · ${r.domain}` : ""}
              </div>
              {r.destination && (
                <div className="truncate text-[11.5px] text-muted-foreground/80">
                  → {r.destination}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[11.5px] tabular-nums text-muted-foreground">
                <span>{formatDateTime(r.created_at)}</span>
                <span>{ms(r.redirect_ms)}</span>
                {r.device && <span>{r.device}</span>}
                {r.country && <span>{r.country}</span>}
              </div>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </>
  );
}
