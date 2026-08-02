import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  Edit3,
  MoreHorizontal,
  PauseCircle,
  Play,
} from "lucide-react";
import type { LinkRow } from "@/lib/bigcloak";
import { formatRel, nf } from "@/lib/format";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SlugCardProps {
  link: LinkRow;
  pulsing: boolean;
  copied: boolean;
  clicks: number;
  lastClickAt: string | null;
  domain: string;
  onCopy: (l: LinkRow) => void;
  onEdit: (l: LinkRow) => void;
  onArchive: (l: LinkRow) => void;
  onRestore: (l: LinkRow) => void;
  onDuplicate: (l: LinkRow) => void;
  onActivate: (l: LinkRow) => void;
  onDeactivate: (l: LinkRow) => void;
}

function statusKind(l: LinkRow): "active" | "paused" | "waiting" {
  if (l.archived_at || !l.active) return "paused";
  if (l.mode === "waiting") return "waiting";
  return "active";
}
function statusLabel(l: LinkRow): string {
  if (l.archived_at) return "Arquivado";
  if (!l.active) return "Pausado";
  if (l.mode === "waiting") return "Espera";
  return "Ativo";
}

export function SlugCard(props: SlugCardProps) {
  const { link, pulsing, copied, clicks, lastClickAt, domain } = props;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 transition-colors",
        pulsing && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{link.name || link.slug}</div>
          <div className="truncate font-mono text-[11.5px] text-muted-foreground">
            {domain}/{link.slug}
          </div>
        </div>
        <StatusBadge kind={statusKind(link)} label={statusLabel(link)} dot />
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
        <div>
          <span className={cn("text-[15px] font-bold text-foreground", pulsing && "text-primary")}>
            {nf(clicks)}
          </span>{" "}
          cliques
        </div>
        <div>{formatRel(lastClickAt)}</div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
        <button
          onClick={() => props.onCopy(link)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-secondary py-2 text-[12.5px] font-medium hover:border-primary/40"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
        <button
          onClick={() => props.onEdit(link)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-secondary py-2 text-[12.5px] font-medium hover:border-primary/40"
        >
          <Edit3 className="h-3.5 w-3.5" /> Editar
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Mais"
              className="grid h-9 w-9 place-items-center rounded-md border border-border bg-secondary hover:border-primary/40"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
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
    </div>
  );
}
