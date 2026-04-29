import { createFileRoute, useNavigate } from "@tanstack/react-router";
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

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin · Links" },
      { name: "description", content: "Manage redirect links." },
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
  page_title: "Link coming soon",
  page_message: "This link is being set up. Check back soon.",
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
    label: "Decoy",
    classes:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
    dot: "bg-amber-500",
  },
  waiting: {
    label: "Waiting",
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

  // global settings
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [defaultWaitingUrl, setDefaultWaitingUrl] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  // create form
  const [slug, setSlug] = useState("");

  // page-content edit dialog
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eMessage, setEMessage] = useState("");
  const [eIcon, setEIcon] = useState("");

  const [origin, setOrigin] = useState("");

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
    if (!confirm("Delete this link?")) return;
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
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold">Link admin</h1>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <Card className="p-6">
          <h2 className="mb-1 text-base font-medium">Global settings</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            URL where users in <span className="font-medium">Waiting</span> mode are redirected.
          </p>
          <div className="space-y-2">
            <Label htmlFor="default-waiting-url">Default waiting URL</Label>
            <Input
              id="default-waiting-url"
              type="url"
              placeholder="https://example.com"
              value={defaultWaitingUrl}
              onChange={(e) => setDefaultWaitingUrl(e.target.value)}
              onBlur={saveSettings}
              disabled={!settingsId || savingSettings}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Save className="h-3 w-3" />
              {savingSettings ? "Saving…" : "Saves automatically when you click outside the field."}
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-medium">Create new link</h2>
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                placeholder="my-link"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
            </div>
            <Button type="submit">Create</Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            New links start in <span className="font-medium">Waiting</span> mode.
          </p>
        </Card>

        <div className="space-y-4">
          <h2 className="text-base font-medium">All links</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : links.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">No links yet.</p>
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
                        title="Copy link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" asChild title="Open">
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
                        title="Edit waiting page"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(l.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
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

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Real URL</Label>
                      <div className="flex gap-2">
                        <Input
                          type="url"
                          placeholder="https://real-destination.com"
                          value={l.real_url ?? ""}
                          onChange={(e) =>
                            updateLink(l.id, { real_url: e.target.value })
                          }
                          onBlur={() => persistLink(l)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Decoy URL</Label>
                      <Input
                        type="url"
                        placeholder="https://decoy-site.com"
                        value={l.decoy_url ?? ""}
                        onChange={(e) =>
                          updateLink(l.id, { decoy_url: e.target.value })
                        }
                        onBlur={() => persistLink(l)}
                      />
                    </div>
                  </div>

                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Save className="h-3 w-3" />
                    Changes save when you click outside a field.
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
            <DialogTitle>Waiting page · /{editing?.slug}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdatePage} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[80px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="e-icon">Icon</Label>
                <Input
                  id="e-icon"
                  value={eIcon}
                  onChange={(e) => setEIcon(e.target.value)}
                  maxLength={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-title">Title</Label>
                <Input
                  id="e-title"
                  value={eTitle}
                  onChange={(e) => setETitle(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-msg">Message</Label>
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
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
