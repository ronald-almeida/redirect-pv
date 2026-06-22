import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
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
  ChevronDown,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Settings2,
  Search,
  Plus,
  LinkIcon,
  Files,
  LogOut,
  Shield,
} from "lucide-react";
import { LinkAnalytics } from "@/components/LinkAnalytics";
import { type ClickRow, type LinkAgg, aggregate } from "@/lib/analytics";
import {
  customRange,
  formatBrtDate,
  rangeForPreset,
  todayBrtYmd,
  type DateRange,
  type RangePreset,
} from "@/lib/date-range";

const RANGE_LABEL: Record<RangePreset, string> = {
  today: "hoje",
  yesterday: "ontem",
  "7d": "últimos 7 dias",
  "30d": "últimos 30 dias",
  all: "tudo",
  custom: "período personalizado",
};
const rangePresetLabel = (p: RangePreset) => RANGE_LABEL[p] ?? "período";

// Tell the edge cache to drop its copy for this slug so admin edits
// (mode, real_url, owner_only, active, etc.) take effect immediately
// instead of waiting for the 30s TTL.
const purgeEdgeCache = (slug: string) => {
  fetch(`/r/${encodeURIComponent(slug)}`, { method: "DELETE" }).catch(() => {});
};

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "CloakPanel · Links" },
      { name: "description", content: "Gerenciar links de redirecionamento." },
    ],
  }),
  component: AdminPage,
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

const MODE_META: Record<
  Mode,
  { label: string; activeCls: string; dot: string; text: string }
