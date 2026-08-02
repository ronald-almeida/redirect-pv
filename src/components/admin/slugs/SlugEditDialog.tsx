import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/admin/shared/Field";
import type { LinkRow } from "@/lib/bigcloak";
import { SLUG_HINT, SLUG_RE } from "@/lib/bigcloak";
import { humanizeLinkError, LINK_DEFAULTS } from "@/lib/supabase/queries/links";

interface SlugEditDialogProps {
  link: LinkRow | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<LinkRow>) => Promise<void>;
}

export function SlugEditDialog({ link, onClose, onSave }: SlugEditDialogProps) {
  const [draft, setDraft] = useState<LinkRow | null>(link);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(link);
    setError(null);
  }, [link]);

  const patch = (p: Partial<LinkRow>) => setDraft((cur) => (cur ? { ...cur, ...p } : cur));

  const handleSave = async () => {
    if (!draft) return;
    const slug = draft.slug.trim();
    if (!slug || !SLUG_RE.test(slug)) {
      setError(SLUG_HINT);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.id, {
        slug,
        name: draft.name?.trim() || null,
        real_url: draft.real_url?.trim() || null,
        page_title: draft.page_title?.trim() || LINK_DEFAULTS.page_title,
        page_message: draft.page_message?.trim() || LINK_DEFAULTS.page_message,
        page_icon: draft.page_icon?.trim() || LINK_DEFAULTS.page_icon,
      });
      onClose();
    } catch (err) {
      setError(humanizeLinkError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Editar /{link?.slug}</DialogTitle>
        </DialogHeader>

        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Slug">
                <Input
                  value={draft.slug}
                  onChange={(e) => patch({ slug: e.target.value })}
                  className="font-mono"
                />
              </Field>
              <Field label="Nome">
                <Input
                  value={draft.name ?? ""}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="Opcional"
                />
              </Field>
            </div>

            <Field label="URL real">
              <Input
                value={draft.real_url ?? ""}
                onChange={(e) => patch({ real_url: e.target.value })}
                placeholder="https://destino.com"
                inputMode="url"
              />
            </Field>

            <div className="space-y-3 rounded-md border border-border bg-secondary/50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Página de espera
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-3">
                <Field label="Ícone">
                  <Input
                    value={draft.page_icon ?? ""}
                    onChange={(e) => patch({ page_icon: e.target.value })}
                    maxLength={4}
                  />
                </Field>
                <Field label="Título">
                  <Input
                    value={draft.page_title ?? ""}
                    onChange={(e) => patch({ page_title: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Mensagem">
                <Textarea
                  rows={2}
                  value={draft.page_message ?? ""}
                  onChange={(e) => patch({ page_message: e.target.value })}
                />
              </Field>
            </div>

            {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
