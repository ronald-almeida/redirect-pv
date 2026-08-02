import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Edit3,
  MoreHorizontal,
  Check,
  Play,
  PauseCircle,
} from "lucide-react";
import type { DomainRow, LinkRow } from "@/lib/bigcloak";
import { formatRel, nf } from "@/lib/format";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { canActivate } from "@/lib/supabase/queries/links";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface SlugRowProps {
  link: LinkRow;
  pulsing: boolean;
  copied: boolean;
  clicks: number;
  lastClickAt: string | null;
  domain: string;
  domains: DomainRow[];
  onCopy: (l: LinkRow) => void;
  onEdit: (l: LinkRow) => void;
  onArchive: (l: LinkRow) => void;
  onRestore: (l: LinkRow) => void;
  onDuplicate: (l: LinkRow) => void;
  onPickDomain: (l: LinkRow, domainId: string) => void;
  onActivate: (l: LinkRow) => void;
  onDeactivate: (l: LinkRow) => void;
}

function statusKind(l: LinkRow): "active" | "paused" | "waiting" {
  if (l.archived_at) return "paused";
  if (!l.active) return "paused";
  if (l.mode === "waiting") return "waiting";
  return "active";
}

function statusLabel(l: LinkRow): string {
  if (l.archived_at) return "Arquivado";
  if (!l.active) return "Pausado";
  if (l.mode === "waiting") return "Espera";
  return "Ativo";
}

export function SlugRow(props: SlugRowProps) {
  const { link, pulsing, copied, clicks, lastClickAt, domain, domains } = props;

  return (
    <tr
      className={cn(
        "border-t border-border/60 transition-colors",
        pulsing ? "bg-primary/5" : "hover:bg-secondary/30",
      )}
    >
      <td className="max-w-[320px] px-5 py-3.5">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-foreground">
            {link.name || link.slug}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">/{link.slug}</div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <DomainPicker link={link} domain={domain} domains={domains} onPick={props.onPickDomain} />
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge kind={statusKind(link)} label={statusLabel(link)} dot />
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums">
        <span className={cn("text-[13px] font-semibold", pulsing && "text-primary")}>
          {nf(clicks)}
        </span>
      </td>
      <td className="px-4 py-3.5 text-[12px] text-muted-foreground">{formatRel(lastClickAt)}</td>
      <td className="px-4 py-3.5">
        <div className="flex items-center justify-end gap-1">
          {!link.archived_at &&
            (link.mode === "waiting" ? (
              <button
                onClick={() => props.onActivate(link)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold transition",
                  canActivate(link)
                    ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-border bg-secondary/60 text-muted-foreground hover:text-foreground",
                )}
                title={
                  canActivate(link)
                    ? "Ativar link"
                    : "Adicione uma URL de destino antes de ativar este link."
                }
              >
                <Play className="h-3.5 w-3.5" /> Ativar
              </button>
            ) : (
              <button
                onClick={() => props.onDeactivate(link)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2.5 text-[11.5px] font-semibold text-muted-foreground transition hover:text-foreground"
                title="Colocar em espera"
              >
                <PauseCircle className="h-3.5 w-3.5" /> Espera
              </button>
            ))}
          <IconBtn label="Copiar" onClick={() => props.onCopy(link)}>
            {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn label="Editar" onClick={() => props.onEdit(link)}>
            <Edit3 className="h-3.5 w-3.5" />
          </IconBtn>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Mais ações"
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {!link.archived_at &&
                (link.mode === "waiting" ? (
                  <DropdownMenuItem onClick={() => props.onActivate(link)}>
                    <Play className="mr-2 h-3.5 w-3.5" /> Ativar link
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => props.onDeactivate(link)}>
                    <PauseCircle className="mr-2 h-3.5 w-3.5" /> Colocar em espera
                  </DropdownMenuItem>
                ))}
              <DropdownMenuItem onClick={() => props.onDuplicate(link)}>Duplicar</DropdownMenuItem>
              <DropdownMenuSeparator />
              {link.archived_at ? (
                <DropdownMenuItem onClick={() => props.onRestore(link)}>
                  <ArchiveRestore className="mr-2 h-3.5 w-3.5" /> Restaurar
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => props.onArchive(link)}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="mr-2 h-3.5 w-3.5" /> Arquivar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}

function DomainPicker({
  link,
  domain,
  domains,
  onPick,
}: {
  link: LinkRow;
  domain: string;
  domains: DomainRow[];
  onPick: (l: LinkRow, id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (domains.length <= 1) {
    return <span className="font-mono text-[11.5px] text-muted-foreground">{domain || "—"}</span>;
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="rounded-md border border-border bg-secondary/60 px-2 py-1 font-mono text-[11.5px] text-foreground hover:border-primary/40">
          {domain || "—"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {domains.map((d) => (
          <DropdownMenuItem key={d.id} onClick={() => onPick(link, d.id)}>
            <span className="font-mono text-[12px]">{d.domain}</span>
            {d.id === link.domain_id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
