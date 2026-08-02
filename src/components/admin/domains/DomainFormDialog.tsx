import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DomainRow } from "@/lib/bigcloak";
import { isValidDomain, normalizeDomainName } from "@/lib/supabase/queries/domains";

export interface DomainFormValues {
  domain: string;
  description: string | null;
  makePrimary: boolean;
  active: boolean;
}

interface DomainFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Quando presente, o modal edita; caso contrário, cria. */
  domain?: DomainRow | null;
  existingDomains: DomainRow[];
  onSubmit: (values: DomainFormValues) => Promise<void>;
}

export function DomainFormDialog({
  open,
  onOpenChange,
  domain,
  existingDomains,
  onSubmit,
}: DomainFormDialogProps) {
  const editing = !!domain;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [makePrimary, setMakePrimary] = useState(false);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(domain?.domain ?? "");
    setDescription(domain?.description ?? "");
    setMakePrimary(domain?.is_primary ?? false);
    setActive(domain?.active ?? true);
    setError(null);
  }, [open, domain]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = normalizeDomainName(name);
    if (!isValidDomain(value)) {
      setError("Domínio inválido. Ex.: informebig.shop");
      return;
    }
    if (existingDomains.some((d) => d.domain === value && d.id !== domain?.id)) {
      setError("Este domínio já está cadastrado.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        domain: value,
        description: description.trim() || null,
        makePrimary,
        active,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar domínio" : "Novo domínio"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="domain-name">Nome do domínio</Label>
            <Input
              id="domain-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="informebig.shop"
              autoFocus={!editing}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-11 text-base"
            />
            <p className="text-[11.5px] text-muted-foreground">Sem https:// e sem barra final.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="domain-desc">Descrição (opcional)</Label>
            <Textarea
              id="domain-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: domínio usado nas campanhas de WhatsApp"
              rows={2}
              className="text-base"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <div className="text-[13px] font-semibold">Definir como principal</div>
              <p className="text-[11.5px] text-muted-foreground">
                Usado por padrão ao criar novas slugs.
              </p>
            </div>
            <Switch checked={makePrimary} onCheckedChange={setMakePrimary} />
          </div>

          {editing && (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <div className="text-[13px] font-semibold">Domínio ativo</div>
                <p className="text-[11.5px] text-muted-foreground">
                  Domínios inativos não aparecem na criação de slugs.
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} disabled={makePrimary} />
            </div>
          )}

          {error && <p className="text-[12px] text-destructive">{error}</p>}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="h-11" disabled={saving}>
              {saving ? "Salvando…" : editing ? "Salvar" : "Adicionar domínio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
