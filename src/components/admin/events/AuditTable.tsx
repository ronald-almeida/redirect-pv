import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  AUDIT_ACTION_LABEL,
  ENTITY_LABEL,
  valuePairs,
  type AuditEntity,
  type AuditRow,
} from "@/lib/supabase/queries/audit";

const ENTITY_TONE: Record<string, string> = {
  link: "bg-primary/12 text-primary border-primary/30",
  domain: "bg-sky-500/12 text-sky-400 border-sky-500/30",
  settings: "bg-muted text-muted-foreground border-border",
};

function label(a: string) {
  return AUDIT_ACTION_LABEL[a] ?? a;
}

function EntityChip({ row }: { row: AuditRow }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold",
        ENTITY_TONE[row.entity_type] ?? ENTITY_TONE.settings,
      )}
    >
      {ENTITY_LABEL[row.entity_type as AuditEntity] ?? row.entity_type}
    </span>
  );
}

function affected(row: AuditRow) {
  return row.entity_label || (row.slug ? `/${row.slug}` : "—");
}

/** Bloco comparativo Antes → Depois, campo a campo. */
function Diff({ row, compact }: { row: AuditRow; compact?: boolean }) {
  const pairs = valuePairs(row.before_value, row.after_value);
  if (pairs.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className={cn("space-y-1", compact && "text-[11.5px]")}>
      {pairs.slice(0, compact ? 4 : 6).map((p) => (
        <div key={p.field} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            {p.field}
          </span>
          <span className="max-w-[220px] truncate text-muted-foreground line-through decoration-muted-foreground/50">
            {p.before}
          </span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="max-w-[240px] truncate font-semibold text-foreground">{p.after}</span>
        </div>
      ))}
    </div>
  );
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 w-36">Data e hora</th>
              <th className="px-3 py-2.5 w-52">Alteração</th>
              <th className="px-3 py-2.5 w-48">Entidade afetada</th>
              <th className="px-3 py-2.5">Antes → Depois</th>
              <th className="px-3 py-2.5 w-28">Operador</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border align-top last:border-0 hover:bg-secondary/40"
              >
                <td className="px-4 py-3 font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {formatDateTime(r.created_at)}
                </td>
                <td className="px-3 py-3 font-semibold">{label(r.action)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <EntityChip row={r} />
                    <span className="truncate">{affected(r)}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Diff row={r} />
                </td>
                <td className="px-3 py-3 text-muted-foreground">{r.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — cards */}
      <div className="space-y-2 p-3 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="flex items-start gap-2">
              <EntityChip row={r} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold leading-tight">
                {label(r.action)}
              </span>
            </div>
            <div className="mt-1 truncate text-[11.5px] text-muted-foreground">
              {affected(r)} · {formatDateTime(r.created_at)} · {r.actor}
            </div>
            <div className="mt-2 rounded-lg border border-border bg-card p-2">
              <Diff row={r} compact />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
