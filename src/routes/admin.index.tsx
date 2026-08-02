import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/dashboard/KpiCard";
import { SystemHealth, type HealthItem } from "@/components/admin/dashboard/SystemHealth";
import { AlertsPanel } from "@/components/admin/dashboard/AlertsPanel";
import { RecentActivity, type ActivityItem } from "@/components/admin/dashboard/RecentActivity";
import { QuickActions } from "@/components/admin/dashboard/QuickActions";
import { ClicksOverTime } from "@/components/admin/dashboard/ClicksOverTime";
import { ClicksByDomain } from "@/components/admin/dashboard/ClicksByDomain";
import { useLinks, useLinksRealtime } from "@/hooks/use-links";
import { useDomains } from "@/hooks/use-domains";
import {
  useDashboardRealtime,
  useDashboardSeries,
  useDashboardTotals,
  useDismissAlert,
  useOpenAlerts,
  useRecentClicks,
  waitingClicksByLink,
  type ChartPreset,
} from "@/hooks/use-dashboard";
import { buildDashboardAlerts, type DashboardAlert } from "@/lib/dashboard-alerts";
import { rateLatency } from "@/lib/latency-rating";
import { linkTitle } from "@/lib/bigcloak";
import { nf } from "@/lib/format";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Painel Operacional · Big Cloak" },
      {
        name: "description",
        content:
          "Central de comando do Big Cloak: acessos, saúde do sistema, atividade recente e alertas em um só lugar.",
      },
      { property: "og:title", content: "Painel Operacional · Big Cloak" },
      {
        property: "og:description",
        content: "Acompanhe acessos, velocidade de redirecionamento e alertas operacionais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function DashboardPage() {
  const [chart, setChart] = useState<ChartPreset>("today");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const alertsRef = useRef<HTMLDivElement>(null);

  const linksQ = useLinks();
  const domainsQ = useDomains();
  const totalsQ = useDashboardTotals();
  const seriesQ = useDashboardSeries(chart);
  const recentQ = useRecentClicks();
  const alertsQ = useOpenAlerts();
  const dismissMutation = useDismissAlert();
  useLinksRealtime();
  useDashboardRealtime();

  const links = useMemo(() => linksQ.data ?? [], [linksQ.data]);
  const domains = domainsQ.domains;
  const series = useMemo(() => seriesQ.data ?? [], [seriesQ.data]);
  const totals = totalsQ.data;

  const linkById = useMemo(() => new Map(links.map((l) => [l.id, l])), [links]);
  const domainById = useMemo(() => new Map(domains.map((d) => [d.id, d])), [domains]);

  /* ── Visão geral ─────────────────────────────────────────────────── */
  const live = useMemo(() => links.filter((l) => !l.archived_at), [links]);
  const activeLinks = useMemo(
    () => live.filter((l) => l.active && l.mode === "real").length,
    [live],
  );
  const waitingLinks = useMemo(() => live.filter((l) => l.mode !== "real").length, [live]);
  const activeDomains = domainsQ.activeDomains.length;
  const avgMs = totals?.avgMsToday ?? 0;
  const latency = rateLatency(avgMs);

  /* ── Saúde operacional ───────────────────────────────────────────── */
  const healthItems = useMemo<HealthItem[]>(() => {
    const dbOk = !totalsQ.isError && !linksQ.isError;
    const attentionDomains = domains.filter(
      (d) => !d.archived_at && (!d.active || d.check_error),
    ).length;

    const redirectState =
      latency.grade === "unknown"
        ? "idle"
        : latency.grade === "slow"
          ? "bad"
          : latency.grade === "attention"
            ? "warn"
            : "ok";

    return [
      {
        label: "Sistema",
        status: dbOk ? "Online" : "Offline",
        state: dbOk ? "ok" : "bad",
      },
      {
        label: "Banco de dados",
        status: dbOk ? "Operacional" : "Indisponível",
        state: dbOk ? "ok" : "bad",
      },
      {
        label: "Redirecionamentos",
        status:
          redirectState === "ok"
            ? "Normais"
            : redirectState === "warn"
              ? "Lentos"
              : redirectState === "bad"
                ? "Com falhas"
                : "Sem acessos hoje",
        state: redirectState,
      },
      {
        label: "Domínios",
        status: !domains.length
          ? "Nenhum cadastrado"
          : attentionDomains
            ? `${attentionDomains} com atenção`
            : "Todos operacionais",
        state: !domains.length ? "idle" : attentionDomains ? "warn" : "ok",
      },
    ];
  }, [domains, latency.grade, linksQ.isError, totalsQ.isError]);

  /* ── Atividade recente ───────────────────────────────────────────── */
  const activity = useMemo<ActivityItem[]>(() => {
    const rows = recentQ.data ?? [];
    return rows.map((c, i) => {
      const l = linkById.get(c.link_id);
      const dom = l?.domain_id ? domainById.get(l.domain_id)?.domain : undefined;
      return {
        id: `${c.link_id}-${c.created_at}-${i}`,
        time: hhmm(c.created_at),
        name: l ? linkTitle(l) : "Link removido",
        slug: l?.slug ?? "—",
        domain: dom ?? c.host ?? "",
        ms: c.redirect_ms ?? null,
        redirected: !c.mode_at_click.startsWith("waiting"),
      };
    });
  }, [recentQ.data, linkById, domainById]);

  /* ── Cliques por domínio ─────────────────────────────────────────── */
  const byDomain = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of series) {
      const l = linkById.get(c.link_id);
      const name =
        (l?.domain_id ? domainById.get(l.domain_id)?.domain : undefined) ??
        c.host ??
        "Sem domínio";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([domain, clicks]) => ({ domain, clicks }))
      .sort((a, b) => b.clicks - a.clicks);
  }, [series, linkById, domainById]);

  /* ── Alertas ─────────────────────────────────────────────────────── */
  const alerts = useMemo(() => {
    const all = buildDashboardAlerts({
      links,
      domains,
      alerts: alertsQ.data ?? [],
      waitingClicksByLink: waitingClicksByLink(series),
    });
    return all.filter((a) => !dismissed.has(a.id));
  }, [links, domains, alertsQ.data, series, dismissed]);

  const criticalCount = alerts.filter((a) => a.level === "critical").length;

  const handleDismiss = useCallback(
    (a: DashboardAlert) => {
      setDismissed((prev) => new Set(prev).add(a.id));
      if (a.rowId) dismissMutation.mutate(a.rowId);
    },
    [dismissMutation],
  );

  const scrollToAlerts = useCallback(() => {
    alertsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const kpiLoading = totalsQ.isLoading;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 md:space-y-6 md:px-8 md:py-7">
        <header>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight md:text-[28px]">
            Painel Operacional
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            O que está acontecendo agora com seus links e domínios
          </p>
        </header>

        <QuickActions onAlerts={scrollToAlerts} alertCount={criticalCount || alerts.length} />

        {/* Alertas críticos vêm antes de tudo */}
        {criticalCount > 0 && (
          <div ref={alertsRef}>
            <AlertsPanel
              alerts={alerts.filter((a) => a.level === "critical")}
              onDismiss={handleDismiss}
            />
          </div>
        )}

        {/* 1 — Visão geral */}
        <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Cliques hoje"
            value={nf(totals?.clicksToday ?? 0)}
            delta={delta(totals?.clicksToday ?? 0, totals?.clicksYesterday ?? 0)}
            deltaLabel="vs. ontem"
            hint="Nenhum acesso até agora"
            loading={kpiLoading}
          />
          <KpiCard
            label="Cliques no mês"
            value={nf(totals?.clicksMonth ?? 0)}
            delta={delta(totals?.clicksMonth ?? 0, totals?.clicksPrevMonth ?? 0)}
            deltaLabel="vs. mês anterior"
            hint="Mês em andamento"
            loading={kpiLoading}
          />
          <KpiCard
            label="Links ativos"
            value={nf(activeLinks)}
            hint="Redirecionando normalmente"
            loading={linksQ.isLoading}
          />
          <KpiCard
            label="Links em espera"
            value={nf(waitingLinks)}
            hint="Mostram a página de espera"
            loading={linksQ.isLoading}
          />
          <KpiCard
            label="Domínios ativos"
            value={nf(activeDomains)}
            hint={domains.length ? `${domains.length} cadastrados` : "Nenhum cadastrado"}
            loading={domainsQ.isLoading}
          />
          <KpiCard
            label="Tempo de redirecionamento"
            value={avgMs ? nf(avgMs) : "—"}
            unit={avgMs ? "ms" : undefined}
            badge={{ label: latency.label, className: latency.className }}
            hint="Média dos acessos de hoje"
            loading={kpiLoading}
          />
        </section>

        {/* 2 — Saúde + 4 — Alertas */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SystemHealth
            items={healthItems}
            checkedAt={totals?.checkedAt}
            loading={kpiLoading}
          />
          <div ref={criticalCount > 0 ? undefined : alertsRef}>
            <AlertsPanel
              alerts={criticalCount > 0 ? alerts.filter((a) => a.level !== "critical") : alerts}
              loading={alertsQ.isLoading && linksQ.isLoading}
              onDismiss={handleDismiss}
            />
          </div>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
          <ClicksOverTime
            clicks={series}
            preset={chart}
            onPreset={setChart}
            loading={seriesQ.isLoading}
            error={seriesQ.isError}
          />
          <ClicksByDomain
            data={byDomain}
            loading={seriesQ.isLoading || domainsQ.isLoading}
            hasDomains={domains.length > 0}
          />
        </div>

        {/* 3 — Atividade recente */}
        <RecentActivity
          items={activity}
          loading={recentQ.isLoading}
          error={recentQ.isError}
        />
      </div>
    </AdminShell>
  );
}
