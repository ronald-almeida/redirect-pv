import type { TimelineEvent } from "@/lib/domain-usage";
import { formatDateTime, formatRel } from "@/lib/format";

interface DomainTimelineProps {
  events: TimelineEvent[];
}

/** Histórico resumido do domínio — base para auditorias e consultas futuras. */
export function DomainTimeline({ events }: DomainTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-[12.5px] text-muted-foreground">Nenhum evento registrado ainda.</p>
    );
  }
  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {events.map((e, i) => (
        <li key={`${e.kind}-${i}`} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
          <div className="text-[13px] font-semibold">{e.label}</div>
          <div className="text-[11.5px] text-muted-foreground">
            {e.at ? `${formatDateTime(e.at)} · ${formatRel(e.at)}` : "—"}
            {e.detail ? ` · ${e.detail}` : ""}
          </div>
        </li>
      ))}
    </ol>
  );
}
