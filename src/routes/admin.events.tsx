import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell, type AdminPeriod } from "@/components/admin/AdminShell";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { type DateRange } from "@/lib/date-range";
import { adminPeriodToRange } from "@/lib/admin-period";
import {
  MousePointerClick, Plus, Pencil, Trash2, AlertTriangle, FileSearch, Clock, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/events")({
  head: () => ({ meta: [{ title: "Eventos · CloakPanel" }] }),
  component: EventsPage,
});




type EventKind =
  | "link_created" | "link_updated" | "link_deleted"
  | "redirect" | "redirect_slow" | "redirect_404"
  | "limit_reached" | "waiting_activated";

interface Event {
  id: string;
  ts: string;
  kind: EventKind;
  slug: string;
  linkName?: string | null;
  mode?: string | null;
  detail: string;
  user: string;
}

interface ClickRow {
  id: string;
  link_id: string;
  mode_at_click: string;
  cache_status: string | null;
  redirect_ms: number | null;
  created_at: string;
}
interface LinkRow {
  id: string;
  slug: string;
  name: string | null;
  mode: string;
  click_limit: number | null;
  click_count: number;
  created_at: string;
}

const KIND_META: Record<EventKind, { label: string; icon: React.ComponentType<{ className?: string }>; tone: "info" | "success" | "warning" | "danger" }> = {
  link_created:     { label: "Link criado",       icon: Plus,             tone: "success" },
  link_updated:     { label: "Link editado",      icon: Pencil,           tone: "info"    },
  link_deleted:     { label: "Link deletado",     icon: Trash2,           tone: "danger"  },
  redirect:         { label: "Redirect",          icon: MousePointerClick, tone: "info"   },
  redirect_slow:    { label: "Redirect lento",    icon: Clock,            tone: "warning" },
  redirect_404:     { label: "Slug 404",          icon: FileSearch,       tone: "danger"  },
  limit_reached:    { label: "Limite atingido",   icon: AlertTriangle,    tone: "warning" },
  waiting_activated:{ label: "Modo espera",       icon: Activity,         tone: "warning" },
};

const TONE: Record<"info" | "success" | "warning" | "danger", string> = {
  info: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  success: "bg-[--success]/10 text-[--success] border-[--success]/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-destructive/10 text-destructive border-destructive/25",
};

