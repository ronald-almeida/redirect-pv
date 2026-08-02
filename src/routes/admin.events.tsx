import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, Download, History, RotateCcw } from "lucide-react";
import { AdminShell, type AdminPeriod } from "@/components/admin/AdminShell";
import { EmptyState } from "@/components/admin/shared/EmptyState";
import { AccessTable, type AccessView } from "@/components/admin/events/AccessTable";
import { AuditTable } from "@/components/admin/events/AuditTable";
import { EventDetailsSheet } from "@/components/admin/events/EventDetailsSheet";
import { InfiniteFooter } from "@/components/admin/events/InfiniteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminPeriodToRange } from "@/lib/admin-period";
import { cn } from "@/lib/utils";
import { useAccessEvents } from "@/hooks/use-access-events";
import { useAudit } from "@/hooks/use-audit";
import { useLinks } from "@/hooks/use-links";
import { useDomains } from "@/hooks/use-domains";
import { RESULT_LABEL, resultOf } from "@/lib/supabase/queries/access-events";
import { AUDIT_ACTION_LABEL, ENTITY_LABEL } from "@/lib/supabase/queries/audit";

export const Route = createFileRoute("/admin/events")({
  head: () => ({
    meta: [
      { title: "Eventos operacionais · Big Cloak" },
      {
        name: "description",
        content:
          "Acompanhe acessos aos links e o histórico de alterações administrativas do Big Cloak.",
      },
    ],
  }),
  component: EventsPage,
});

