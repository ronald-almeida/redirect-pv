import { Archive, ArchiveRestore, Edit3, ListTree, Star } from "lucide-react";
import type { DomainRow } from "@/lib/bigcloak";
import { formatRel, nf } from "@/lib/format";
import { domainChecks, domainHealth } from "@/lib/domain-health";
import { USAGE_META, type DomainUsage } from "@/lib/domain-usage";
import { cn } from "@/lib/utils";

interface DomainCardProps {
  domain: DomainRow;
  usage: DomainUsage;
  onViewSlugs: (d: DomainRow) => void;
  onSetPrimary: (d: DomainRow) => void;
  onEdit: (d: DomainRow) => void;
  onArchive: (d: DomainRow) => void;
  onRestore: (d: DomainRow) => void;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold tabular-nums">{value}</div>
    </div>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function DomainCard({
  domain: d,
  usage,
  onViewSlugs,
  onSetPrimary,
  onEdit,
  onArchive,
  onRestore,
}: DomainCardProps) {
  const health = domainHealth(d, usage);
  const checks = domainChecks(d, usage);
  const archived = !!d.archived_at;
  const level = USAGE_META[usage.level];

  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors sm:p-5",
        d.is_primary && "border-primary/40",
        archived && "opacity-70",
      )}
    >
      <header className="min-w-0">
        <h3 className="truncate text-[17px] font-bold tracking-tight">{d.domain}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold">
            <span className={cn("h-1.5 w-1.5 rounded-full", health.dot)} />
            {health.label}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md bg-secondary/60 px-2 py-0.5 text-[11px] font-semibold",
              level.text,
            )}
            title="Métrica operacional de uso interno — não indica reputação do domínio."
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", level.dot)} />
            {level.label}
          </span>
          {d.is_primary ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-primary">
              <Star className="h-3 w-3" /> Principal
            </span>
          ) : (
            <span className="rounded-md bg-secondary/60 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {archived ? "Arquivado" : "Secundário"}
            </span>
          )}
        </div>
        {d.description && (
          <p className="mt-2 line-clamp-2 text-[12px] text-muted-foreground">{d.description}</p>
        )}
      </header>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Índice de utilização
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Slugs" value={nf(usage.totalSlugs)} />
          <Metric label="Ativas" value={nf(usage.activeSlugs)} />
          <Metric label="Em espera" value={nf(usage.waitingSlugs)} />
          <Metric label="Arquivadas" value={nf(usage.archivedSlugs)} />
          <Metric label="Cliques" value={nf(usage.clicks)} />
          <Metric label="7 dias" value={nf(usage.clicks7d)} />
          <Metric label="30 dias" value={nf(usage.clicks30d)} />
          <Metric label="Último acesso" value={formatRel(usage.lastClickAt)} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-muted-foreground">
          <span>
            1ª utilização <strong className="text-foreground">{shortDate(usage.firstUseAt)}</strong>
          </span>
          <span>
            Última utilização{" "}
            <strong className="text-foreground">{shortDate(usage.lastUseAt)}</strong>
          </span>
          <span>
            Redirect médio{" "}
            <strong className="text-foreground">
              {usage.avgRedirectMs ? `${usage.avgRedirectMs} ms` : "—"}
            </strong>
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11.5px] sm:grid-cols-4">
        {checks.map((c) => (
          <div key={c.key} className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {c.title}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-semibold">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", c.dot)} />
              <span className="truncate">{c.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button
          onClick={() => onViewSlugs(d)}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-3 text-[13px] font-semibold transition-colors hover:bg-secondary"
        >
          <ListTree className="h-4 w-4" /> Ver slugs
        </button>
        {!d.is_primary && !archived && (
          <button
            onClick={() => onSetPrimary(d)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <Star className="h-4 w-4" /> Principal
          </button>
        )}
        <button
          onClick={() => onEdit(d)}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold transition-colors hover:bg-secondary"
        >
          <Edit3 className="h-4 w-4" /> Editar
        </button>
        {archived ? (
          <button
            onClick={() => onRestore(d)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold transition-colors hover:bg-secondary"
          >
            <ArchiveRestore className="h-4 w-4" /> Restaurar
          </button>
        ) : (
          <button
            onClick={() => onArchive(d)}
            disabled={d.is_primary}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-[13px] font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
          >
            <Archive className="h-4 w-4" /> Arquivar
          </button>
        )}
      </div>
    </article>
  );
}
