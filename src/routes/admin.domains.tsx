import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Globe, Plus, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/domains")({
  head: () => ({ meta: [{ title: "Domínios · Big Cloak" }] }),
  component: DomainsPage,
});

export interface DomainRow {
  id: string;
  domain: string;
  active: boolean;
  is_primary: boolean;
  created_at: string;
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\s/g, "");
}

function DomainsPage() {
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("domains")
      .select("*")
      .order("is_primary", { ascending: false })
      .order("domain", { ascending: true });
    setDomains((data ?? []) as DomainRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const d = normalizeDomain(newDomain);
    if (!DOMAIN_RE.test(d)) {
      setError("Domínio inválido. Ex.: epo815.shop");
      return;
    }
    if (domains.some((x) => x.domain === d)) {
      setError("Este domínio já está cadastrado.");
      return;
    }
    setSaving(true);
    const { error: err } = await supabase
      .from("domains")
      .insert({ domain: d, is_primary: domains.length === 0 });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNewDomain("");
    setError(null);
    setOpen(false);
    void load();
  };

  const setPrimary = async (row: DomainRow) => {
    setDomains((prev) => prev.map((x) => ({ ...x, is_primary: x.id === row.id })));
    await supabase.from("domains").update({ is_primary: false }).neq("id", row.id);
    await supabase.from("domains").update({ is_primary: true, active: true }).eq("id", row.id);
    void load();
  };

  const setActive = async (row: DomainRow, active: boolean) => {
    if (!active && row.is_primary) {
      alert("O domínio principal não pode ser desativado. Defina outro como principal antes.");
      return;
    }
    setDomains((prev) => prev.map((x) => (x.id === row.id ? { ...x, active } : x)));
    await supabase.from("domains").update({ active }).eq("id", row.id);
  };

  const remove = async (row: DomainRow) => {
    if (domains.length <= 1) {
      alert("Não é possível remover o único domínio cadastrado.");
      return;
    }
    if (!confirm(`Remover o domínio ${row.domain}?`)) return;
    await supabase.from("domains").delete().eq("id", row.id);
    if (row.is_primary) {
      const next = domains.find((x) => x.id !== row.id);
      if (next) await supabase.from("domains").update({ is_primary: true }).eq("id", next.id);
    }
    void load();
  };

  return (
    <AdminShell
      rightSlot={
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Adicionar domínio
        </Button>
      }
    >
      <div className="mb-6">
        <h1 className="text-[22px] font-bold tracking-tight">Domínios</h1>
        <p className="text-[13px] text-muted-foreground">
          Gerencie os domínios usados para gerar os links. Todos apontam para o mesmo redirecionador.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 text-left font-semibold">Domínio</th>
              <th className="px-3 py-3 text-left font-semibold">Status</th>
              <th className="px-3 py-3 text-left font-semibold">Ativo</th>
              <th className="px-3 py-3 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && domains.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  Nenhum domínio cadastrado.
                </td>
              </tr>
            )}
            {domains.map((d, i) => (
              <tr
                key={d.id}
                className={cn("border-b border-border/60 last:border-0", i % 2 === 1 && "bg-secondary/20")}
              >
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
                      <Globe className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-[14px] font-bold text-primary">{d.domain}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">https://{d.domain}/slug</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-4">
                  {d.is_primary ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-primary">
                      <Star className="h-3 w-3" /> Principal
                    </span>
                  ) : (
                    <span className="text-[11.5px] text-muted-foreground">Secundário</span>
                  )}
                </td>
                <td className="px-3 py-4">
                  <Switch checked={d.active} onCheckedChange={(v) => setActive(d, v)} />
                </td>
                <td className="px-3 py-4">
                  <div className="flex items-center justify-end gap-2">
                    {!d.is_primary && (
                      <button
                        onClick={() => setPrimary(d)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11.5px] font-semibold text-primary transition-all hover:bg-primary/20"
                      >
                        <Star className="h-3.5 w-3.5" /> Definir como principal
                      </button>
                    )}
                    <button
                      onClick={() => remove(d)}
                      disabled={domains.length <= 1}
                      className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1 text-[11.5px] font-semibold text-destructive transition-all hover:bg-destructive/10 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar domínio</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="domain">Domínio</Label>
              <Input
                id="domain"
                value={newDomain}
                onChange={(e) => {
                  setNewDomain(e.target.value);
                  setError(null);
                }}
                placeholder="epo815.shop"
                autoFocus
              />
              <p className="text-[11.5px] text-muted-foreground">Sem https:// e sem barra final.</p>
              {error && <p className="text-[11.5px] text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Adicionar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
