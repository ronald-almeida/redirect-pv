import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Pencil, Trash2, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin · Links" },
      { name: "description", content: "Manage redirect links." },
    ],
  }),
  component: AdminPage,
});

interface LinkRow {
  id: string;
  slug: string;
  destination: string | null;
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

function AdminPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);

  // create form
  const [slug, setSlug] = useState("");
  const [destination, setDestination] = useState("");

  // edit dialog
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [eDestination, setEDestination] = useState("");
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
    setLinks(data ?? []);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    if (!cleanSlug) return;
    const { error } = await supabase.from("links").insert({
      slug: cleanSlug,
      destination: destination.trim() || null,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setSlug("");
    setDestination("");
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

  const openEdit = (l: LinkRow) => {
    setEditing(l);
    setEDestination(l.destination ?? "");
    setETitle(l.page_title ?? DEFAULTS.page_title);
    setEMessage(l.page_message ?? DEFAULTS.page_message);
    setEIcon(l.page_icon ?? DEFAULTS.page_icon);
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const { error } = await supabase
      .from("links")
      .update({
        destination: eDestination.trim() || null,
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
    navigator.clipboard.writeText(`${origin}/${slug}`);
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
          <h2 className="mb-4 text-base font-medium">Create new link</h2>
          <form
            onSubmit={handleCreate}
            className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
          >
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                placeholder="my-link"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="destination">Destination URL (optional)</Label>
              <Input
                id="destination"
                type="url"
                placeholder="https://example.com"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>
            <Button type="submit">Create</Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-medium">All links</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slug</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead className="w-[220px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-sm">/{l.slug}</TableCell>
                      <TableCell className="max-w-md truncate text-sm">
                        {l.destination ? (
                          <span className="text-foreground">{l.destination}</span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Not set — shows waiting page
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => copyLink(l.slug)}
                            title="Copy link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            asChild
                            title="Open"
                          >
                            <a
                              href={`/${l.slug}`}
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
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit /{editing?.slug}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="e-dest">Destination URL</Label>
              <Input
                id="e-dest"
                type="url"
                placeholder="https://example.com"
                value={eDestination}
                onChange={(e) => setEDestination(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to show the waiting page.
              </p>
            </div>
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
                <Label htmlFor="e-title">Waiting page title</Label>
                <Input
                  id="e-title"
                  value={eTitle}
                  onChange={(e) => setETitle(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-msg">Waiting page message</Label>
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
