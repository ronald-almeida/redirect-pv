import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SLUG_HINT, SLUG_RE } from "@/lib/bigcloak";
import { humanizeLinkError, slugExists } from "@/lib/supabase/queries/links";
import { cn } from "@/lib/utils";

interface SlugCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  origin: string;
  onCreate: (input: { slug: string; name: string | null; real_url: string | null }) => Promise<void>;
}

export function SlugCreateDialog({ open, onOpenChange, origin, onCreate }: SlugCreateDialogProps) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [realUrl, setRealUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSlug("");
    setName("");
    setRealUrl("");
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = slug.trim();
    if (!value) {
      setError("Informe um slug.");
      return;
    }
    if (!SLUG_RE.test(value)) {
      setError(SLUG_HINT);
      return;
    }

    setSaving(true);
    try {
      if (await slugExists(value)) {
        setError("Este slug já existe. Escolha outro.");
        return;
      }
      await onCreate({
        slug: value,
        name: name.trim() || null,
        real_url: realUrl.trim() || null,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(humanizeLinkError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Novo link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-slug" className="text-xs">
              Slug
            </Label>
            <div
              className={cn(
                "flex items-center rounded-md border bg-secondary px-2.5 focus-within:border-primary",
                error ? "border-destructive" : "border-border",
              )}
            >
              <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground">{origin}/</span>
              <input
                id="new-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="ex: joao, maria, atendente-01"
                required
                autoFocus
                className="min-w-0 flex-1 bg-transparent py-2 font-mono text-base outline-none sm:text-[12.5px]"
              />
            </div>
            {error ? (
              <p className="text-[11px] font-medium text-destructive">{error}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {SLUG_HINT}. Sem URL de destino o link nasce em modo Espera.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-name" className="text-xs">
              Nome (opcional)
            </Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como você identifica esse link"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-url" className="text-xs">
              URL de destino (opcional)
            </Label>
            <Input
              id="new-url"
              value={realUrl}
              onChange={(e) => setRealUrl(e.target.value)}
              placeholder="https://destino.com"
              inputMode="url"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Criando…" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
