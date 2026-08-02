import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  RESULT_LABEL,
  RESULT_TONE,
  resultOf,
} from "@/lib/supabase/queries/access-events";
import type { AccessView } from "./AccessTable";

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2.5 last:border-0">
      <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("break-all text-[13px]", mono && "font-mono text-[12px]")}>
        {value || "—"}
      </span>
    </div>
  );
}

/**
 * Detalhe do evento: drawer no desktop, bottom sheet no mobile.
 * Não expõe IP nem dados sensíveis desnecessários.
 */
export function EventDetailsSheet({
  event,
  onClose,
}: {
  event: AccessView | null;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const r = event ? resultOf(event.mode_at_click) : "waiting";

  return (
    <Sheet open={!!event} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "border-border bg-card",
          isMobile ? "max-h-[85vh] overflow-y-auto rounded-t-2xl" : "w-full sm:max-w-md",
        )}
      >
        {event && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2 text-[15px]">
                {event.linkName}
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold",
                    RESULT_TONE[r],
                  )}
                >
                  {RESULT_LABEL[r]}
                </span>
              </SheetTitle>
            </SheetHeader>

            <div className="mt-2 px-4 pb-6">
              <Row
                label="URL pública acessada"
                value={`${event.domain || "—"}/${event.slug}`}
                mono
              />
              <Row label="URL de destino" value={event.destination} mono />
              <Row
                label="Horário completo"
                value={new Date(event.created_at).toLocaleString("pt-BR", {
                  dateStyle: "full",
                  timeStyle: "medium",
                })}
              />
              <Row
                label="Tempo do redirecionamento"
                value={event.redirect_ms ? `${event.redirect_ms} ms` : "—"}
              />
              <Row label="Resultado" value={RESULT_LABEL[r]} />
              <Row label="Domínio" value={event.domain} />
              <Row label="Dispositivo" value={event.device ?? "—"} />
              <Row label="Localização" value={event.country ?? "Não disponível"} />
              <Row label="Identificador do evento" value={event.id} mono />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