function EventsPage() {
  const [period, setPeriod] = useState<AdminPeriod>("today");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EventKind | "all">("all");
  const [events, setEvents] = useState<Event[]>([]);

  const range = useMemo<DateRange>(() => adminPeriodToRange(period, customStart, customEnd), [period, customStart, customEnd]);

  useEffect(() => { void load(); }, [range.start?.getTime()]);

  async function load() {
    if (!range.start) return;
    const endIso = (range.end ?? new Date()).toISOString();
    const [linksRes, clicksRes] = await Promise.all([
      supabase.from("links").select("id, slug, name, mode, click_limit, click_count, created_at"),
      supabase.from("clicks")
        .select("id, link_id, mode_at_click, cache_status, redirect_ms, created_at")
        .gte("created_at", range.start.toISOString())
        .lt("created_at", endIso)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);
    const links = (linksRes.data ?? []) as LinkRow[];
    const linkMap = new Map(links.map((l) => [l.id, l]));
    const clicks = (clicksRes.data ?? []) as ClickRow[];

    const ev: Event[] = [];

    // Link created (within range)
    for (const l of links) {
      const t = new Date(l.created_at).getTime();
      if (t >= range.start.getTime() && t < (range.end ?? new Date()).getTime()) {
        ev.push({
          id: `lc-${l.id}`, ts: l.created_at, kind: "link_created",
          slug: l.slug, linkName: l.name, mode: l.mode, detail: `Slug /${l.slug} criado em modo ${l.mode}`, user: "system",
        });
      }
      if (l.click_limit && l.click_count >= l.click_limit) {
        ev.push({
          id: `lim-${l.id}`, ts: l.created_at, kind: "limit_reached",
          slug: l.slug, linkName: l.name, mode: l.mode, detail: `Limite de ${l.click_limit} cliques atingido`, user: "system",
        });
      }
    }

    // Clicks → redirect events
    for (const c of clicks) {
      const link = linkMap.get(c.link_id);
      const slug = link?.slug ?? c.link_id.slice(0, 6);
      const linkName = link?.name ?? null;
      const ms = c.redirect_ms ?? 0;
      const baseMode = c.mode_at_click.split(":")[0];

      if (ms > 500) {
        ev.push({
          id: `rs-${c.id}`, ts: c.created_at, kind: "redirect_slow",
          slug, linkName, mode: baseMode, user: "anônimo",
          detail: `Redirect levou ${ms}ms · cache ${c.cache_status ?? "—"}`,
        });
      } else {
        ev.push({
          id: `r-${c.id}`, ts: c.created_at, kind: "redirect",
          slug, linkName, mode: baseMode, user: "anônimo",
          detail: `${ms}ms · cache ${c.cache_status ?? "—"} · mode ${baseMode}`,
        });
      }
      if (baseMode === "waiting") {
        ev.push({
          id: `wa-${c.id}`, ts: c.created_at, kind: "waiting_activated",
          slug, linkName, mode: baseMode, user: "system",
          detail: `Modo espera ativo: link sem destino real configurado`,
        });
      }
    }

    ev.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    setEvents(ev.slice(0, 1000));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (filter !== "all" && e.kind !== filter) return false;
      if (q && !e.slug.toLowerCase().includes(q) && !e.detail.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  return (
    <AdminShell period={period} onPeriod={setPeriod} customStart={customStart} customEnd={customEnd} onCustomRange={(s, e) => { setCustomStart(s); setCustomEnd(e); }} search={search} onSearch={setSearch}>
      <div className="px-4 md:px-6 py-6 space-y-5">
        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} count={counts.all ?? 0} label="Todos" />
          {(Object.keys(KIND_META) as EventKind[]).map((k) => (
            <FilterChip
              key={k}
              active={filter === k}
              onClick={() => setFilter(k)}
              count={counts[k] ?? 0}
              label={KIND_META[k].label}
              tone={KIND_META[k].tone}
            />
          ))}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-semibold tracking-tight">Auditoria</h2>
            <p className="text-[11px] text-muted-foreground">{filtered.length} eventos · gerado a partir de <code className="text-foreground/80">links</code> e <code className="text-foreground/80">clicks</code></p>
          </div>
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <FileSearch className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">Nenhum evento no período selecionado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-border text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 w-44">Data/Hora</th>
                    <th className="px-3 py-2.5 w-44">Evento</th>
                    <th className="px-3 py-2.5">Link</th>
                    <th className="px-3 py-2.5 w-24">Tipo</th>
                    <th className="px-3 py-2.5">Detalhes</th>
                    <th className="px-3 py-2.5 w-24">Usuário</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const meta = KIND_META[e.kind];
                    return (
                      <tr key={e.id} className="group border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                          {new Date(e.ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium", TONE[meta.tone])}>
                            <meta.icon className="h-3 w-3" />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono">/{e.slug}</td>
                        <td className="px-3 py-2.5">
                          {e.mode && (
                            <StatusBadge
                              kind={e.mode === "real" ? "real" : e.mode === "decoy" ? "decoy" : "waiting"}
                              label={e.mode === "real" ? "Real" : e.mode === "decoy" ? "Isca" : "Espera"}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[420px]">{e.detail}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{e.user}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function FilterChip({
  active, onClick, count, label, tone,
}: {
  active?: boolean; onClick?: () => void; count?: number; label: string; tone?: "info" | "success" | "warning" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
        active
          ? "border-foreground/30 bg-secondary text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {tone && <span className={cn("h-1.5 w-1.5 rounded-full",
        tone === "info" && "bg-sky-400",
        tone === "success" && "bg-[--success]",
        tone === "warning" && "bg-warning",
        tone === "danger" && "bg-destructive",
      )} />}
      {label}
      <span className="tabular-nums text-muted-foreground/80">{count ?? 0}</span>
    </button>
  );
}
