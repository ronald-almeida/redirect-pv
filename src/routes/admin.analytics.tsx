import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell, type AdminPeriod } from "@/components/admin/AdminShell";
import { rangeForPreset, type DateRange } from "@/lib/date-range";
import { type ClickRow, aggregate, countryFlag, topEntries } from "@/lib/analytics";
import { TrendingUp, Globe, Smartphone, Monitor } from "lucide-react";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics · CloakPanel" }] }),
  component: AnalyticsPage,
});

function periodToRange(p: AdminPeriod): DateRange {
  if (p === "24h") return rangeForPreset("today");
  if (p === "7d") return rangeForPreset("7d");
  if (p === "30d") return rangeForPreset("30d");
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 90);
  return { start, end, preset: "custom" };
}

interface LinkLite { id: string; slug: string; name: string | null }

const chartTheme = {
  axis: "#3F3F46",
  grid: "#1C1C20",
  tooltipBg: "#0F0F10",
  tooltipBorder: "#27272A",
};

const TooltipStyle = {
  background: chartTheme.tooltipBg,
  border: `1px solid ${chartTheme.tooltipBorder}`,
  borderRadius: 8,
  fontSize: 11,
  padding: "6px 10px",
};

function AnalyticsPage() {
  const [period, setPeriod] = useState<AdminPeriod>("7d");
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [links, setLinks] = useState<LinkLite[]>([]);
  const [latency, setLatency] = useState<{ created_at: string; redirect_ms: number | null }[]>([]);

  const range = useMemo(() => periodToRange(period), [period]);

  useEffect(() => { void load(); }, [range.start?.getTime()]);

  async function load() {
    if (!range.start) return;
    const endIso = (range.end ?? new Date()).toISOString();
    const [c, l, lat] = await Promise.all([
      supabase.from("clicks")
        .select("link_id, mode_at_click, country, device, is_vpn, utm_source, created_at")
        .gte("created_at", range.start.toISOString()).lt("created_at", endIso)
        .order("created_at", { ascending: false }).limit(10000),
      supabase.from("links").select("id, slug, name"),
      supabase.from("clicks")
        .select("created_at, redirect_ms")
        .gte("created_at", range.start.toISOString()).lt("created_at", endIso)
        .not("redirect_ms", "is", null)
        .order("created_at", { ascending: false }).limit(10000),
    ]);
    setClicks((c.data ?? []) as ClickRow[]);
    setLinks((l.data ?? []) as LinkLite[]);
    setLatency((lat.data ?? []) as { created_at: string; redirect_ms: number }[]);
  }

  const data = useMemo(() => {
    const start = range.start?.getTime() ?? 0;
    const end = (range.end ?? new Date()).getTime();
    const days = Math.max(1, Math.ceil((end - start) / 86_400_000));
    const buckets = Math.min(days, 30);
    const labels: string[] = [];
    const volume: number[] = new Array(buckets).fill(0);
    const successCount: number[] = new Array(buckets).fill(0);

    for (let i = 0; i < buckets; i++) {
      const d = new Date(start + ((end - start) * (i + 0.5)) / buckets);
      labels.push(d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));
    }

    for (const c of clicks) {
      const t = new Date(c.created_at).getTime();
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor(((t - start) / (end - start)) * buckets)));
      volume[idx]++;
      if (c.mode_at_click.startsWith("real") || c.mode_at_click.startsWith("decoy")) successCount[idx]++;
    }

    const volumeData = labels.map((day, i) => ({ day, cliques: volume[i], success: successCount[i] }));

    // Latency over time (p50 + p95)
    const latBuckets: number[][] = Array.from({ length: buckets }, () => []);
    for (const r of latency) {
      if (r.redirect_ms == null) continue;
      const t = new Date(r.created_at).getTime();
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor(((t - start) / (end - start)) * buckets)));
      latBuckets[idx].push(r.redirect_ms);
    }
    const pct = (arr: number[], p: number) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
    };
    const latData = labels.map((day, i) => ({ day, p50: pct(latBuckets[i], 50), p95: pct(latBuckets[i], 95) }));

    const agg = aggregate(clicks);
    const allCountries: Record<string, number> = {};
    const allUtm: Record<string, number> = {};
    let real = 0, decoy = 0, waiting = 0, mobile = 0, desktop = 0;
    const perLink: Record<string, number> = {};
    for (const c of clicks) {
      const baseMode = c.mode_at_click.split(":")[0];
      if (baseMode === "real") real++;
      else if (baseMode === "decoy") decoy++;
      else if (baseMode === "waiting") waiting++;
      if (c.country) allCountries[c.country] = (allCountries[c.country] ?? 0) + 1;
      if (c.device === "mobile") mobile++;
      else if (c.device === "desktop") desktop++;
      if (c.utm_source) allUtm[c.utm_source] = (allUtm[c.utm_source] ?? 0) + 1;
      perLink[c.link_id] = (perLink[c.link_id] ?? 0) + 1;
    }
    const linkMap = new Map(links.map((l) => [l.id, l]));
    const topLinks = topEntries(perLink, 7).map(([id, n]) => ({
      slug: linkMap.get(id)?.slug ?? id.slice(0, 6),
      name: linkMap.get(id)?.name ?? null,
      count: n,
    }));
    const topCountries = topEntries(allCountries, 6);
    const total = clicks.length || 1;
    const successRate = ((real + decoy) / total) * 100;

    const distribution = [
      { name: "Real", value: real, color: "#34D399" },
      { name: "Isca", value: decoy, color: "#FBBF24" },
      { name: "Espera", value: waiting, color: "#71717A" },
    ];

    return { volumeData, latData, distribution, topLinks, topCountries, successRate, mobile, desktop, total: clicks.length, agg };
  }, [clicks, latency, links, range.start, range.end]);

  return (
    <AdminShell period={period} onPeriod={setPeriod}>
      <div className="px-4 md:px-6 py-6 space-y-5">
        {/* Top row */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card title="Volume de cliques" subtitle={`${data.total.toLocaleString("pt-BR")} cliques no período`} className="lg:col-span-2">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.volumeData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g-vol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366F1" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis dataKey="day" stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "#71717A" }} />
                  <YAxis stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "#71717A" }} width={32} />
                  <Tooltip contentStyle={TooltipStyle} cursor={{ stroke: "#3F3F46", strokeDasharray: 3 }} />
                  <Area type="monotone" dataKey="cliques" stroke="#6366F1" strokeWidth={1.75} fill="url(#g-vol)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Distribuição por tipo" subtitle="Real vs Isca vs Espera">
            <div className="h-56 flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.distribution} dataKey="value" innerRadius={50} outerRadius={80} stroke="none" paddingAngle={2}>
                    {data.distribution.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TooltipStyle} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={6}
                    formatter={(v) => <span className="text-[11px] text-muted-foreground">{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>

        {/* Second row */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card title="Latência ao longo do tempo" subtitle="p50 vs p95 (ms)" className="lg:col-span-2">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.latData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis dataKey="day" stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "#71717A" }} />
                  <YAxis stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "#71717A" }} width={32} />
                  <Tooltip contentStyle={TooltipStyle} />
                  <Legend iconType="circle" iconSize={6} formatter={(v) => <span className="text-[11px] text-muted-foreground">{v}</span>} />
                  <Line type="monotone" dataKey="p50" stroke="#22D3EE" strokeWidth={1.75} dot={false} />
                  <Line type="monotone" dataKey="p95" stroke="#F472B6" strokeWidth={1.75} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Taxa de sucesso" subtitle="Real + Isca / Total">
            <div className="flex flex-col items-center justify-center h-56 gap-2">
              <div className="relative">
                <svg width="160" height="160" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="64" stroke="#1C1C20" strokeWidth="10" fill="none" />
                  <circle
                    cx="80" cy="80" r="64"
                    stroke={data.successRate >= 95 ? "#34D399" : data.successRate >= 80 ? "#FBBF24" : "#F43F5E"}
                    strokeWidth="10" fill="none" strokeLinecap="round"
                    strokeDasharray={`${(data.successRate / 100) * 402} 402`}
                    transform="rotate(-90 80 80)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-semibold tabular-nums">{data.successRate.toFixed(1)}%</span>
                  <span className="text-[11px] text-muted-foreground">{data.total.toLocaleString("pt-BR")} cliques</span>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Third row */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card title="Evolução diária" subtitle="Cliques por bucket" className="lg:col-span-2">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.volumeData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis dataKey="day" stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "#71717A" }} />
                  <YAxis stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "#71717A" }} width={32} />
                  <Tooltip contentStyle={TooltipStyle} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                  <Bar dataKey="cliques" fill="#6366F1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Top slugs" subtitle="Mais acessados no período">
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {data.topLinks.length === 0 && <p className="text-xs text-muted-foreground">Sem dados</p>}
              {data.topLinks.map((l, i) => {
                const max = data.topLinks[0]?.count || 1;
                const pct = (l.count / max) * 100;
                return (
                  <div key={l.slug} className="group">
                    <div className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 text-[10px] tabular-nums text-muted-foreground">{i + 1}</span>
                        <span className="font-mono truncate">/{l.slug}</span>
                      </div>
                      <span className="tabular-nums font-medium">{l.count}</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-foreground/60" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>

        {/* Fourth row */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card title="Top países" subtitle="Origem do tráfego" icon={Globe}>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.topCountries.length === 0 && <p className="text-xs text-muted-foreground">Sem dados</p>}
              {data.topCountries.map(([cc, n]) => (
                <div key={cc} className="flex items-center justify-between text-[12.5px] border-b border-border last:border-0 pb-1.5 last:pb-0">
                  <span className="flex items-center gap-2">
                    <span className="text-base leading-none">{countryFlag(cc)}</span>
                    <span className="font-mono text-muted-foreground">{cc}</span>
                  </span>
                  <span className="tabular-nums font-medium">{n}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Dispositivos" subtitle="Mobile vs Desktop" icon={TrendingUp}>
            {data.mobile + data.desktop === 0 ? (
              <p className="text-xs text-muted-foreground">Sem dados</p>
            ) : (
              <div className="space-y-4">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-secondary">
                  <div className="bg-indigo-500" style={{ width: `${(data.mobile / (data.mobile + data.desktop)) * 100}%` }} />
                  <div className="bg-fuchsia-400" style={{ width: `${(data.desktop / (data.mobile + data.desktop)) * 100}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 p-3">
                    <Smartphone className="h-4 w-4 text-indigo-400" />
                    <div className="flex-1">
                      <div className="text-[11px] text-muted-foreground">Mobile</div>
                      <div className="text-lg font-semibold tabular-nums">{data.mobile}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 p-3">
                    <Monitor className="h-4 w-4 text-fuchsia-400" />
                    <div className="flex-1">
                      <div className="text-[11px] text-muted-foreground">Desktop</div>
                      <div className="text-lg font-semibold tabular-nums">{data.desktop}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </section>
      </div>
    </AdminShell>
  );
}

function Card({ title, subtitle, children, className, icon: Icon }: {
  title: string; subtitle?: string; children: React.ReactNode; className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card p-4 ${className ?? ""}`}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
            <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
          </div>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
