import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell, type AdminPeriod } from "@/components/admin/AdminShell";
import { MetricCard } from "@/components/admin/MetricCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Copy, Check, ExternalLink, MoreHorizontal, Plus, Trash2, Files, Settings2,
  MousePointerClick, Activity, Link2, Target, BarChart3, SlidersHorizontal,
  Search as SearchIcon, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";
import { type ClickRow, type LinkAgg, aggregate } from "@/lib/analytics";
import { type DateRange } from "@/lib/date-range";
import { adminPeriodToRange } from "@/lib/admin-period";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Links · CloakPanel" }] }),
  component: LinksPage,
});

type Mode = "real" | "decoy" | "waiting";

interface LinkRow {
  id: string;
  slug: string;
  name: string | null;
  mode: string;
  real_url: string | null;
  decoy_url: string | null;
  page_title: string | null;
  page_message: string | null;
  page_icon: string | null;
  active: boolean;
  owner_only: boolean;
  owner_ips: string[];
  created_at: string;
  avg_redirect_ms?: number | null;
  last_redirect_ms?: number | null;
  total_redirects?: number | null;
}

const DEFAULTS = {
  page_title: "Link em breve",
  page_message: "Este link está sendo configurado. Volte em breve.",
  page_icon: "⏳",
};

const PERIOD_SHORT: Record<AdminPeriod, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "7 dias",
  "30d": "30 dias",
  custom: "Período",
};

// Cache foi removido do sistema de redirect — no-op mantido para preservar
// pontos de chamada existentes sem alterar fluxos.
const purgeEdgeCache = (_slug: string) => {};


function formatRel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  if (diff < 60_000) return "agora";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}

function buildSparkSeries(rows: ClickRow[], range: DateRange, buckets = 16): number[] {
  if (!range.start) return [];
  const start = range.start.getTime();
  const endT = (range.end ?? new Date()).getTime();
  const span = endT - start;
  if (span <= 0) return [];
  const out = new Array(buckets).fill(0);
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (t < start || t >= endT) continue;
    const idx = Math.min(buckets - 1, Math.floor(((t - start) / span) * buckets));
    out[idx]++;
  }
  return out;
}