type Tab = "access" | "audit";

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition-colors sm:flex-none",
        active
          ? "bg-primary/12 text-primary ring-1 ring-primary/30"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function csv(rows: string[][]) {
  return rows
    .map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function EventsPage() {
  const [tab, setTab] = useState<Tab>("access");
  const [period, setPeriod] = useState<AdminPeriod>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const range = useMemo(
    () => adminPeriodToRange(period, customStart, customEnd),
    [period, customStart, customEnd],
  );

  const { data: links = [] } = useLinks();
  const { domains } = useDomains();
  const access = useAccessEvents(range, links, domains);
  const audit = useAudit(range);
  const [selected, setSelected] = useState<AccessView | null>(null);

  const linkById = useMemo(() => new Map(links.map((l) => [l.id, l])), [links]);
  const domainById = useMemo(() => new Map(domains.map((d) => [d.id, d.domain])), [domains]);

  const views = useMemo<AccessView[]>(
    () =>
      access.rows.map((r) => {
        const l = linkById.get(r.link_id);
        return {
          ...r,
          slug: l?.slug ?? "desconhecida",
          linkName: l?.name?.trim() || l?.slug || "Link removido",
          domain: (l?.domain_id ? domainById.get(l.domain_id) : null) ?? r.host ?? "",
          destination: l?.real_url ?? "",
        };
      }),
    [access.rows, linkById, domainById],
  );

  const exportAccess = () =>
    download(
      `acessos-${new Date().toISOString().slice(0, 10)}.csv`,
      csv([
        ["Data", "Link", "Slug", "Domínio", "Destino", "Resultado", "Tempo (ms)", "Dispositivo", "País"],
        ...views.map((v) => [
          new Date(v.created_at).toLocaleString("pt-BR"),
          v.linkName,
          v.slug,
          v.domain,
          v.destination,
          RESULT_LABEL[resultOf(v.mode_at_click)],
          String(v.redirect_ms ?? ""),
          v.device ?? "",
          v.country ?? "",
        ]),
      ]),
    );

  const f = access.filters;

  return (
    <AdminShell
      period={period}
      onPeriod={setPeriod}
      customStart={customStart}
      customEnd={customEnd}
      onCustomRange={(s, e) => {
        setCustomStart(s);
        setCustomEnd(e);
      }}
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight">Eventos</h1>
          <p className="text-[12.5px] text-muted-foreground">
            Acessos aos links e histórico de alterações do painel.
          </p>
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          <TabButton
            active={tab === "access"}
            icon={Activity}
            label="Acessos"
            onClick={() => setTab("access")}
          />
          <TabButton
            active={tab === "audit"}
            icon={History}
            label="Histórico de Alterações"
            onClick={() => setTab("audit")}
          />
        </div>

        {tab === "access" ? (
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-col gap-2 border-b border-border p-3 lg:flex-row lg:items-center">
              <Input
                value={f.search}
                onChange={(e) => access.patch({ search: e.target.value })}
                placeholder="Buscar por nome, slug, domínio ou URL"
                className="h-10 flex-1 text-[16px] lg:text-[13px]"
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
                <Select
                  value={f.result}
                  onValueChange={(v) => access.patch({ result: v as typeof f.result })}
                >
                  <SelectTrigger className="h-10 lg:w-[180px]">
                    <SelectValue placeholder="Resultado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os resultados</SelectItem>
                    <SelectItem value="redirected">✅ Redirecionado</SelectItem>
                    <SelectItem value="waiting">🟡 Página de espera</SelectItem>
                    <SelectItem value="error">🔴 Erro</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={f.domainId} onValueChange={(v) => access.patch({ domainId: v })}>
                  <SelectTrigger className="h-10 lg:w-[170px]">
                    <SelectValue placeholder="Domínio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os domínios</SelectItem>
                    {domains.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={f.linkId} onValueChange={(v) => access.patch({ linkId: v })}>
                  <SelectTrigger className="h-10 lg:w-[170px]">
                    <SelectValue placeholder="Slug" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as slugs</SelectItem>
                    {links.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        /{l.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={f.device} onValueChange={(v) => access.patch({ device: v })}>
                  <SelectTrigger className="h-10 lg:w-[150px]">
                    <SelectValue placeholder="Dispositivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos dispositivos</SelectItem>
                    {access.devices.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={f.country} onValueChange={(v) => access.patch({ country: v })}>
                  <SelectTrigger className="h-10 lg:w-[130px]">
                    <SelectValue placeholder="País" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os países</SelectItem>
                    {access.countries.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-10 flex-1" onClick={access.reset}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Limpar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 flex-1"
                  onClick={exportAccess}
                  disabled={views.length === 0}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  CSV
                </Button>
              </div>
            </div>

            {access.liveCount > 0 && (
              <div className="flex items-center gap-2 border-b border-border bg-primary/8 px-4 py-2 text-[12px] font-semibold text-primary">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                {access.liveCount} novo{access.liveCount > 1 ? "s" : ""} acesso
                {access.liveCount > 1 ? "s" : ""} em tempo real
              </div>
            )}

            {views.length === 0 && !access.isLoading ? (
              <EmptyState
                icon={Activity}
                title="Nenhum acesso no período"
                description="Ajuste os filtros ou selecione um período maior para ver os eventos."
              />
            ) : (
              <AccessTable rows={views} onSelect={setSelected} />
            )}

            <InfiniteFooter
              loaded={views.length}
              total={access.total}
              noun="acessos"
              hasMore={!!access.hasNextPage}
              loading={access.isFetchingNextPage || access.isLoading}
              onLoadMore={() => access.fetchNextPage()}
            />
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-col gap-2 border-b border-border p-3 lg:flex-row lg:items-center">
              <Input
                value={audit.filters.search}
                onChange={(e) => audit.patch({ search: e.target.value })}
                placeholder="Buscar por nome, slug ou domínio"
                className="h-10 flex-1 text-[16px] lg:text-[13px]"
              />
              <div className="grid grid-cols-2 gap-2 lg:flex">
                <Select
                  value={audit.filters.entity}
                  onValueChange={(v) => audit.patch({ entity: v as never })}
                >
                  <SelectTrigger className="h-10 lg:w-[190px]">
                    <SelectValue placeholder="Entidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as entidades</SelectItem>
                    {(Object.keys(ENTITY_LABEL) as (keyof typeof ENTITY_LABEL)[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {ENTITY_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={audit.filters.action}
                  onValueChange={(v) => audit.patch({ action: v })}
                >
                  <SelectTrigger className="h-10 lg:w-[220px]">
                    <SelectValue placeholder="Ação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as ações</SelectItem>
                    {Object.entries(AUDIT_ACTION_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" className="h-10" onClick={audit.reset}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Limpar
              </Button>
            </div>

            {audit.rows.length === 0 && !audit.isLoading ? (
              <EmptyState
                icon={History}
                title="Nenhuma alteração registrada"
                description="Criações, edições, ativações e arquivamentos aparecem aqui automaticamente."
              />
            ) : (
              <AuditTable rows={audit.rows} />
            )}

            <InfiniteFooter
              loaded={audit.rows.length}
              total={audit.total}
              noun="alterações"
              hasMore={!!audit.hasNextPage}
              loading={audit.isFetchingNextPage || audit.isLoading}
              onLoadMore={() => audit.fetchNextPage()}
            />
          </section>
        )}
      </div>

      <EventDetailsSheet event={selected} onClose={() => setSelected(null)} />
    </AdminShell>
  );
}
