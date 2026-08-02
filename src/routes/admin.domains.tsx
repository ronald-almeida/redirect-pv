import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Globe, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DomainCard } from "@/components/admin/domains/DomainCard";
import {
  DomainFormDialog,
  type DomainFormValues,
} from "@/components/admin/domains/DomainFormDialog";
import { DomainSlugsDrawer } from "@/components/admin/domains/DomainSlugsDrawer";
import { useDomainMutations, useDomains } from "@/hooks/use-domains";
import { useDomainUsage } from "@/hooks/use-domain-usage";
import { useLinks } from "@/hooks/use-links";
import type { DomainRow } from "@/lib/bigcloak";
import { EMPTY_USAGE } from "@/lib/domain-usage";
import { nf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/domains")({
  head: () => ({
    meta: [
      { title: "Domínios · Big Cloak" },
      {
        name: "description",
        content:
          "Centro de gerenciamento de domínios do Big Cloak: saúde, slugs vinculadas e domínio principal.",
      },
      { property: "og:title", content: "Domínios · Big Cloak" },
      {
        property: "og:description",
        content: "Gerencie domínios, saúde de DNS/Worker e slugs vinculadas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DomainsPage,
});

type Filter = "all" | "primary" | "secondary" | "archived";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "primary", label: "Principal" },
  { key: "secondary", label: "Secundários" },
  { key: "archived", label: "Arquivados" },
];

const DAY = 24 * 60 * 60 * 1000;

function buildStats(links: LinkRow[]): DomainStats {
  const now = Date.now();
  let clicks = 0;
  let recentClicks = 0;
  let lastClickAt: string | null = null;
  let msSum = 0;
  let msCount = 0;

  for (const l of links) {
    clicks += l.click_count ?? 0;
    if (l.last_click_at) {
      if (!lastClickAt || l.last_click_at > lastClickAt) lastClickAt = l.last_click_at;
      if (now - new Date(l.last_click_at).getTime() < DAY) recentClicks += l.click_count ?? 0;
    }
    const ms = (l as { avg_redirect_ms?: number | null }).avg_redirect_ms ?? 0;
    if (ms > 0) {
      msSum += ms;
      msCount += 1;
    }
  }

  return {
    totalSlugs: links.length,
    activeSlugs: links.filter((l) => !l.archived_at && l.active && l.mode !== "waiting").length,
    waitingSlugs: links.filter((l) => !l.archived_at && l.mode === "waiting").length,
    clicks,
    recentClicks,
    lastClickAt,
    avgRedirectMs: msCount ? Math.round(msSum / msCount) : 0,
  };
}

function DomainsPage() {
  const { domains, isLoading } = useDomains();
  const { data: links = [] } = useLinks();
  const m = useDomainMutations();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DomainRow | null>(null);
  const [drawerDomain, setDrawerDomain] = useState<DomainRow | null>(null);

  const statsByDomain = useMemo(() => {
    const map = new Map<string, DomainStats>();
    for (const d of domains) {
      map.set(
        d.id,
        buildStats(links.filter((l) => l.domain_id === d.id)),
      );
    }
    return map;
  }, [domains, links]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return domains.filter((d) => {
      if (filter === "archived" && !d.archived_at) return false;
      if (filter !== "archived" && d.archived_at) return false;
      if (filter === "primary" && !d.is_primary) return false;
      if (filter === "secondary" && d.is_primary) return false;
      if (q && !`${d.domain} ${d.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [domains, filter, query]);

  const totals = useMemo(() => {
    const actives = domains.filter((d) => !d.archived_at);
    const slugs = links.filter((l) => !l.archived_at).length;
    return { actives: actives.length, archived: domains.length - actives.length, slugs };
  }, [domains, links]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (d: DomainRow) => {
    setEditing(d);
    setFormOpen(true);
  };

  const handleSubmit = async (v: DomainFormValues) => {
    if (editing) {
      await m.update.mutateAsync({
        id: editing.id,
        patch: { domain: v.domain, description: v.description, active: v.active || v.makePrimary },
      });
      if (v.makePrimary && !editing.is_primary) await m.setPrimary.mutateAsync(editing.id);
      toast.success("Domínio atualizado");
    } else {
      await m.create.mutateAsync({
        input: { domain: v.domain, description: v.description, makePrimary: v.makePrimary },
        existing: domains,
      });
      toast.success("Domínio adicionado");
    }
  };

  const setPrimary = async (d: DomainRow) => {
    await m.setPrimary.mutateAsync(d.id);
    toast.success(`${d.domain} agora é o domínio principal`);
  };

  const archive = async (d: DomainRow) => {
    if (d.is_primary) {
      toast.error("Defina outro domínio como principal antes de arquivar este.");
      return;
    }
    await m.archive.mutateAsync(d.id);
    toast.success(`${d.domain} arquivado. As slugs continuam intactas.`);
  };

  const restore = async (d: DomainRow) => {
    await m.restore.mutateAsync(d.id);
    toast.success(`${d.domain} restaurado`);
  };

  return (
    <AdminShell>
      <div className="space-y-5">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">Domínios</h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {nf(totals.actives)} ativos · {nf(totals.archived)} arquivados · {nf(totals.slugs)}{" "}
              slugs
            </p>
          </div>
          <Button onClick={openCreate} className="h-11 shrink-0 gap-1.5">
            <Plus className="h-4 w-4" /> Novo domínio
          </Button>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar domínio…"
              className="h-11 pl-9 text-base"
              inputMode="search"
            />
          </div>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "h-11 shrink-0 rounded-lg border px-3.5 text-[13px] font-semibold transition-colors",
                  filter === f.key
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl border border-border bg-card" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center">
            <Globe className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-[14px] font-semibold">Nenhum domínio encontrado</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Adicione um domínio para começar a distribuir suas slugs.
            </p>
            <Button onClick={openCreate} className="mt-4 h-11 gap-1.5">
              <Plus className="h-4 w-4" /> Novo domínio
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {visible.map((d) => (
              <DomainCard
                key={d.id}
                domain={d}
                usage={getUsage(d.id)}
                onViewSlugs={setDrawerDomain}
                onSetPrimary={setPrimary}
                onEdit={openEdit}
                onArchive={archive}
                onRestore={restore}
              />
            ))}
          </div>
        )}
      </div>

      <DomainFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        domain={editing}
        existingDomains={domains}
        onSubmit={handleSubmit}
      />

      <DomainSlugsDrawer
        domain={drawerDomain}
        links={links.filter((l) => l.domain_id === drawerDomain?.id)}
        usage={drawerDomain ? getUsage(drawerDomain.id) : EMPTY_USAGE}
        onOpenChange={(open) => !open && setDrawerDomain(null)}
      />

    </AdminShell>
  );
}
