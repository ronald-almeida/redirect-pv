import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Trash2, ExternalLink, Save, Settings2 } from "lucide-react";
import { LinkAnalytics } from "@/components/LinkAnalytics";
import {
  type ClickRow,
  type LinkAgg,
  aggregate,
} from "@/lib/analytics";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin · Links" },
      { name: "description", content: "Gerenciar links de redirecionamento." },
    ],
  }),
  component: AdminPage,
});

type Mode = "real" | "decoy" | "waiting";

interface LinkRow {
  id: string;
  slug: string;
  mode: string;
  real_url: string | null;
  decoy_url: string | null;
  page_title: string | null;
  page_message: string | null;
  page_icon: string | null;
  created_at: string;
}

const DEFAULTS = {
  page_title: "Link em breve",
  page_message: "Este link está sendo configurado. Volte em breve.",
  page_icon: "⏳",
};

const MODE_META: Record<Mode, { label: string; classes: string; dot: string }> = {
  real: {
    label: "Real",
    classes:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
    dot: "bg-emerald-500",
  },
  decoy: {
    label: "Isca",
    classes:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
    dot: "bg-amber-500",
  },
  waiting: {
    label: "Espera",
    classes:
      "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/60",
  },
};

function AdminPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [defaultWaitingUrl, setDefaultWaitingUrl] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const [slug, setSlug] = useState("");

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
    const { error } = await supabase.from("links").insert({
      slug: cleanSlug,
      mode: "waiting",
    });
    if (error) {
      alert(error.message);
      return;
    }
    setSlug("");
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

  const updateLink = (id: string, patch: Partial<LinkRow>) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const persistLink = async (l: LinkRow) => {
    const { error } = await supabase
      .from("links")
      .update({
        slug: l.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, ""),
        mode: l.mode,
        real_url: l.real_url?.trim() || null,
        decoy_url: l.decoy_url?.trim() || null,
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

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold">Painel de links</h1>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <Card className="p-6">
          <h2 className="mb-1 text-base font-medium">Configurações Globais</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            URL para onde os usuários em modo <span className="font-medium">Espera</span> são redirecionados.
          </p>
          <div className="space-y-2">
            <Label htmlFor="default-waiting-url">Link padrão de espera</Label>
            <Input
              id="default-waiting-url"
              type="url"
              placeholder="https://exemplo.com"
              value={defaultWaitingUrl}
              onChange={(e) => setDefaultWaitingUrl(e.target.value)}
              onBlur={saveSettings}
              disabled={!settingsId || savingSettings}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Save className="h-3 w-3" />
              {savingSettings ? "Salvando…" : "Salva automaticamente ao clicar fora do campo."}
            </p>
          </div>
        </Card>

        {(() => {
          const totals = Object.values(stats).reduce(
            (acc, s) => ({
              real: acc.real + s.real,
              decoy: acc.decoy + s.decoy,
              waiting: acc.waiting + s.waiting,
            }),
            { real: 0, decoy: 0, waiting: 0 },
          );
          return (
            <Card className="p-6">
              <h2 className="mb-4 text-base font-medium">Resumo de cliques</h2>
              <div className="grid grid-cols-3 gap-3">
                <StatBox label="Total real" value={totals.real} mode="real" />
                <StatBox label="Total isca" value={totals.decoy} mode="decoy" />
                <StatBox label="Total espera" value={totals.waiting} mode="waiting" />
              </div>
            </Card>
          );
        })()}

        <Card className="p-6">
          <h2 className="mb-4 text-base font-medium">Adicionar link</h2>
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                placeholder="meu-link"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
            </div>
            <Button type="submit">Adicionar link</Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Novos links começam no modo <span className="font-medium">Espera</span>.
          </p>
        </Card>

        <div className="space-y-4">
          <h2 className="text-base font-medium">Todos os links</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : links.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">Nenhum link ainda.</p>
            </Card>
          ) : (
            links.map((l) => {
              const mode = (l.mode as Mode) ?? "waiting";
              const meta = MODE_META[mode];
              return (
                <Card key={l.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Input
                        value={l.slug}
                        onChange={(e) =>
                          updateLink(l.id, { slug: e.target.value })
                        }
                        onBlur={() => persistLink(l)}
                        className="h-8 w-44 font-mono text-sm"
                      />
                      <Badge
                        variant="outline"
                        className={`gap-1.5 ${meta.classes}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}
                        />
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyLink(l.slug)}
                        title="Copiar link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" asChild title="Abrir">
                        <a
                          href={`/r/${l.slug}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
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
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Label className="mb-2 block text-xs">Modo</Label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(["real", "decoy", "waiting"] as Mode[]).map((m) => {
                        const active = mode === m;
                        const mm = MODE_META[m];
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setMode(l, m)}
                            className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                              active
                                ? mm.classes + " font-medium"
                                : "bg-background hover:bg-muted/50"
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full ${mm.dot}`} />
                            {mm.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Link real</Label>
                      <div className="flex gap-2">
                        <Input
                          type="url"
                          placeholder="https://destino-real.com"
                          value={l.real_url ?? ""}
                          onChange={(e) =>
                            updateLink(l.id, { real_url: e.target.value })
                          }
                          onBlur={() => persistLink(l)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Link isca</Label>
                      <Input
                        type="url"
                        placeholder="https://site-isca.com"
                        value={l.decoy_url ?? ""}
                        onChange={(e) =>
                          updateLink(l.id, { decoy_url: e.target.value })
                        }
                        onBlur={() => persistLink(l)}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <StatBox label="Cliques real" value={stats[l.id]?.real ?? 0} mode="real" />
                    <StatBox label="Cliques isca" value={stats[l.id]?.decoy ?? 0} mode="decoy" />
                    <StatBox label="Cliques espera" value={stats[l.id]?.waiting ?? 0} mode="waiting" />
                  </div>

                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Save className="h-3 w-3" />
                    As alterações são salvas ao clicar fora do campo.
                  </p>
                </Card>
              );
            })
          )}
        </div>
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

function StatBox({
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
    <div className={`rounded-md border px-3 py-2 ${meta.classes}`}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide opacity-80">
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

