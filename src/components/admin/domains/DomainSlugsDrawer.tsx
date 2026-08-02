import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { DomainRow, LinkRow } from "@/lib/bigcloak";
import { formatRel, nf } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DomainSlugsDrawerProps {
  domain: DomainRow | null;
  links: LinkRow[];
  onOpenChange: (open: boolean) => void;
}

function statusOf(l: LinkRow) {
  if (l.archived_at) return { label: "Arquivado", dot: "bg-muted-foreground" };
  if (!l.active) return { label: "Pausado", dot: "bg-muted-foreground" };
  if (l.mode === "waiting") return { label: "Espera", dot: "bg-[#F59E0B]" };
  return { label: "Ativo", dot: "bg-primary" };
}

export function DomainSlugsDrawer({ domain, links, onOpenChange }: DomainSlugsDrawerProps) {
  return (
    <Sheet open={!!domain} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="truncate">Slugs de {domain?.domain}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {links.length === 0 && (
            <p className="py-10 text-center text-[13px] text-muted-foreground">
              Nenhuma slug vinculada a este domínio.
            </p>
          )}
          {links.map((l) => {
            const s = statusOf(l);
            return (
              <div key={l.id} className="rounded-xl border border-border bg-card p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold">{l.name || l.slug}</div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      /{l.slug}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold">
                    <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                    {s.label}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-[11.5px] text-muted-foreground">
                  <span>
                    <strong className="text-foreground tabular-nums">
                      {nf(l.click_count ?? 0)}
                    </strong>{" "}
                    cliques
                  </span>
                  <span>Último acesso {formatRel(l.last_click_at)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <Link
          to="/admin/slugs"
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-[13px] font-semibold hover:bg-secondary"
        >
          Abrir gestão de links <ExternalLink className="h-4 w-4" />
        </Link>
      </SheetContent>
    </Sheet>
  );
}