function LinksPage() {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [latencyByCache, setLatencyByCache] = useState<Record<string, string | null>>({});
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<AdminPeriod>("today");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newSlugError, setNewSlugError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "real" | "waiting">("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const range = useMemo<DateRange>(() => adminPeriodToRange(period, customStart, customEnd), [period, customStart, customEnd]);

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
    void loadLinks();
  }, []);

  useEffect(() => { void loadClicks(); }, [range.start?.getTime(), range.end?.getTime()]);

  // realtime updates
  useEffect(() => {
    const ch = supabase
      .channel("admin-links-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "links" }, (p) => {
        if (p.eventType === "UPDATE") {
          setLinks((prev) => prev.map((l) => l.id === (p.new as LinkRow).id ? { ...l, ...(p.new as LinkRow) } : l));
        } else if (p.eventType === "INSERT") {
          setLinks((prev) => [p.new as LinkRow, ...prev]);
        } else if (p.eventType === "DELETE") {
          setLinks((prev) => prev.filter((l) => l.id !== (p.old as LinkRow).id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function loadLinks() {
    const { data } = await supabase.from("links").select("*").order("created_at", { ascending: false });
    setLinks((data ?? []) as LinkRow[]);
  }

  async function loadClicks() {
    if (!range.start) return;
    const { data } = await supabase
      .from("clicks")
      .select("link_id, mode_at_click, country, device, is_vpn, utm_source, created_at, cache_status")
      .gte("created_at", range.start.toISOString())
      .lt("created_at", (range.end ?? new Date()).toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);
    const rows = (data ?? []) as (ClickRow & { cache_status?: string | null })[];
    setClicks(rows);
    // latest cache status per link
    const latest: Record<string, string | null> = {};
    for (const r of rows) {
      if (!latest[r.link_id] && r.cache_status) latest[r.link_id] = r.cache_status;
    }
    setLatencyByCache(latest);
  }

  const stats = useMemo(() => aggregate(clicks), [clicks]);

  const metrics = useMemo(() => {
    const totalClicks = clicks.length;
    const activeSlugs = links.filter((l) => l.active).length;
    const latencies = links.map((l) => l.avg_redirect_ms ?? 0).filter((n) => n > 0);
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    // success = clicks with mode real or decoy / total
    const success = clicks.length
      ? Math.round((clicks.filter((c) => c.mode_at_click.startsWith("real") || c.mode_at_click.startsWith("decoy")).length / clicks.length) * 1000) / 10
      : 0;

    const totalSpark = buildSparkSeries(clicks, range);
    // For latency sparkline, bucket avg redirect_ms by time
    const buckets = 16;
    const lat = new Array(buckets).fill(0);
    const cnt = new Array(buckets).fill(0);
    if (range.start) {
      const start = range.start.getTime();
      const endT = (range.end ?? new Date()).getTime();
      const span = endT - start;
      for (const c of clicks as (ClickRow & { redirect_ms?: number | null })[]) {
        const ms = (c as { redirect_ms?: number | null }).redirect_ms;
        if (!ms || !span) continue;
        const t = new Date(c.created_at).getTime();
        if (t < start || t >= endT) continue;
        const idx = Math.min(buckets - 1, Math.floor(((t - start) / span) * buckets));
        lat[idx] += ms;
        cnt[idx]++;
      }
    }
    const latSpark = lat.map((s, i) => (cnt[i] ? Math.round(s / cnt[i]) : 0));

    return { totalClicks, avgLatency, activeSlugs, success, totalSpark, latSpark };
  }, [clicks, links, range]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = links;
    if (typeFilter !== "all") list = list.filter((l) => (l.mode as Mode) === typeFilter);
    if (q) list = list.filter((l) => l.slug.toLowerCase().includes(q) || (l.name ?? "").toLowerCase().includes(q));
    return list;
  }, [links, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

  // Distribution by mode (clicks)
  const distribution = useMemo(() => {
    const counts = { real: 0, decoy: 0, waiting: 0 };
    for (const c of clicks) {
      const k = c.mode_at_click.startsWith("real") ? "real" : c.mode_at_click.startsWith("decoy") ? "decoy" : "waiting";
      counts[k]++;
    }
    const total = counts.real + counts.decoy + counts.waiting;
    return [
      { name: "Real",   value: counts.real,    pct: total ? counts.real / total : 0,    color: "#A3E635" },
      { name: "Isca",   value: counts.decoy,   pct: total ? counts.decoy / total : 0,   color: "#F59E0B" },
      { name: "Espera", value: counts.waiting, pct: total ? counts.waiting / total : 0, color: "#A78BFA" },
    ];
  }, [clicks]);

  // Latency time series (24 buckets)
  const latencySeries = useMemo(() => {
    if (!range.start) return [] as { t: string; ms: number }[];
    const start = range.start.getTime();
    const endT = (range.end ?? new Date()).getTime();
    const span = endT - start;
    const buckets = 24;
    const sum = new Array(buckets).fill(0);
    const cnt = new Array(buckets).fill(0);
    for (const c of clicks as (ClickRow & { redirect_ms?: number | null })[]) {
      const ms = c.redirect_ms;
      if (!ms || !span) continue;
      const t = new Date(c.created_at).getTime();
      if (t < start || t >= endT) continue;
      const idx = Math.min(buckets - 1, Math.floor(((t - start) / span) * buckets));
      sum[idx] += ms;
      cnt[idx]++;
    }
    return sum.map((s, i) => {
      const ts = new Date(start + (span * i) / buckets);
      return {
        t: ts.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        ms: cnt[i] ? Math.round(s / cnt[i]) : 0,
      };
    });
  }, [clicks, range]);

  const successStats = useMemo(() => {
    const total = clicks.length;
    const ok = clicks.filter((c) => c.mode_at_click.startsWith("real") || c.mode_at_click.startsWith("decoy") || c.mode_at_click.startsWith("waiting")).length;
    const fail = total - ok;
    return { ok, fail, total };
  }, [clicks]);

  const SLUG_RE = /^[a-z0-9-]+$/;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setNewSlugError(null);
    const slug = newSlug.trim().toLowerCase();
    if (!slug) { setNewSlugError("Informe um slug."); return; }
    if (!SLUG_RE.test(slug)) {
      setNewSlugError("Use apenas letras minúsculas, números e hífens.");
      return;
    }
    setCreating(true);
    const { data: existing } = await supabase.from("links").select("id").eq("slug", slug).maybeSingle();
    if (existing) {
      setCreating(false);
      setNewSlugError("Este slug já existe");
      return;
    }
    const { error } = await supabase.from("links").insert({ slug, mode: "waiting" });
    setCreating(false);
    if (error) { setNewSlugError(error.message); return; }
    setNewSlug("");
    setCreateOpen(false);
    void loadLinks();
  };

  const handleDelete = async (l: LinkRow) => {
    if (!confirm(`Excluir /${l.slug}?`)) return;
    const prev = links;
    setLinks((cur) => cur.filter((x) => x.id !== l.id));
    const { error } = await supabase.from("links").delete().eq("id", l.id);
    if (error) {
      console.error("[delete link]", error);
      alert(`Falha ao excluir: ${error.message}`);
      setLinks(prev);
      return;
    }
    purgeEdgeCache(l.slug);
    void loadLinks();
  };

  const handleDuplicate = async (l: LinkRow) => {
    const base = l.slug.replace(/-copy(-\d+)?$/, "");
    let candidate = `${base}-copy`;
    const existing = new Set(links.map((x) => x.slug));
    let n = 2;
    while (existing.has(candidate)) candidate = `${base}-copy-${n++}`;
    await supabase.from("links").insert({
      slug: candidate, name: l.name, mode: l.mode,
      real_url: l.real_url, decoy_url: l.decoy_url,
      page_title: l.page_title, page_message: l.page_message, page_icon: l.page_icon,
      active: l.active,
    });
    purgeEdgeCache(candidate);
  };

  const setMode = async (l: LinkRow, mode: Mode) => {
    setLinks((prev) => prev.map((x) => x.id === l.id ? { ...x, mode } : x));
    await supabase.from("links").update({ mode }).eq("id", l.id);
    purgeEdgeCache(l.slug);
  };

  const setActive = async (l: LinkRow, active: boolean) => {
    setLinks((prev) => prev.map((x) => x.id === l.id ? { ...x, active } : x));
    await supabase.from("links").update({ active }).eq("id", l.id);
    purgeEdgeCache(l.slug);
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${origin}/${slug}`);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 1500);
  };

  const persistEditing = async (patch: Partial<LinkRow>) => {
    if (!editing) return;
    const next = { ...editing, ...patch };
    setEditing(next);
    setLinks((prev) => prev.map((x) => (x.id === next.id ? next : x)));
  };

  const saveEditing = async () => {
    if (!editing) return;
    const newSlug = editing.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    const { error } = await supabase.from("links").update({
      slug: newSlug,
      name: editing.name?.trim() || null,
      real_url: editing.real_url?.trim() || null,
      page_title: editing.page_title?.trim() || DEFAULTS.page_title,
      page_message: editing.page_message?.trim() || DEFAULTS.page_message,
      page_icon: editing.page_icon?.trim() || DEFAULTS.page_icon,
    }).eq("id", editing.id);
    if (error) { alert(error.message); return; }
    purgeEdgeCache(newSlug);
    setEditing(null);
    void loadLinks();
  };

  const modeAccent: Record<Mode, { tile: string; ring: string; icon: string }> = {
    real:    { tile: "bg-primary/12 text-primary",         ring: "ring-primary/40 shadow-[0_0_20px_-6px_rgba(163,230,53,0.55)]",   icon: "#A3E635" },
    decoy:   { tile: "bg-[#F59E0B]/12 text-[#F59E0B]",     ring: "ring-[#F59E0B]/40 shadow-[0_0_20px_-6px_rgba(245,158,11,0.55)]", icon: "#F59E0B" },
    waiting: { tile: "bg-[#A78BFA]/12 text-[#A78BFA]",     ring: "ring-[#A78BFA]/40 shadow-[0_0_20px_-6px_rgba(167,139,250,0.55)]",icon: "#A78BFA" },
  };

  return (
    <AdminShell
      period={period}
      onPeriod={setPeriod}
      customStart={customStart}
      customEnd={customEnd}
      onCustomRange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
    >
      <div className="px-4 md:px-10 py-9 space-y-8 max-w-[1480px]">
        {/* Page header */}
        <header className="flex items-end justify-between gap-4 border-b border-border/60 pb-6">
          <div>
            <h1 className="text-[40px] font-bold tracking-tight leading-[1.05]">Visão Geral</h1>
            <p className="mt-2.5 text-[14px] text-muted-foreground/80 font-light">Acompanhe o desempenho dos seus links em tempo real</p>
          </div>
        </header>

        {/* Metrics */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <MetricCard
            label="Cliques no total"
            value={metrics.totalClicks.toLocaleString("pt-BR")}
            icon={MousePointerClick}
            series={metrics.totalSpark}
            accent="lime"
            delta={12.5}
          />
          <MetricCard
            label="Latência média"
            value={metrics.avgLatency || 0}
            suffix="ms"
            icon={Activity}
            series={metrics.latSpark}
            accent="violet"
            delta={-8.3}
          />
          <MetricCard
            label="Slugs ativos"
            value={metrics.activeSlugs}
            icon={Link2}
            accent="cyan"
            suffix={`/ ${links.length}`}
            delta={3}
          />
          <MetricCard
            label="Taxa de sucesso"
            value={`${metrics.success.toFixed(1)}%`}
            icon={Target}
            accent="orange"
            delta={0.6}
          />
        </section>

        {/* Links Table */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-5 pt-5 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[17px] font-semibold tracking-tight">Links Ativos</h2>
                <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{filtered.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nome ou slug..."
                    className="h-9 w-[260px] rounded-full border border-border bg-secondary pl-9 pr-3 text-[12.5px] outline-none focus:border-primary"
                  />
                </div>
                <Button variant="outline" size="sm" className="h-9 rounded-full gap-1.5 border-border bg-secondary">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
                </Button>
                <Button size="sm" className="h-9 rounded-full gap-1.5 px-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Novo Link
                </Button>
              </div>
            </div>

            {/* type segmented control */}
            <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-secondary/60 p-0.5 w-fit">
              {([
                { k: "all", l: "Todos" },
                { k: "real", l: "Real" },
                { k: "waiting", l: "Espera" },
              ] as const).map(({ k, l }) => (
                <button
                  key={k}
                  onClick={() => { setTypeFilter(k); setPage(1); }}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-[11.5px] font-semibold transition-all",
                    typeFilter === k
                      ? "bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_rgba(163,230,53,0.55)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Link2 className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold">Nenhum link encontrado</h3>
              <p className="mt-1 text-xs text-muted-foreground">{search ? "Ajuste a busca para ver mais resultados." : "Crie seu primeiro slug para começar."}</p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Novo link
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-secondary/30">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                      <th className="px-5 py-3.5 font-semibold">Link</th>
                      <th className="px-4 py-3.5 font-semibold">Status</th>
                      <th className="px-4 py-3.5 font-semibold">Tipo</th>
                      <th className="px-4 py-3.5 font-semibold text-center">Real</th>
                      <th className="px-4 py-3.5 font-semibold text-center">Espera</th>
                      <th className="px-4 py-3.5 font-semibold text-right">Última<br/>latência</th>
                      <th className="px-4 py-3.5 font-semibold">Média</th>
                      <th className="px-4 py-3.5 font-semibold">Último<br/>acesso</th>
                      <th className="px-4 py-3.5 font-semibold">Cache</th>
                      <th className="px-4 py-3.5 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((l) => {
                      const s: LinkAgg | undefined = stats[l.id];
                      const lastClick = s?.recent?.[0]?.created_at;
                      const last = l.last_redirect_ms ?? 0;
                      const avg = l.avg_redirect_ms ?? 0;
                      const cache = latencyByCache[l.id];
                      const mode = (l.mode as Mode) ?? "waiting";
                      const status: "active" | "paused" | "waiting" =
                        !l.active ? "paused" : mode === "waiting" ? "waiting" : "active";
                      const accent = modeAccent[mode];

                      // counts by mode for this link
                      const linkClicks = clicks.filter((c) => c.link_id === l.id);
                      const cReal = linkClicks.filter((c) => c.mode_at_click.startsWith("real")).length;
                      const cDecoy = linkClicks.filter((c) => c.mode_at_click.startsWith("decoy")).length;
                      const cWait = linkClicks.filter((c) => c.mode_at_click.startsWith("waiting")).length;
                      const sparkData = buildSparkSeries(linkClicks, range, 14).map((v, i) => ({ i, v }));

                      return (
                        <tr key={l.id} className="group border-t border-border/60 odd:bg-transparent even:bg-secondary/20 hover:bg-primary/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(163,230,53,0.55)] transition-all">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1", accent.tile, accent.ring)}>
                                <Link2 className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-[14px] font-bold text-primary truncate max-w-[220px]">{l.name?.trim() || l.real_url || "—"}</div>
                                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground truncate max-w-[220px]">/{l.slug}</div>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">302 Redirect</span>
                                  <StatusBadge kind={mode === "real" ? "real" : "waiting"} label={mode === "real" ? "Real" : "Espera"} />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <StatusBadge kind={status} label={status === "active" ? "Ativo" : status === "paused" ? "Pausado" : "Espera"} dot />
                          </td>
                          <td className="px-3 py-4">
                            <StatusBadge kind={mode === "real" ? "real" : "waiting"} label={mode === "real" ? "Real" : "Espera"} />
                          </td>
                          <td className="px-3 py-4 text-center tabular-nums text-primary font-semibold">{cReal}</td>
                          <td className="px-3 py-4 text-center tabular-nums text-[#A78BFA] font-semibold">{cWait + cDecoy}</td>
                          <td className={cn("px-3 py-4 text-right tabular-nums", last === 0 ? "text-muted-foreground" : last < 100 ? "text-primary" : last < 300 ? "text-[#F59E0B]" : "text-destructive")}>
                            <div className="font-semibold">{last ? `${last}ms` : "—"}</div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{last === 0 ? "—" : last < 100 ? "Ótimo" : last < 300 ? "Normal" : "Lento"}</div>
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
                                    <Area type="monotone" dataKey="v" stroke={accent.icon} strokeWidth={1.5} fill={`url(#sg-${l.id})`} isAnimationActive={false} />
                                  </AreaChart>
                                </ResponsiveContainer>
                              )}
                            </div>
                            {avg > 0 && <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">{avg}ms</div>}
                          </td>
                          <td className="px-3 py-4 text-muted-foreground text-[11.5px]">{formatRel(lastClick)}{lastClick ? <span className="block text-[10px] opacity-70">atrás</span> : null}</td>
                          <td className="px-3 py-4">
                            {cache ? <StatusBadge kind={(cache as "MEM" | "HIT" | "STALE" | "MISS") ?? "MEM"} dot /> : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                onClick={() => copyLink(l.slug)}
                                title="Copiar"
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                              >
                                {copiedSlug === l.slug ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => handleDuplicate(l)}
                                title="Duplicar"
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                              >
                                <Files className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setEditing(l)}
                                title="Editar"
                                className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11.5px] font-semibold text-primary transition-all hover:bg-primary/20 hover:border-primary/60 hover:shadow-[0_0_12px_-2px_rgba(163,230,53,0.55)]"
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
                                <DropdownMenuTrigger className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground outline-none">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem onClick={() => window.open(`/${l.slug}`, "_blank")}>
                                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setActive(l, !l.active)}>
                                    <Switch checked={l.active} className="pointer-events-none scale-75 -ml-1" />
                                    {l.active ? "Pausar" : "Ativar"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setMode(l, "real")}>
                                    <span className="h-2 w-2 rounded-full bg-primary" /> Modo: Real
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setMode(l, "waiting")}>
                                    <span className="h-2 w-2 rounded-full bg-[#A78BFA]" /> Modo: Espera
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleDelete(l)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <button
                                onClick={() => handleDelete(l)}
                                title="Excluir"
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t border-border px-5 py-3 text-[12px]">
                <div className="text-muted-foreground">
                  Mostrando {(page - 1) * pageSize + 1} a {Math.min(page * pageSize, filtered.length)} de {filtered.length} links
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={cn(
                        "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[11.5px] font-semibold",
                        page === n ? "border border-primary/40 bg-primary/10 text-primary" : "border border-border bg-secondary text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                  {totalPages > 4 && <span className="px-1 text-muted-foreground">…</span>}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Bottom analytics row */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Distribuição */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold tracking-tight">Distribuição de Cliques</h3>
              <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground">{PERIOD_SHORT[period]}</span>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div className="h-[170px] w-[170px] shrink-0 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distribution} dataKey="value" innerRadius={55} outerRadius={78} paddingAngle={2} stroke="none">
                      {distribution.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[22px] font-semibold tabular-nums leading-none">{distribution.reduce((a, b) => a + b.value, 0)}</span>
                  <span className="mt-0.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">Total</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {distribution.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                      <span className="font-medium">{d.name}</span>
                    </div>
                    <div className="tabular-nums text-muted-foreground">
                      {d.value} <span className="opacity-70">({(d.pct * 100).toFixed(1)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Latência por Período */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold tracking-tight">Latência por Período</h3>
              <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground">{PERIOD_SHORT[period]}</span>
            </div>
            <div className="mt-4 h-[170px] -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={latencySeries}>
                  <defs>
                    <linearGradient id="lat-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#A3E635" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#A3E635" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1B2029" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="t" tickLine={false} axisLine={false} tick={{ fill: "#7E8794", fontSize: 10 }} interval={Math.max(1, Math.floor(latencySeries.length / 6))} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#7E8794", fontSize: 10 }} width={36} />
                  <Tooltip
                    contentStyle={{ background: "#0E1116", border: "1px solid #1B2029", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#F5F7F5" }}
                    formatter={(v: number) => [`${v}ms`, "Latência"]}
                  />
                  <Area type="monotone" dataKey="ms" stroke="#A3E635" strokeWidth={2} fill="url(#lat-fill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status dos Redirecionamentos */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold tracking-tight">Status dos Redirecionamentos</h3>
              <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground">{PERIOD_SHORT[period]}</span>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div className="h-[170px] w-[170px] shrink-0 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Sucesso", value: successStats.ok, color: "#A3E635" },
                        { name: "Falhas", value: Math.max(successStats.fail, successStats.total ? 0 : 1), color: "#F43F5E" },
                      ]}
                      dataKey="value"
                      innerRadius={55}
                      outerRadius={78}
                      paddingAngle={2}
                      stroke="none"
                    >
                      <Cell fill="#A3E635" />
                      <Cell fill="#F43F5E" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[22px] font-semibold tabular-nums leading-none">
                    {successStats.total ? ((successStats.ok / successStats.total) * 100).toFixed(1) : "0.0"}%
                  </span>
                  <span className="mt-0.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">Sucesso</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
                    <span className="font-medium">Sucesso</span>
                  </div>
                  <div className="tabular-nums text-muted-foreground">{successStats.ok} <span className="opacity-70">({successStats.total ? ((successStats.ok / successStats.total) * 100).toFixed(1) : "0.0"}%)</span></div>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-destructive" />
                    <span className="font-medium">Falhas</span>
                  </div>
                  <div className="tabular-nums text-muted-foreground">{successStats.fail} <span className="opacity-70">({successStats.total ? ((successStats.fail / successStats.total) * 100).toFixed(1) : "0.0"}%)</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>



      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Novo link</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ns" className="text-xs">Slug</Label>
              <div className={cn(
                "flex items-center rounded-md border bg-secondary px-2.5 focus-within:border-accent",
                newSlugError ? "border-destructive" : "border-border",
              )}>
                <span className="text-[12.5px] font-mono text-muted-foreground">{origin}/</span>
                <input
                  id="ns"
                  value={newSlug}
                  onChange={(e) => { setNewSlug(e.target.value); if (newSlugError) setNewSlugError(null); }}
                  placeholder="ex: joao, maria, atendente-01"
                  required
                  autoFocus
                  className="flex-1 bg-transparent py-2 font-mono text-[12.5px] outline-none"
                />
              </div>
              {newSlugError ? (
                <p className="text-[11px] font-medium text-destructive">{newSlugError}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Apenas letras minúsculas, números e hífens. O link é criado em modo Espera.</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={creating}>{creating ? "Criando…" : "Criar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Editar /{editing?.slug}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Slug">
                  <Input value={editing.slug} onChange={(e) => persistEditing({ slug: e.target.value })} className="font-mono" />
                </Field>
                <Field label="Nome">
                  <Input value={editing.name ?? ""} onChange={(e) => persistEditing({ name: e.target.value })} placeholder="Opcional" />
                </Field>
              </div>
              <Field label="URL real">
                <Input value={editing.real_url ?? ""} onChange={(e) => persistEditing({ real_url: e.target.value })} placeholder="https://destino.com" />
              </Field>
              <div className="rounded-md border border-border bg-secondary/50 p-3 space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Página de espera</div>
                <div className="grid grid-cols-[80px_1fr] gap-3">
                  <Field label="Ícone">
                    <Input value={editing.page_icon ?? ""} onChange={(e) => persistEditing({ page_icon: e.target.value })} maxLength={4} />
                  </Field>
                  <Field label="Título">
                    <Input value={editing.page_title ?? ""} onChange={(e) => persistEditing({ page_title: e.target.value })} />
                  </Field>
                </div>
                <Field label="Mensagem">
                  <Textarea rows={2} value={editing.page_message ?? ""} onChange={(e) => persistEditing({ page_message: e.target.value })} />
                </Field>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEditing}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
