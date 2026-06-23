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
  MousePointerClick, Activity, Link2, ShieldCheck, BarChart3,
} from "lucide-react";
import { type ClickRow, type LinkAgg, aggregate } from "@/lib/analytics";
import { rangeForPreset, type DateRange } from "@/lib/date-range";
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

const purgeEdgeCache = (slug: string) => {
  fetch(`/r/${encodeURIComponent(slug)}`, { method: "DELETE" }).catch(() => {});
};

function periodToRange(p: AdminPeriod): DateRange {
  if (p === "24h") return rangeForPreset("today");
  if (p === "7d") return rangeForPreset("7d");
  if (p === "30d") return rangeForPreset("30d");
  // 90d → return start ~90 days ago
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 90);
  return { start, end, preset: "custom" };
}

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
  const [period, setPeriod] = useState<AdminPeriod>("7d");
  const [createOpen, setCreateOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [origin, setOrigin] = useState("");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState<LinkRow | null>(null);

  const range = useMemo(() => periodToRange(period), [period]);

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
    if (range.start && range.end) {
      const start = range.start.getTime();
      const span = range.end.getTime() - start;
      for (const c of clicks as (ClickRow & { redirect_ms?: number | null })[]) {
        const ms = (c as { redirect_ms?: number | null }).redirect_ms;
        if (!ms || !span) continue;
        const t = new Date(c.created_at).getTime();
        if (t < start || t >= range.end.getTime()) continue;
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
    if (!q) return links;
    return links.filter((l) => l.slug.toLowerCase().includes(q) || (l.name ?? "").toLowerCase().includes(q));
  }, [links, search]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const slug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    if (!slug) return;
    const { error } = await supabase.from("links").insert({ slug, mode: "waiting" });
    if (error) { alert(error.message); return; }
    setNewSlug("");
    setCreateOpen(false);
    void loadLinks();
  };

  const handleDelete = async (l: LinkRow) => {
    if (!confirm(`Excluir /${l.slug}?`)) return;
    await supabase.from("links").delete().eq("id", l.id);
    purgeEdgeCache(l.slug);
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
    navigator.clipboard.writeText(`${origin}/r/${slug}`);
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
    const newSlug = editing.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    const { error } = await supabase.from("links").update({
      slug: newSlug,
      name: editing.name?.trim() || null,
      real_url: editing.real_url?.trim() || null,
      decoy_url: editing.decoy_url?.trim() || null,
      page_title: editing.page_title?.trim() || DEFAULTS.page_title,
      page_message: editing.page_message?.trim() || DEFAULTS.page_message,
      page_icon: editing.page_icon?.trim() || DEFAULTS.page_icon,
    }).eq("id", editing.id);
    if (error) { alert(error.message); return; }
    purgeEdgeCache(newSlug);
    setEditing(null);
    void loadLinks();
  };

  return (
    <AdminShell
      search={search}
      onSearch={setSearch}
      period={period}
      onPeriod={setPeriod}
      rightSlot={
        <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Novo link
        </Button>
      }
    >
      <div className="px-4 md:px-6 py-6 space-y-6">
        {/* Metrics */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Total de cliques"
            value={metrics.totalClicks.toLocaleString("pt-BR")}
            icon={MousePointerClick}
            series={metrics.totalSpark}
            accent="indigo"
          />
          <MetricCard
            label="Latência média"
            value={metrics.avgLatency || 0}
            suffix="ms"
            icon={Activity}
            series={metrics.latSpark}
            accent={metrics.avgLatency < 80 ? "success" : metrics.avgLatency < 200 ? "warning" : "danger"}
          />
          <MetricCard
            label="Slugs ativos"
            value={metrics.activeSlugs}
            icon={Link2}
            accent="default"
            suffix={`/ ${links.length}`}
          />
          <MetricCard
            label="Taxa de sucesso"
            value={`${metrics.success.toFixed(1)}%`}
            icon={ShieldCheck}
            accent={metrics.success >= 95 ? "success" : metrics.success >= 80 ? "warning" : "danger"}
          />
        </section>

        {/* Links Table */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-[13px] font-semibold tracking-tight">Links</h2>
              <p className="text-[11px] text-muted-foreground">{filtered.length} {filtered.length === 1 ? "link" : "links"}</p>
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
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-border text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Link</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Tipo</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Cliques</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Última</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Média</th>
                    <th className="px-3 py-2.5 font-semibold">Último acesso</th>
                    <th className="px-3 py-2.5 font-semibold">Cache</th>
                    <th className="px-3 py-2.5 font-semibold w-px"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => {
                    const s: LinkAgg | undefined = stats[l.id];
                    const lastClick = s?.recent?.[0]?.created_at;
                    const last = l.last_redirect_ms ?? 0;
                    const avg = l.avg_redirect_ms ?? 0;
                    const cache = latencyByCache[l.id];
                    const mode = (l.mode as Mode) ?? "waiting";
                    const status: "active" | "paused" | "waiting" =
                      !l.active ? "paused" : mode === "waiting" ? "waiting" : "active";
                    return (
                      <tr key={l.id} className="group border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-mono text-[12.5px] font-medium text-foreground">/{l.slug}</span>
                            <span className="text-[11px] text-muted-foreground truncate max-w-[260px]">
                              {l.name?.trim() || l.real_url || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge kind={status} label={status === "active" ? "Ativo" : status === "paused" ? "Pausado" : "Espera"} dot />
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge kind={mode === "real" ? "real" : mode === "decoy" ? "decoy" : "waiting"} label={mode === "real" ? "Real" : mode === "decoy" ? "Isca" : "Espera"} />
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium">{s?.total ?? 0}</td>
                        <td className={cn("px-3 py-3 text-right tabular-nums", last === 0 ? "text-muted-foreground" : last < 100 ? "text-[--success]" : last < 300 ? "text-warning" : "text-destructive")}>
                          {last ? `${last}ms` : "—"}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{avg ? `${avg}ms` : "—"}</td>
                        <td className="px-3 py-3 text-muted-foreground">{formatRel(lastClick)}</td>
                        <td className="px-3 py-3">
                          {cache ? <StatusBadge kind={(cache as "MEM" | "HIT" | "STALE" | "MISS") ?? "MEM"} /> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => copyLink(l.slug)}
                              title="Copiar"
                              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              {copiedSlug === l.slug ? <Check className="h-3.5 w-3.5 text-[--success]" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                            <a
                              href={`/r/${l.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir"
                              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <DropdownMenu>
                              <DropdownMenuTrigger className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground outline-none">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => setEditing(l)}>
                                  <Settings2 className="h-3.5 w-3.5" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDuplicate(l)}>
                                  <Files className="h-3.5 w-3.5" /> Duplicar
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to="/admin/analytics">
                                    <BarChart3 className="h-3.5 w-3.5" /> Analytics
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setActive(l, !l.active)}>
                                  <Switch checked={l.active} className="pointer-events-none scale-75 -ml-1" />
                                  {l.active ? "Pausar" : "Ativar"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setMode(l, "real")}>
                                  <span className="h-2 w-2 rounded-full bg-[--success]" /> Modo: Real
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setMode(l, "decoy")}>
                                  <span className="h-2 w-2 rounded-full bg-warning" /> Modo: Isca
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setMode(l, "waiting")}>
                                  <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Modo: Espera
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleDelete(l)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
              <div className="flex items-center rounded-md border border-border bg-secondary px-2.5 focus-within:border-accent">
                <span className="text-[12.5px] font-mono text-muted-foreground">{origin}/r/</span>
                <input
                  id="ns"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="meu-link"
                  required
                  autoFocus
                  className="flex-1 bg-transparent py-2 font-mono text-[12.5px] outline-none"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">O link é criado em modo Espera. Configure o destino depois.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit">Criar</Button>
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
              <Field label="URL isca">
                <Input value={editing.decoy_url ?? ""} onChange={(e) => persistEditing({ decoy_url: e.target.value })} placeholder="https://isca.com" />
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