> = {
  real: {
    label: "Real",
    activeCls: "bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/40",
    text: "text-[#22c55e]",
    dot: "bg-[#22c55e]",
  },
  decoy: {
    label: "Isca",
    activeCls: "bg-[#eab308]/15 text-[#eab308] border-[#eab308]/40",
    text: "text-[#eab308]",
    dot: "bg-[#eab308]",
  },
  waiting: {
    label: "Espera",
    activeCls: "bg-muted text-muted-foreground border-border",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
};

function AdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [defaultWaitingUrl, setDefaultWaitingUrl] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [slug, setSlug] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eMessage, setEMessage] = useState("");
  const [eIcon, setEIcon] = useState("");

  const [origin, setOrigin] = useState("");

  const [stats, setStats] = useState<Record<string, LinkAgg>>({});
  const [rangePreset, setRangePreset] = useState<RangePreset>("today");
  const [customStart, setCustomStart] = useState<string>(todayBrtYmd());
  const [customEnd, setCustomEnd] = useState<string>(todayBrtYmd());

  const currentRange: DateRange = useMemo(() => {
    if (rangePreset === "custom") return customRange(customStart, customEnd);
    return rangeForPreset(rangePreset);
  }, [rangePreset, customStart, customEnd]);

  useEffect(() => {
    setOrigin(window.location.origin);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      setChecking(false);
      load();
      loadSettings();
      loadStats();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/login" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // Refetch stats whenever the date range changes.
  useEffect(() => {
    if (!checking) loadStats(currentRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRange.start?.getTime(), currentRange.end?.getTime(), checking]);

  // Auto-refresh at BRT midnight when viewing "today" so counters reset visually.
  useEffect(() => {
    if (rangePreset !== "today") return;
    const now = new Date();
    const tomorrow = rangeForPreset("today", new Date(now.getTime() + 86400_000));
    const msUntil = (tomorrow.start?.getTime() ?? now.getTime()) - now.getTime();
    const t = setTimeout(() => loadStats(rangeForPreset("today")), Math.max(1000, msUntil));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangePreset, stats]);


  // Realtime: live click updates
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("admin-clicks-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "clicks" },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => loadStats(currentRange), 250);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRange.start?.getTime(), currentRange.end?.getTime()]);

  // Realtime: live link updates (speed monitor, click_count, etc.)
  useEffect(() => {
    const channel = supabase
      .channel("admin-links-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "links" },
        (payload) => {
          const next = payload.new as Partial<LinkRow> & { id: string };
          setLinks((prev) =>
            prev.map((l) => (l.id === next.id ? { ...l, ...next } : l)),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("links")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      console.error(error);
      return;
    }
    setLinks((data ?? []) as LinkRow[]);
  };

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("id, default_waiting_url")
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error(error);
      return;
    }
    if (data) {
      setSettingsId(data.id);
      setDefaultWaitingUrl(data.default_waiting_url ?? "");
    }
  };

  const loadStats = async (range: DateRange = currentRange) => {
    // Paginate to avoid silently truncating older clicks for long ranges.
    const PAGE = 1000;
    const MAX_PAGES = 50; // hard cap → up to 50k clicks
    const all: ClickRow[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      let q = supabase
        .from("clicks")
        .select(
          "link_id, mode_at_click, country, device, is_vpn, utm_source, created_at",
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (range.start) q = q.gte("created_at", range.start.toISOString());
      if (range.end) q = q.lt("created_at", range.end.toISOString());
      const { data, error } = await q;
      if (error) {
        console.error(error);
        return;
      }
      const rows = (data ?? []) as ClickRow[];
      all.push(...rows);
      if (rows.length < PAGE) break;
    }
    setStats(aggregate(all));
  };


  const saveSettings = async () => {
    if (!settingsId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("settings")
      .update({ default_waiting_url: defaultWaitingUrl.trim() })
      .eq("id", settingsId);
    setSavingSettings(false);
    if (error) alert(error.message);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    if (!cleanSlug) return;
    const { data, error } = await supabase
      .from("links")
      .insert({ slug: cleanSlug, mode: "waiting" })
      .select()
      .maybeSingle();
    if (error) {
      alert(error.message);
      return;
    }
    setSlug("");
    if (data) setExpanded((p) => ({ ...p, [data.id]: true }));
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este link?")) return;
    const { error } = await supabase.from("links").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    load();
  };

  const handleResetCounters = async (id: string) => {
    if (!confirm("Zerar contadores deste link? (cliques real/isca/espera não serão apagados)")) return;
    const { error } = await supabase.rpc("reset_link_counters", { _link_id: id });
    if (error) {
      alert(error.message);
      return;
    }
    load();
    loadStats();
  };

  const handleRecomputeCounters = async (id: string) => {
    const { error } = await supabase.rpc("recompute_link_counters", { _link_id: id });
    if (error) {
      alert(error.message);
      return;
    }
    load();
  };

  const handleDuplicate = async (l: LinkRow) => {
    const base = l.slug.replace(/-copy(-\d+)?$/, "");
    let candidate = `${base}-copy`;
    const existing = new Set(links.map((x) => x.slug));
    let n = 2;
    while (existing.has(candidate)) {
      candidate = `${base}-copy-${n++}`;
    }
    const { error } = await supabase.from("links").insert({
      slug: candidate,
      name: l.name,
      mode: l.mode,
      real_url: l.real_url,
      decoy_url: l.decoy_url,
      page_title: l.page_title,
      page_message: l.page_message,
      page_icon: l.page_icon,
      active: l.active,
    });
    if (error) {
      alert(error.message);
      return;
    }
    load();
  };

  const updateLink = (id: string, patch: Partial<LinkRow>) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const persistLink = async (l: LinkRow) => {
    const newSlug = l.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    const { error } = await supabase
      .from("links")
      .update({
        slug: newSlug,
        name: l.name?.trim() || null,
        real_url: l.real_url?.trim() || null,
        decoy_url: l.decoy_url?.trim() || null,
        owner_only: l.owner_only,
        owner_ips: l.owner_ips ?? [],
      })
      .eq("id", l.id);
    if (error) {
      alert(error.message);
      load();
      return;
    }
    purgeEdgeCache(newSlug);
    if (newSlug !== l.slug) purgeEdgeCache(l.slug);
  };

  const setMode = async (l: LinkRow, mode: Mode) => {
    updateLink(l.id, { mode });
    const { error } = await supabase
      .from("links")
      .update({ mode })
      .eq("id", l.id);
    if (error) {
      alert(error.message);
      load();
      return;
    }
    purgeEdgeCache(l.slug);
  };

  const setActive = async (l: LinkRow, active: boolean) => {
    updateLink(l.id, { active });
    const { error } = await supabase
      .from("links")
      .update({ active })
      .eq("id", l.id);
    if (error) {
      alert(error.message);
      load();
      return;
    }
    purgeEdgeCache(l.slug);
  };

  const openEdit = (l: LinkRow) => {
    setEditing(l);
    setETitle(l.page_title ?? DEFAULTS.page_title);
    setEMessage(l.page_message ?? DEFAULTS.page_message);
    setEIcon(l.page_icon ?? DEFAULTS.page_icon);
  };

  const handleUpdatePage = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const { error } = await supabase
      .from("links")
      .update({
        page_title: eTitle.trim() || DEFAULTS.page_title,
        page_message: eMessage.trim() || DEFAULTS.page_message,
        page_icon: eIcon.trim() || DEFAULTS.page_icon,
      })
      .eq("id", editing.id);
    if (error) {
      alert(error.message);
      return;
    }
    setEditing(null);
    load();
  };

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${origin}/r/${slug}`);
    setCopiedSlug(slug);
    setTimeout(() => {
      setCopiedSlug((s) => (s === slug ? null : s));
    }, 2000);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return links;
    return links.filter(
      (l) =>
        l.slug.toLowerCase().includes(q) ||
        (l.name ?? "").toLowerCase().includes(q),
    );
  }, [links, search]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (location.pathname !== "/admin") {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-8">
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Shield className="h-4 w-4" />
              </div>
              <span className="text-base font-semibold tracking-tight text-primary">
                CloakPanel
              </span>
            </div>
            <nav className="flex items-center gap-1 text-xs sm:text-sm">
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-foreground bg-secondary sm:px-3"
              >
                <LinkIcon className="h-3.5 w-3.5 sm:hidden" />
                Links
              </Link>
              <Link
                to="/admin/analytics"
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground sm:px-3"
              >
                <span className="hidden sm:inline">Analytics</span>
                <span className="sm:hidden">Analytics</span>
              </Link>
              <Link
                to="/admin/latency"
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground sm:px-3"
              >
                <span className="hidden sm:inline">Latência</span>
                <span className="sm:hidden">Latência</span>
              </Link>
            </nav>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="gap-2 px-2 sm:px-3"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>


      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:space-y-5 sm:px-6 sm:py-8">
        {/* Global settings collapsible */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/40 sm:px-5 sm:py-3.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium">Configurações Globais</span>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${settingsOpen ? "rotate-180" : ""}`}
            />
          </button>
          {settingsOpen && (
            <div className="border-t border-border px-4 py-4 animate-fade-in sm:px-5">
              <Label
                htmlFor="default-waiting-url"
                className="mb-1.5 block text-xs text-muted-foreground"
              >
                Link padrão de espera
              </Label>
              <Input
                id="default-waiting-url"
                type="url"
                placeholder="https://exemplo.com"
                value={defaultWaitingUrl}
                onChange={(e) => setDefaultWaitingUrl(e.target.value)}
                onBlur={saveSettings}
                disabled={!settingsId || savingSettings}
                className="bg-background"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {savingSettings
                  ? "Salvando…"
                  : "Salva automaticamente ao clicar fora do campo."}
              </p>
            </div>
          )}
        </div>


        {/* Date range filter */}
        <DateRangeBar
          preset={rangePreset}
          onPreset={setRangePreset}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStart={setCustomStart}
          onCustomEnd={setCustomEnd}
          range={currentRange}
        />

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-card pl-9"
            />
          </div>
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              placeholder="novo-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="bg-card sm:w-56"
              required
            />
            <Button type="submit" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </form>
        </div>

        {/* Links list */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : links.length === 0 ? (
          <EmptyState onCreate={() => document.querySelector<HTMLInputElement>('input[placeholder="novo-slug"]')?.focus()} />
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhum link encontrado para “{search}”.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((l) => {
              const mode = (l.mode as Mode) ?? "waiting";
              const meta = MODE_META[mode];
              const isOpen = expanded[l.id] ?? false;
              const s = stats[l.id];
              return (
                <div
                  key={l.id}
                  className={`group overflow-hidden rounded-xl border bg-card shadow-sm transition-colors ${l.active ? "border-border" : "border-border/60 opacity-70"}`}
                >
                  {/* Card header */}
                  <div className="px-4 py-3.5 sm:px-5 sm:py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {/* Identity */}
                      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                        <button
                          type="button"
                          onClick={() => setExpanded((p) => ({ ...p, [l.id]: !isOpen }))}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                          title={isOpen ? "Recolher" : "Expandir"}
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold leading-tight sm:text-base">
                            {l.name?.trim() || `/${l.slug}`}
                          </div>
                          {l.name?.trim() && (
                            <div className="truncate font-mono text-[11px] text-muted-foreground sm:text-xs">
                              /{l.slug}
                            </div>
                          )}
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.activeCls}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </div>

                      {/* Controls */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex items-center justify-between gap-2 sm:justify-start">
                          <ModePills l={l} onChange={(m) => setMode(l, m)} />
                          <div className="flex items-center gap-2 sm:border-l sm:border-border sm:pl-3">
                            <span className="hidden text-xs text-muted-foreground sm:inline">
                              {l.active ? "Ativo" : "Inativo"}
                            </span>
                            <Switch
                              checked={l.active}
                              onCheckedChange={(v) => setActive(l, v)}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-1">
                          <div className="relative flex items-center">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => copyLink(l.slug)}
                              title="Copiar link"
                              className="h-8 w-8 sm:h-9 sm:w-9"
                            >
                              {copiedSlug === l.slug ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            {copiedSlug === l.slug && (
                              <span className="absolute left-full ml-2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background">
                                Link copiado!
                              </span>
                            )}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            asChild
                            title="Abrir"
                            className="h-8 w-8 sm:h-9 sm:w-9"
                          >
                            <a href={`/r/${l.slug}`} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDuplicate(l)}
                            title="Duplicar"
                            className="h-8 w-8 sm:h-9 sm:w-9"
                          >
                            <Files className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(l)}
                            title="Editar página de espera"
                            className="h-8 w-8 sm:h-9 sm:w-9"
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(l.id)}
                            title="Remover"
                            className="h-8 w-8 text-muted-foreground hover:text-[#ef4444] sm:h-9 sm:w-9"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>


                  {/* Stats strip (always visible) */}
                  <div className="grid grid-cols-3 gap-px border-t border-border bg-border">
                    <StatCell label="Cliques real" value={s?.real ?? 0} mode="real" />
                    <StatCell label="Cliques isca" value={s?.decoy ?? 0} mode="decoy" />
                    <StatCell label="Cliques espera" value={s?.waiting ?? 0} mode="waiting" />
                  </div>

                  {/* Redirect speed monitor */}
                  <SpeedMonitor
                    last={l.last_redirect_ms ?? 0}
                    avg={l.avg_redirect_ms ?? 0}
                    total={s?.total ?? 0}
                    totalAllTime={l.total_redirects ?? 0}
                    rangeLabel={rangePresetLabel(rangePreset)}
                    onReset={() => handleResetCounters(l.id)}
                    onRecompute={() => handleRecomputeCounters(l.id)}
                  />


                  {/* Expanded body */}
                  {isOpen && (
                    <div className="border-t border-border px-4 py-4 animate-fade-in sm:px-5 sm:py-5">
                      <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
                        <div className="space-y-4">
                          <Field label="Nome do link">
                            <Input
                              placeholder="Nome do link (ex: Oferta Black Friday)"
                              value={l.name ?? ""}
                              onChange={(e) =>
                                updateLink(l.id, { name: e.target.value })
                              }
                              onBlur={() => persistLink(l)}
                              className="bg-background"
                            />
                          </Field>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Slug">
                              <Input
                                value={l.slug}
                                onChange={(e) =>
                                  updateLink(l.id, { slug: e.target.value })
                                }
                                onBlur={() => persistLink(l)}
                                className="bg-background font-mono"
                              />
                            </Field>
                            <Field label="URL completa">
                              <button
                                type="button"
                                onClick={() => copyLink(l.slug)}
                                className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm hover:bg-secondary"
                              >
                                <span className="truncate text-muted-foreground">
                                  {origin}/r/{l.slug}
                                </span>
                                <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              </button>
                            </Field>
                          </div>
                          <Field label="Link real">
                            <Input
                              type="url"
                              placeholder="https://destino-real.com"
                              value={l.real_url ?? ""}
                              onChange={(e) =>
                                updateLink(l.id, { real_url: e.target.value })
                              }
                              onBlur={() => persistLink(l)}
                              className="bg-background"
                            />
                          </Field>
                          <Field label="Link isca">
                            <Input
                              type="url"
                              placeholder="https://site-isca.com"
                              value={l.decoy_url ?? ""}
                              onChange={(e) =>
                                updateLink(l.id, { decoy_url: e.target.value })
                              }
                              onBlur={() => persistLink(l)}
                              className="bg-background"
                            />
                          </Field>

                          <div className="rounded-md border border-border bg-background/40 p-3 space-y-3 sm:p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium">Somente eu</div>
                                <div className="text-xs text-muted-foreground">
                                  Apenas IPs autorizados acessam o link real. Outros vão para a isca.
                                </div>
                              </div>
                              <Switch
                                checked={!!l.owner_only}
                                onCheckedChange={async (v) => {
                                  updateLink(l.id, { owner_only: v });
                                  const { error } = await supabase
                                    .from("links")
                                    .update({ owner_only: v })
                                    .eq("id", l.id);
                                  if (error) {
                                    alert(error.message);
                                    load();
                                    return;
                                  }
                                  purgeEdgeCache(l.slug);
                                }}
                              />
                            </div>

                            {l.owner_only && (
                              <div className="space-y-2">
                                <Label className="text-xs">Meus IPs autorizados</Label>
                                <Input
                                  placeholder="Ex: 187.45.10.2, 2804:abc::1"
                                  value={(l.owner_ips ?? []).join(", ")}
                                  onChange={(e) =>
                                    updateLink(l.id, {
                                      owner_ips: e.target.value
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                  onBlur={() => persistLink(l)}
                                  className="bg-background font-mono text-xs"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={async () => {
                                    try {
                                      const r = await fetch("https://api.ipify.org?format=json");
                                      const j = await r.json();
                                      const ip = String(j.ip || "").trim();
                                      if (!ip) return;
                                      const current = l.owner_ips ?? [];
                                      if (current.includes(ip)) return;
                                      const next = [...current, ip];
                                      updateLink(l.id, { owner_ips: next });
                                      const { error } = await supabase
                                        .from("links")
                                        .update({ owner_ips: next })
                                        .eq("id", l.id);
                                      if (error) {
                                        alert(error.message);
                                        load();
                                        return;
                                      }
                                      purgeEdgeCache(l.slug);
                                    } catch {
                                      alert("Não foi possível detectar seu IP.");
                                    }
                                  }}
                                >
                                  Adicionar meu IP atual
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-2 lg:w-44">
                          <div className="rounded-lg bg-white p-2">
                            <QRCodeSVG
                              value={`${origin}/r/${l.slug}`}
                              size={140}
                              level="M"
                              className="h-28 w-28 sm:h-36 sm:w-36"
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            QR do redirect
                          </span>
                        </div>
                      </div>


                      <LinkAnalytics agg={s} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Página de espera · /{editing?.slug}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdatePage} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[80px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="e-icon">Ícone</Label>
                <Input
                  id="e-icon"
                  value={eIcon}
                  onChange={(e) => setEIcon(e.target.value)}
                  maxLength={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-title">Título</Label>
                <Input
                  id="e-title"
                  value={eTitle}
                  onChange={(e) => setETitle(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-msg">Mensagem</Label>
              <Textarea
                id="e-msg"
                rows={3}
                value={eMessage}
                onChange={(e) => setEMessage(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ModePills({
  l,
  onChange,
}: {
  l: LinkRow;
  onChange: (m: Mode) => void;
}) {
  const current = (l.mode as Mode) ?? "waiting";
  return (
    <div className="flex flex-wrap rounded-full border border-border bg-background p-0.5">
      {(["real", "decoy", "waiting"] as Mode[]).map((m) => {
        const active = current === m;
        const meta = MODE_META[m];
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`rounded-full px-2 py-1 text-[11px] font-medium transition-all sm:px-3 sm:text-xs ${
              active
                ? meta.activeCls
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

function StatCell({
  label,
  value,
  mode,
}: {
  label: string;
  value: number;
  mode: Mode;
}) {
  const meta = MODE_META[mode];
  return (
    <div className="bg-card px-2 py-2 sm:px-4 sm:py-2.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground sm:gap-1.5 sm:text-[10px]">
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${meta.text}`}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <LinkIcon className="h-7 w-7" />
      </div>
      <h3 className="mt-5 text-base font-semibold">Nenhum link criado ainda</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Crie seu primeiro link para começar a redirecionar tráfego.
      </p>
      <Button onClick={onCreate} className="mt-5 gap-1.5">
        <Plus className="h-4 w-4" />
        Criar primeiro link
      </Button>
    </div>
  );
}

// Redirect speed monitor row. Color-codes the "Último" value:
//   green  < 500ms
//   yellow 500-1500ms
//   red    > 1500ms
function speedColor(ms: number): string {
  if (!ms) return "#9ca3af";
  if (ms < 500) return "#22c55e";
  if (ms <= 1500) return "#eab308";
  return "#ef4444";
}

function SpeedMonitor({
  last,
  avg,
  total,
  totalAllTime,
  rangeLabel,
  onReset,
  onRecompute,
}: {
  last: number;
  avg: number;
  total: number;
  totalAllTime: number;
  rangeLabel: string;
  onReset?: () => void;
  onRecompute?: () => void;
}) {
  const hasData = last > 0;
  return (
    <div className="flex flex-col gap-2 border-t border-border bg-card/50 px-4 py-3 text-xs sm:flex-row sm:items-center sm:gap-x-5 sm:px-5 sm:py-2.5">
      <span className="font-semibold" style={{ color: speedColor(last) }}>
        ⚡ Velocidade de Redirect
      </span>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:flex sm:flex-wrap sm:items-center">
        <span className="text-muted-foreground">
          Último:{" "}
          {hasData ? (
            <span
              className="font-semibold tabular-nums"
              style={{ color: speedColor(last) }}
            >
              {last}ms
            </span>
          ) : (
            <span className="italic">Sem dados ainda</span>
          )}
        </span>
        <span className="text-muted-foreground">
          Média:{" "}
          <span
            className="font-semibold tabular-nums"
            style={{ color: speedColor(avg) }}
          >
            {avg}ms
          </span>
        </span>
        <span
          className="col-span-2 text-muted-foreground"
          title="Cliques contabilizados no período selecionado (real + isca + espera). Bots, prefetch e duplicados são ignorados."
        >
          Cliques no período ({rangeLabel}):{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {total}
          </span>
        </span>
        <span
          className="col-span-2 text-muted-foreground"
          title="Total acumulado desde a criação do link (independente do filtro de data)."
        >
          Total geral:{" "}
          <span className="font-semibold tabular-nums text-foreground/80">
            {totalAllTime}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-1 sm:ml-auto">
        {onRecompute && (
          <button
            type="button"
            onClick={onRecompute}
            className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Recalcular contadores a partir do histórico de cliques"
          >
            Recalcular
          </button>
        )}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-[#ef4444]/10 hover:text-[#ef4444] hover:border-[#ef4444]/40"
            title="Zerar contadores deste link"
          >
            Resetar contadores
          </button>
        )}
      </div>
    </div>
  );
}

function DateRangeBar({
  preset,
  onPreset,
  customStart,
  customEnd,
  onCustomStart,
  onCustomEnd,
  range,
}: {
  preset: RangePreset;
  onPreset: (p: RangePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStart: (s: string) => void;
  onCustomEnd: (s: string) => void;
  range: DateRange;
}) {
  const presets: { id: RangePreset; label: string }[] = [
    { id: "today", label: "Hoje" },
    { id: "yesterday", label: "Ontem" },
    { id: "7d", label: "7 dias" },
    { id: "30d", label: "30 dias" },
    { id: "all", label: "Tudo" },
    { id: "custom", label: "Personalizado" },
  ];
  const summary = (() => {
    if (preset === "all") return "Todos os cliques registrados";
    if (range.start && range.end)
      return `${formatBrtDate(range.start)} → ${formatBrtDate(new Date(range.end.getTime() - 1))} (BRT)`;
    if (range.start) return `Desde ${formatBrtDate(range.start)} (BRT)`;
    return "—";
  })();
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Período
        </span>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPreset(p.id)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => onCustomStart(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => onCustomEnd(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            />
          </div>
        )}
        <span className="text-xs text-muted-foreground sm:ml-auto">{summary}</span>
      </div>
    </div>
  );
}
