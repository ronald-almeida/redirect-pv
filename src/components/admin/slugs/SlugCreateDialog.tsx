import { useEffect, useState, type FormEvent } from "react";
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
import type { DomainRow } from "@/lib/bigcloak";
import { humanizeLinkError, slugExists } from "@/lib/supabase/queries/links";
import { cn } from "@/lib/utils";

const MANUAL_SLUG_RE = /^[a-z0-9_-]+$/;
const MANUAL_SLUG_HINT = "Use apenas letras minúsculas, números, hífens e underscores.";

type SlugMode = "manual" | "automatic";

function generateAutomaticSlug() {
  return `ut-${Math.random().toString(36).substring(2, 8)}`;
}

interface SlugCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domains: DomainRow[];
  defaultDomainId: string | null;
  onCreate: (input: {
    slug: string;
    name: string | null;
    real_url: string | null;
    domain_id: string | null;
  }) => Promise<void>;
}

export function SlugCreateDialog({
  open,
  onOpenChange,
  domains,
  defaultDomainId,
  onCreate,
}: SlugCreateDialogProps) {
  const [slugMode, setSlugMode] = useState<SlugMode>("manual");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [realUrl, setRealUrl] = useState("");
  const [domainId, setDomainId] = useState<string | null>(defaultDomainId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDomainId(defaultDomainId);
  }, [open, defaultDomainId]);

  const selectedDomain = domains.find((d) => d.id === domainId)?.domain;
  const previewOrigin = selectedDomain
    ? `https://${selectedDomain}`
    : typeof window !== "undefined"
      ? window.location.origin
      : "";

  const reset = () => {
    setSlugMode("manual");
    setSlug("");
    setName("");
    setRealUrl("");
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    let value = slug.trim();
    if (slugMode === "manual") {
      if (!value) return setError("Informe um slug.");
      if (!MANUAL_SLUG_RE.test(value)) return setError(MANUAL_SLUG_HINT);
    }

    setSaving(true);
    try {
      if (slugMode === "manual") {
        if (await slugExists(value)) {
          setError("Este slug já existe");
          return;
        }
      } else {
        let attempts = 0;
        do {
          value = generateAutomaticSlug();
          attempts += 1;
          if (!(await slugExists(value))) break;
        } while (attempts < 10);

        if (attempts === 10 && (await slugExists(value))) {
          setError("Não foi possível gerar um slug único. Tente novamente.");
          return;
        }
      }
      await onCreate({
        slug: value,
        name: name.trim() || null,
        real_url: realUrl.trim() || null,
        domain_id: domainId,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      const databaseError = err as { code?: string } | null;
      setError(databaseError?.code === "23505" ? "Este slug já existe" : humanizeLinkError(err));
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
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Novo link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Criação do slug</Label>
            <div className="grid grid-cols-2 gap-1 rounded-full border border-border bg-secondary/60 p-1">
              <Button
                type="button"
                size="sm"
                variant={slugMode === "manual" ? "default" : "ghost"}
                aria-pressed={slugMode === "manual"}
                className="rounded-full shadow-none"
                onClick={() => {
                  setSlugMode("manual");
                  setError(null);
                }}
              >
                ✏️ Manual
              </Button>
              <Button
                type="button"
                size="sm"
                variant={slugMode === "automatic" ? "default" : "ghost"}
                aria-pressed={slugMode === "automatic"}
                className="rounded-full shadow-none"
                onClick={() => {
                  setSlugMode("automatic");
                  setError(null);
                }}
              >
                ⚡ Automático
              </Button>
            </div>
          </div>

          {domains.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Domínio</Label>
              <div className="flex flex-wrap gap-1.5">
                {domains.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => setDomainId(d.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                      domainId === d.id
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-secondary text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {d.domain}
                    {d.is_primary && (
                      <span className="ml-1 text-[9px] uppercase opacity-60">principal</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {slugMode === "manual" ? (
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
                <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground">
                  {previewOrigin}/
                </span>
                <input
                  id="new-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="ex: joao, atendente-01, ut_1237123"
                  title={MANUAL_SLUG_HINT}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent py-2 font-mono text-base outline-none sm:text-[12.5px]"
                />
              </div>
              {error ? (
                <p className="text-[11px] font-medium text-destructive" role="alert">
                  {error}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Sem URL de destino o link nasce em modo Espera.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-border bg-secondary px-3 py-3">
              <p className="font-mono text-[12.5px] font-medium text-foreground">
                Slug gerado automaticamente (ex: ut-a3f9k2)
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sem URL de destino o link nasce em modo Espera.
              </p>
              {error && (
                <p className="mt-1 text-[11px] font-medium text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-name" className="text-xs">
                Nome (opcional)
              </Label>
              <Input
                id="new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Identificação"
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
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Criando…" : "Criar link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
