import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Plus, Search as SearchIcon } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/shared/EmptyState";
import { Pagination } from "@/components/admin/shared/Pagination";
import { SlugRow } from "@/components/admin/slugs/SlugRow";
import { SlugCreateDialog } from "@/components/admin/slugs/SlugCreateDialog";
import { SlugEditDialog } from "@/components/admin/slugs/SlugEditDialog";
import { useAdminFilters, shellPeriodProps } from "@/hooks/use-admin-filters";
import { useClicks } from "@/hooks/use-clicks";
import { useDomains } from "@/hooks/use-domains";
import { useLinks, useLinkMutations, useLinksRealtime } from "@/hooks/use-links";
import type { LinkRow, Mode } from "@/lib/bigcloak";
import { bucketCounts } from "@/lib/supabase/queries/clicks";
import { humanizeLinkError } from "@/lib/supabase/queries/links";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/slugs")({
  head: () => ({
    meta: [
      { title: "Links · Big Cloak" },
      { name: "description", content: "Crie, edite e ative os slugs de redirecionamento do Big Cloak." },
    ],
  }),
  component: SlugsPage,
});

const PAGE_SIZE = 10;
const TYPE_FILTERS = [
  { k: "all", l: "Todos" },
  { k: "real", l: "Real" },
  { k: "waiting", l: "Espera" },
] as const;

type TypeFilter = (typeof TYPE_FILTERS)[number]["k"];

function SlugsPage() {
  const filters = useAdminFilters("today");
  const { data: links = [] } = useLinks();
  const { clicks, cacheByLink, clicksByLink } = useClicks(filters.range);
  const { activeDomains, primaryDomain } = useDomains();
  const pulseIds = useLinksRealtime();
  const mutations = useLinkMutations();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [linkDomain, setLinkDomain] = useState<Record<string, string>>({});

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  const domainFor = useCallback(
    (id: string) => linkDomain[id] ?? primaryDomain,
    [linkDomain, primaryDomain],
  );
  const baseUrlFor = useCallback(
    (id: string) => (domainFor(id) ? `https://${domainFor(id)}` : origin),
    [domainFor, origin],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    let list = links;
    if (typeFilter !== "all") list = list.filter((l) => (l.mode as Mode) === typeFilter);
    if (q) {
      list = list.filter(
        (l) => l.slug.toLowerCase().includes(q) || (l.name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [links, filters.search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  const handlePickDomain = useCallback((linkId: string, domain: string) => {
    setLinkDomain((prev) => ({ ...prev, [linkId]: domain }));
  }, []);

  const handleCopy = useCallback(
    (l: LinkRow) => {
      void navigator.clipboard.writeText(`${baseUrlFor(l.id)}/${l.slug}`);
      setCopiedSlug(l.slug);
      setTimeout(() => setCopiedSlug((s) => (s === l.slug ? null : s)), 1500);
    },
    [baseUrlFor],
  );

  const handleDuplicate = useCallback(
    (l: LinkRow) => {
      mutations.duplicate.mutate({ source: l, slugs: links.map((x) => x.slug) });
    },
    [mutations.duplicate, links],
  );

  const handleSetMode = useCallback(
    (l: LinkRow, mode: Mode) => mutations.setMode.mutate({ id: l.id, mode }),
    [mutations.setMode],
  );

  const handleSetActive = useCallback(
    (l: LinkRow, active: boolean) => mutations.setActive.mutate({ id: l.id, active }),
    [mutations.setActive],
  );

  const handleDelete = useCallback(
    (l: LinkRow) => {
      if (!confirm(`Excluir /${l.slug}?`)) return;
      mutations.remove.mutate(l.id, {
        onError: (err) => alert(humanizeLinkError(err)),
      });
    },
    [mutations.remove],
  );

  return (
    <AdminShell {...shellPeriodProps(filters)}>
      <div className="max-w-[1480px] space-y-6 px-4 py-8 md:px-10 md:py-9">
        <header className="border-b border-border/60 pb-6">
          <h1 className="text-[28px] font-bold leading-[1.1] tracking-tight md:text-[40px] md:leading-[1.05]">
            Links
          </h1>
          <p className="mt-2 text-[13px] font-light text-muted-foreground/80 md:text-[14px]">
            Crie, ative e acompanhe cada slug de redirecionamento
          </p>
        </header>

        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border px-4 pb-4 pt-4 md:px-5 md:pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[16px] font-semibold tracking-tight md:text-[17px]">
                  Links Ativos
                </h2>
                <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {filtered.length}
                </span>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <div className="relative min-w-0 flex-1 sm:flex-none">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={filters.search}
                    onChange={(e) => {
                      filters.setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Buscar por nome ou slug..."
                    className="h-10 w-full rounded-full border border-border bg-secondary pl-9 pr-3 text-base outline-none focus:border-primary sm:h-9 sm:w-[260px] sm:text-[12.5px]"
                  />
                </div>
                <Button
                  size="sm"
                  className="h-10 gap-1.5 rounded-full px-4 sm:h-9"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Novo Link
                </Button>
              </div>
            </div>

            <div className="inline-flex w-fit items-center gap-0.5 rounded-full border border-border bg-secondary/60 p-0.5">
              {TYPE_FILTERS.map(({ k, l }) => (
                <button
                  key={k}
                  onClick={() => {
                    setTypeFilter(k);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full px-4 py-2 text-[11.5px] font-semibold transition-all sm:py-1.5",
                    typeFilter === k
                      ? "bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_rgba(52,211,153,0.55)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="Nenhum link encontrado"
              description={
                filters.search
                  ? "Ajuste a busca para ver mais resultados."
                  : "Crie seu primeiro slug para começar."
              }
              actionLabel="Novo link"
              onAction={() => setCreateOpen(true)}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-secondary/30">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                      <th className="px-5 py-3.5">Link</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Tipo</th>
                      <th className="px-4 py-3.5 text-center">Real</th>
                      <th className="px-4 py-3.5 text-center">Espera</th>
                      <th className="px-4 py-3.5 text-right">
                        Última
                        <br />
                        latência
                      </th>
                      <th className="px-4 py-3.5">Média</th>
                      <th className="px-4 py-3.5">
                        Último
                        <br />
                        acesso
                      </th>
                      <th className="px-4 py-3.5">Cache</th>
                      <th className="px-4 py-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((l) => {
                      const linkClicks = clicksByLink.get(l.id) ?? [];
                      const countReal = linkClicks.filter((c) =>
                        c.mode_at_click.startsWith("real"),
                      ).length;
                      return (
                        <SlugRow
                          key={l.id}
                          link={l}
                          pulsing={pulseIds.has(l.id)}
                          copied={copiedSlug === l.slug}
                          cacheStatus={cacheByLink[l.id]}
                          lastClickAt={linkClicks[0]?.created_at ?? l.last_click_at}
                          countReal={countReal}
                          countWaiting={linkClicks.length - countReal}
                          sparkline={bucketCounts(linkClicks, filters.range, 14)}
                          domain={domainFor(l.id)}
                          activeDomains={activeDomains}
                          onPickDomain={handlePickDomain}
                          onCopy={handleCopy}
                          onDuplicate={handleDuplicate}
                          onEdit={setEditing}
                          onSetMode={handleSetMode}
                          onSetActive={handleSetActive}
                          onDelete={handleDelete}
                        />
                      );
                    })}
                  </tbody>
                </table>
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

        <p className="text-[11px] text-muted-foreground">
          {clicks.length} cliques registrados no período selecionado.
        </p>
      </div>

      <SlugCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        origin={primaryDomain ? `https://${primaryDomain}` : origin}
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
