import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  AUDIT_ACTION_LABEL,
  ENTITY_LABEL,
  describeValue,
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
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold",
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

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 w-36">Quando</th>
              <th className="px-3 py-2.5 w-52">Ação</th>
              <th className="px-3 py-2.5 w-48">Entidade afetada</th>
              <th className="px-3 py-2.5">Valor anterior</th>
              <th className="px-3 py-2.5">Valor novo</th>
              <th className="px-3 py-2.5 w-28">Operador</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="px-4 py-2.5 font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {formatDateTime(r.created_at)}
                </td>
                <td className="px-3 py-2.5 font-semibold">{label(r.action)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <EntityChip row={r} />
                    <span className="truncate">{affected(r)}</span>
                  </div>
                </td>
                <td className="max-w-[260px] truncate px-3 py-2.5 text-muted-foreground">
                  {describeValue(r.before_value)}
                </td>
                <td className="max-w-[260px] truncate px-3 py-2.5 text-foreground/90">
                  {describeValue(r.after_value)}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="divide-y divide-border md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <EntityChip row={r} />
              <span className="truncate text-[13.5px] font-bold">{label(r.action)}</span>
            </div>
            <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              {affected(r)} · {formatDateTime(r.created_at)} · {r.actor}
            </div>
            <div className="mt-2 space-y-1 rounded-md border border-border bg-secondary/40 p-2 text-[11.5px]">
              <div className="text-muted-foreground">
                <span className="font-semibold">Antes:</span> {describeValue(r.before_value)}
              </div>
              <div>
                <span className="font-semibold text-muted-foreground">Depois:</span>{" "}
                {describeValue(r.after_value)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
