import { memo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Copy, Check, ExternalLink, MoreHorizontal, Trash2, Files, Settings2,
  BarChart3, Globe, Link2,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { DomainRow, LinkRow, Mode } from "@/lib/bigcloak";
import { formatRel, latencyTone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const MODE_ACCENT: Record<Mode, { tile: string; ring: string; icon: string }> = {
  real: {
    tile: "bg-primary/12 text-primary",
    ring: "ring-primary/40 shadow-[0_0_20px_-6px_rgba(52,211,153,0.55)]",
    icon: "#34D399",
  },
  decoy: {
    tile: "bg-[#F59E0B]/12 text-[#F59E0B]",
    ring: "ring-[#F59E0B]/40 shadow-[0_0_20px_-6px_rgba(245,158,11,0.55)]",
    icon: "#F59E0B",
  },
  waiting: {
    tile: "bg-[#A78BFA]/12 text-[#A78BFA]",
    ring: "ring-[#A78BFA]/40 shadow-[0_0_20px_-6px_rgba(167,139,250,0.55)]",
    icon: "#A78BFA",
  },
};

export interface SlugRowProps {
  link: LinkRow;
  pulsing: boolean;
  copied: boolean;
  cacheStatus?: string | null;
  lastClickAt?: string | null;
  countReal: number;
  countWaiting: number;
  sparkline: number[];
  domain: string;
  activeDomains: DomainRow[];
  onPickDomain: (linkId: string, domain: string) => void;
  onCopy: (link: LinkRow) => void;
  onDuplicate: (link: LinkRow) => void;
  onEdit: (link: LinkRow) => void;
  onSetMode: (link: LinkRow, mode: Mode) => void;
  onSetActive: (link: LinkRow, active: boolean) => void;
  onDelete: (link: LinkRow) => void;
}

function SlugRowBase({
  link: l,
  pulsing,
  copied,
  cacheStatus,
  lastClickAt,
  countReal,
  countWaiting,
  sparkline,
  domain,
  activeDomains,
  onPickDomain,
  onCopy,
  onDuplicate,
  onEdit,
  onSetMode,
  onSetActive,
  onDelete,
}: SlugRowProps) {
  const mode = ((l.mode as Mode) ?? "waiting") satisfies Mode;
  const accent = MODE_ACCENT[mode] ?? MODE_ACCENT.waiting;
  const status: "active" | "paused" | "waiting" = !l.active
    ? "paused"
    : mode === "waiting"
      ? "waiting"
      : "active";
  const last = l.last_redirect_ms ?? 0;
  const avg = l.avg_redirect_ms ?? 0;
  const tone = latencyTone(last);
  const sparkData = sparkline.map((v, i) => ({ i, v }));

  return (
    <tr
      className={cn(
        "group border-t border-border/60 transition-all even:bg-secondary/20 hover:bg-primary/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(52,211,153,0.55)]",
        pulsing && "bg-primary/[0.08] shadow-[inset_3px_0_0_0_rgba(52,211,153,0.9)]",
      )}
    >
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1",
              accent.tile,
              accent.ring,
            )}
          >
            <Link2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="max-w-[220px] truncate text-[14px] font-bold text-primary">
                {l.name?.trim() || l.real_url || "—"}
              </div>
              {pulsing && (
                <span className="relative flex h-2 w-2 shrink-0" title="Novo clique">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              )}
            </div>
            <div className="mt-0.5 max-w-[220px] truncate font-mono text-[11px] text-muted-foreground">
              /{l.slug}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                302 Redirect
              </span>
            </div>
          </div>
        </div>
      </td>

      <td className="px-3 py-4">
        <StatusBadge
          kind={status}
          label={status === "active" ? "Ativo" : status === "paused" ? "Pausado" : "Espera"}
          dot
        />
      </td>

      <td className="px-3 py-4">
        <StatusBadge
          kind={mode === "real" ? "real" : "waiting"}
          label={mode === "real" ? "Real" : "Espera"}
        />
      </td>

      <td className="px-3 py-4 text-center font-semibold tabular-nums text-primary">{countReal}</td>
      <td className="px-3 py-4 text-center font-semibold tabular-nums text-[#A78BFA]">
        {countWaiting}
      </td>

      <td className={cn("px-3 py-4 text-right tabular-nums", tone.className)}>
        <div className="font-semibold">{last ? `${last}ms` : "—"}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{tone.label}</div>
      </td>

      <td className="px-3 py-4">
        <div className="h-9 w-24">
          {sparkData.length > 1 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`sg-${l.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent.icon} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={accent.icon} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={accent.icon}
                  strokeWidth={1.5}
                  fill={`url(#sg-${l.id})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        {avg > 0 && <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{avg}ms</div>}
      </td>

      <td className="px-3 py-4 text-[11.5px] text-muted-foreground">
        {formatRel(lastClickAt)}
        {lastClickAt ? <span className="block text-[10px] opacity-70">atrás</span> : null}
      </td>

      <td className="px-3 py-4">
        {cacheStatus ? (
          <StatusBadge kind={(cacheStatus as "MEM" | "HIT" | "STALE" | "MISS") ?? "MEM"} dot />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      <td className="px-3 py-4">
        <div className="flex items-center justify-end gap-0.5">
          {activeDomains.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                title="Domínio para copiar"
                className="mr-1 inline-flex max-w-[132px] items-center gap-1 rounded-md border border-border bg-secondary/50 px-2 py-1 text-[10.5px] font-medium text-muted-foreground outline-none hover:text-foreground"
              >
                <Globe className="h-3 w-3 shrink-0" />
                <span className="truncate">{domain || "—"}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  Domínio para copiar
                </div>
                {activeDomains.map((d) => (
                  <DropdownMenuItem key={d.id} onClick={() => onPickDomain(l.id, d.domain)}>
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        domain === d.domain ? "bg-primary" : "bg-muted-foreground/40",
                      )}
                    />
                    {d.domain}
                    {d.is_primary && <span className="ml-auto text-[10px] text-primary">principal</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <button
            onClick={() => onCopy(l)}
            title="Copiar link"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={() => onDuplicate(l)}
            title="Duplicar"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Files className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => onEdit(l)}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11.5px] font-semibold text-primary transition-all hover:border-primary/60 hover:bg-primary/20 hover:shadow-[0_0_12px_-2px_rgba(52,211,153,0.55)]"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Editar
          </button>

          <Link
            to="/admin/analytics"
            title="Analytics"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-md p-1.5 text-muted-foreground outline-none hover:bg-secondary hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => window.open(`/${l.slug}`, "_blank")}>
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSetActive(l, !l.active)}>
                <Switch checked={l.active} className="pointer-events-none -ml-1 scale-75" />
                {l.active ? "Pausar" : "Ativar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSetMode(l, "real")}>
                <span className="h-2 w-2 rounded-full bg-primary" /> Modo: Real
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSetMode(l, "waiting")}>
                <span className="h-2 w-2 rounded-full bg-[#A78BFA]" /> Modo: Espera
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(l)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={() => onDelete(l)}
            title="Excluir"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export const SlugRow = memo(SlugRowBase);
