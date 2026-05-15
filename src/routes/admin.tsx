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
          timer = setTimeout(() => loadStats(), 250);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
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

  const loadStats = async () => {
    const { data, error } = await supabase
      .from("clicks")
      .select(
        "link_id, mode_at_click, country, device, is_vpn, utm_source, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      console.error(error);
      return;
    }
    setStats(aggregate((data ?? []) as ClickRow[]));
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
    const { error } = await supabase
      .from("links")
      .update({
        slug: l.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, ""),
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
    }
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
    }
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

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${origin}/r/${slug}`);
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
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Shield className="h-4 w-4" />
              </div>
              <span className="text-base font-semibold tracking-tight">
                CloakPanel
              </span>
            </div>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                to="/admin"
                className="rounded-md px-3 py-1.5 font-medium text-foreground bg-secondary"
              >
                Links
              </Link>
              <Link
                to="/admin/analytics"
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Analytics
              </Link>
            </nav>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-6 py-8">
        {/* Global settings collapsible */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-secondary/40"
          >
            <div className="flex items-center gap-2.5">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Configurações Globais</span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${settingsOpen ? "rotate-180" : ""}`}
            />
          </button>
          {settingsOpen && (
            <div className="border-t border-border px-5 py-4 animate-fade-in">
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

        {/* Search + create */}
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
                  className={`overflow-hidden rounded-xl border bg-card transition-colors ${l.active ? "border-border" : "border-border/60 opacity-70"}`}
                >
                  {/* Collapsed header row */}
                  <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [l.id]: !isOpen }))}
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                      title={isOpen ? "Recolher" : "Expandir"}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold leading-tight">
                          {l.name?.trim() || `/${l.slug}`}
                        </div>
                        {l.name?.trim() && (
                          <div className="truncate font-mono text-xs text-muted-foreground">
                            /{l.slug}
                          </div>
                        )}
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.activeCls}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>

                    <ModePills l={l} onChange={(m) => setMode(l, m)} />

                    <div className="flex items-center gap-2 pl-2">
                      <span className="text-xs text-muted-foreground">
                        {l.active ? "Ativo" : "Inativo"}
                      </span>
                      <Switch
                        checked={l.active}
                        onCheckedChange={(v) => setActive(l, v)}
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyLink(l.slug)}
                        title="Copiar link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" asChild title="Abrir">
                        <a href={`/r/${l.slug}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDuplicate(l)}
                        title="Duplicar"
                      >
                        <Files className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(l)}
                        title="Editar página de espera"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(l.id)}
                        title="Remover"
                        className="text-muted-foreground hover:text-[#ef4444]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Stats strip (always visible) */}
                  <div className="grid grid-cols-3 gap-px border-t border-border bg-border">
                    <StatCell label="Cliques real" value={s?.real ?? 0} mode="real" />
                    <StatCell label="Cliques isca" value={s?.decoy ?? 0} mode="decoy" />
                    <StatCell label="Cliques espera" value={s?.waiting ?? 0} mode="waiting" />
                  </div>

                  {/* Expanded body */}
                  {isOpen && (
                    <div className="border-t border-border px-5 py-5 animate-fade-in">
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

                          <div className="rounded-md border border-border bg-background/40 p-3 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
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
                                  }
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
                                      }
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
                          <div className="rounded-lg bg-white p-2.5">
                            <QRCodeSVG
                              value={`${origin}/r/${l.slug}`}
                              size={140}
                              level="M"
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
    <div className="inline-flex rounded-full border border-border bg-background p-0.5">
      {(["real", "decoy", "waiting"] as Mode[]).map((m) => {
        const active = current === m;
        const meta = MODE_META[m];
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
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
    <div className="bg-card px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${meta.text}`}>
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
