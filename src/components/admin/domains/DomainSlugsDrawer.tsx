import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DomainTimeline } from "@/components/admin/domains/DomainTimeline";
import type { DomainRow, LinkRow } from "@/lib/bigcloak";
import { buildDomainTimeline, USAGE_META, type DomainUsage } from "@/lib/domain-usage";
import { formatRel, nf } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DomainSlugsDrawerProps {
  domain: DomainRow | null;
  links: LinkRow[];
  usage: DomainUsage;
  onOpenChange: (open: boolean) => void;
}

function statusOf(l: LinkRow) {
  if (l.archived_at) return { label: "Arquivado", dot: "bg-muted-foreground" };
  if (!l.active) return { label: "Pausado", dot: "bg-muted-foreground" };
  if (l.mode === "waiting") return { label: "Espera", dot: "bg-[#F59E0B]" };
  return { label: "Ativo", dot: "bg-primary" };
}

export function DomainSlugsDrawer({
  domain,
  links,
  usage,
  onOpenChange,
}: DomainSlugsDrawerProps) {
  const level = USAGE_META[usage.level];
  const events = domain ? buildDomainTimeline(domain, links, usage) : [];

  return (
    <Sheet open={!!domain} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="truncate">{domain?.domain}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          <section>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Índice de utilização
              </h4>
              <span
                className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold", level.text)}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", level.dot)} />
                {level.label}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Métrica operacional de uso interno. Não indica reputação, qualidade ou risco.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Total de slugs", nf(usage.totalSlugs)],
                ["Slugs ativas", nf(usage.activeSlugs)],
                ["Em espera", nf(usage.waitingSlugs)],
                ["Arquivadas", nf(usage.archivedSlugs)],
                ["Total de cliques", nf(usage.clicks)],
                ["Cliques 7 dias", nf(usage.clicks7d)],
                ["Cliques 30 dias", nf(usage.clicks30d)],
                ["Dias com uso (30d)", nf(usage.activeDays30d)],
                ["Último acesso", formatRel(usage.lastClickAt)],
                [
                  "1ª utilização",
                  usage.firstUseAt ? new Date(usage.firstUseAt).toLocaleDateString("pt-BR") : "—",
                ],
                [
                  "Última utilização",
                  usage.lastUseAt ? new Date(usage.lastUseAt).toLocaleDateString("pt-BR") : "—",
                ],
                ["Redirect médio", usage.avgRedirectMs ? `${usage.avgRedirectMs} ms` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-secondary/40 px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-[14px] font-bold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Timeline do domínio
            </h4>
            <DomainTimeline events={events} />
          </section>

          <section>
            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Slugs vinculadas ({nf(links.length)})
            </h4>
            <div className="space-y-2">
              {links.length === 0 && (
                <p className="py-6 text-center text-[13px] text-muted-foreground">
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
          </section>

          <Link
            to="/admin/slugs"
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-[13px] font-semibold hover:bg-secondary"
          >
            Abrir gestão de links <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
