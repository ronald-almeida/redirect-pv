import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Plus, Search as SearchIcon } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/shared/EmptyState";
import { Pagination } from "@/components/admin/shared/Pagination";
import { SlugRow } from "@/components/admin/slugs/SlugRow";
import { SlugCard } from "@/components/admin/slugs/SlugCard";
import { SlugCreateDialog } from "@/components/admin/slugs/SlugCreateDialog";
import { SlugEditDialog } from "@/components/admin/slugs/SlugEditDialog";
import { useAdminFilters, shellPeriodProps } from "@/hooks/use-admin-filters";
import { useClicks } from "@/hooks/use-clicks";
import { useDomains } from "@/hooks/use-domains";
import { useLinks, useLinkMutations, useLinksRealtime } from "@/hooks/use-links";
import type { LinkRow } from "@/lib/bigcloak";
import { toast } from "sonner";
import { canActivate, humanizeLinkError } from "@/lib/supabase/queries/links";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/slugs")({
  head: () => ({
    meta: [
      { title: "Links · Big Cloak" },
      {
        name: "description",
        content: "Crie, edite e ative os slugs de redirecionamento do Big Cloak.",
      },
    ],
  }),
  component: SlugsPage,
});

const PAGE_SIZE = 12;
const STATUS_FILTERS = [
  { k: "active", l: "Ativos" },
  { k: "archived", l: "Arquivados" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["k"];

function SlugsPage() {
  const filters = useAdminFilters("today");
  const { data: links = [] } = useLinks();
  const { clicksByLink } = useClicks(filters.range);
  const { domains, activeDomains, primaryDomain } = useDomains();
  const pulseIds = useLinksRealtime();
  const mutations = useLinkMutations();

  const primaryDomainId = useMemo(
    () => domains.find((d) => d.domain === primaryDomain)?.id ?? null,
    [domains, primaryDomain],
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  const domainNameFor = useCallback(
    (l: LinkRow) => {
      const d = l.domain_id ? domains.find((x) => x.id === l.domain_id) : null;
      return d?.domain ?? primaryDomain;
    },
    [domains, primaryDomain],
  );
  const baseUrlFor = useCallback(
    (l: LinkRow) => {
      const name = domainNameFor(l);
      return name ? `https://${name}` : origin;
    },
    [domainNameFor, origin],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    let list = links;
    if (statusFilter === "active") list = list.filter((l) => !l.archived_at);
    else list = list.filter((l) => !!l.archived_at);
    if (q) {
      list = list.filter(
        (l) => l.slug.toLowerCase().includes(q) || (l.name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [links, filters.search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  const handleCopy = useCallback(
    (l: LinkRow) => {
      void navigator.clipboard.writeText(`${baseUrlFor(l)}/${l.slug}`);
      setCopiedSlug(l.slug);
      setTimeout(() => setCopiedSlug((s) => (s === l.slug ? null : s)), 1500);
    },
    [baseUrlFor],
  );

  const handleDuplicate = useCallback(
    (l: LinkRow) => mutations.duplicate.mutate({ source: l, slugs: links.map((x) => x.slug) }),
    [mutations.duplicate, links],
  );
  const handleArchive = useCallback(
    (l: LinkRow) =>
      mutations.archive.mutate(l.id, { onError: (err) => alert(humanizeLinkError(err)) }),
    [mutations.archive],
  );
  const handleRestore = useCallback(
    (l: LinkRow) =>
      mutations.restore.mutate(l.id, { onError: (err) => alert(humanizeLinkError(err)) }),
    [mutations.restore],
  );
  const handlePickDomain = useCallback(
    (l: LinkRow, domain_id: string) => mutations.setDomain.mutate({ id: l.id, domain_id }),
    [mutations.setDomain],
  );

  const handleActivate = useCallback(
    (l: LinkRow) => {
      if (!canActivate(l)) {
        toast.error("Adicione uma URL de destino antes de ativar este link.", {
          action: { label: "Adicionar destino", onClick: () => setEditing(l) },
        });
        return;
      }
      mutations.activate.mutate(l, {
        onSuccess: () => toast.success("Link ativado com sucesso"),
        onError: (err) => toast.error(humanizeLinkError(err)),
      });
    },
    [mutations.activate],
  );

  const handleDeactivate = useCallback(
    (l: LinkRow) =>
      mutations.deactivate.mutate(l, {
        onSuccess: () => toast.success("Link colocado em espera"),
        onError: (err) => toast.error(humanizeLinkError(err)),
      }),
    [mutations.deactivate],
  );

  const activeCount = links.filter((l) => !l.archived_at).length;
  const archivedCount = links.length - activeCount;

  return (
    <AdminShell {...shellPeriodProps(filters)}>
      <div className="max-w-[1480px] space-y-6 px-4 py-6 md:px-10 md:py-9">
        <header className="flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[26px] font-bold leading-[1.1] tracking-tight md:text-[36px]">
              Links
            </h1>
            <p className="mt-1.5 text-[13px] font-light text-muted-foreground/80">
              {activeCount} ativos · {archivedCount} arquivados
            </p>
          </div>
          <Button
            size="lg"
            className="h-11 gap-1.5 rounded-full px-5 shadow-[0_2px_16px_-4px_rgba(52,211,153,0.6)] sm:h-10"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" /> Novo link
          </Button>
        </header>

        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between md:px-5">
            <div className="inline-flex w-fit items-center gap-0.5 rounded-full border border-border bg-secondary/60 p-0.5">
              {STATUS_FILTERS.map(({ k, l }) => (
                <button
                  key={k}
                  onClick={() => {
                    setStatusFilter(k);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-[12px] font-semibold transition",
                    statusFilter === k
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l}
                  <span className="ml-1.5 opacity-60">
                    {k === "active" ? activeCount : archivedCount}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative min-w-0 flex-1 md:max-w-[300px]">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filters.search}
                onChange={(e) => {
                  filters.setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar nome ou slug…"
                className="h-10 w-full rounded-full border border-border bg-secondary pl-9 pr-3 text-[14px] outline-none focus:border-primary md:h-9 md:text-[12.5px]"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Link2}
              title={
                statusFilter === "archived"
                  ? "Nenhum link arquivado"
                  : "Nenhum link encontrado"
              }
              description={
                filters.search
                  ? "Ajuste a busca para ver mais resultados."
                  : "Crie seu primeiro slug em segundos."
              }
              actionLabel={statusFilter === "archived" ? undefined : "Novo link"}
              onAction={statusFilter === "archived" ? undefined : () => setCreateOpen(true)}
            />
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-secondary/30">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                      <th className="px-5 py-3.5">Nome</th>
                      <th className="px-4 py-3.5">Domínio</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Cliques</th>
                      <th className="px-4 py-3.5">Último acesso</th>
                      <th className="px-4 py-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((l) => {
                      const linkClicks = clicksByLink.get(l.id) ?? [];
                      return (
                        <SlugRow
                          key={l.id}
                          link={l}
                          pulsing={pulseIds.has(l.id)}
                          copied={copiedSlug === l.slug}
                          clicks={linkClicks.length}
                          lastClickAt={linkClicks[0]?.created_at ?? l.last_click_at}
                          domain={domainNameFor(l)}
                          domains={activeDomains}
                          onCopy={handleCopy}
                          onEdit={setEditing}
                          onArchive={handleArchive}
                          onRestore={handleRestore}
                          onDuplicate={handleDuplicate}
                          onPickDomain={handlePickDomain}
                          onActivate={handleActivate}
                          onDeactivate={handleDeactivate}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="grid gap-3 p-3 md:hidden">
                {pageRows.map((l) => {
                  const linkClicks = clicksByLink.get(l.id) ?? [];
                  return (
                    <SlugCard
                      key={l.id}
                      link={l}
                      pulsing={pulseIds.has(l.id)}
                      copied={copiedSlug === l.slug}
                      clicks={linkClicks.length}
                      lastClickAt={linkClicks[0]?.created_at ?? l.last_click_at}
                      domain={domainNameFor(l)}
                      onCopy={handleCopy}
                      onEdit={setEditing}
                      onArchive={handleArchive}
                      onRestore={handleRestore}
                      onDuplicate={handleDuplicate}
                      onActivate={handleActivate}
                      onDeactivate={handleDeactivate}
                    />
                  );
                })}
              </div>

              <Pagination
                page={currentPage}
                totalPages={totalPages}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
                onPage={setPage}
              />
            </>
          )}
        </section>
      </div>

      <SlugCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        domains={activeDomains}
        defaultDomainId={primaryDomainId}
        onCreate={(input) => mutations.create.mutateAsync(input)}
      />

      <SlugEditDialog
        link={editing}
        onClose={() => setEditing(null)}
        onSave={(id, patch) => mutations.update.mutateAsync({ id, patch })}
      />
    </AdminShell>
  );
}
