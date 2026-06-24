import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell, type AdminPeriod } from "@/components/admin/AdminShell";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { rangeForPreset, type DateRange } from "@/lib/date-range";
import { Activity, Zap, Play, Database } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/latency")({
  head: () => ({ meta: [{ title: "Latência · CloakPanel" }] }),
  component: LatencyPage,
});

type CacheStatus = "MEM" | "HIT" | "STALE" | "MISS";
const CACHE_STATUSES: CacheStatus[] = ["MEM", "HIT", "STALE", "MISS"];

interface ClickLite {
  link_id: string;
  redirect_ms: number | null;
  cache_status: string | null;
  created_at: string;
}
interface LinkLite { id: string; slug: string; name: string | null }

interface Stats { count: number; avg: number; p50: number; p95: number; p99: number; min: number; max: number }

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
function computeStats(samples: number[]): Stats {
  if (!samples.length) return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    count: sorted.length, avg: Math.round(sum / sorted.length),
    p50: percentile(sorted, 50), p95: percentile(sorted, 95), p99: percentile(sorted, 99),
    min: sorted[0], max: sorted[sorted.length - 1],
  };
}

function periodToRange(p: AdminPeriod): DateRange {
  if (p === "24h") return rangeForPreset("today");
  if (p === "7d") return rangeForPreset("7d");
  if (p === "30d") return rangeForPreset("30d");
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 90);
  return { start, end, preset: "custom" };
}

type ProbeResult = { index: number; ms: number; serverMs: number | null; status: number; xCache: string | null };

async function probeOnce(slug: string, i: number): Promise<ProbeResult> {
  const t0 = performance.now();
  try {
    const res = await fetch(`/r/${encodeURIComponent(slug)}?probe=${i}&t=${Date.now()}`, {
      method: "GET", redirect: "manual", cache: "no-store",
    });
    const ms = Math.round(performance.now() - t0);
    const timing = res.headers.get("server-timing") || "";
    const m = /redirect;dur=(\d+(?:\.\d+)?)/.exec(timing);
    return {
      index: i, ms, serverMs: m ? Math.round(Number(m[1])) : null,
      status: res.status, xCache: res.headers.get("x-cache"),
    };
  } catch {
    return { index: i, ms: Math.round(performance.now() - t0), serverMs: null, status: 0, xCache: null };
  }
}

const CACHE_COLORS: Record<CacheStatus, string> = {
  MEM: "#34D399", HIT: "#38BDF8", STALE: "#FBBF24", MISS: "#F43F5E",
};

const TooltipStyle = {
  background: "#0F0F10", border: "1px solid #27272A", borderRadius: 8, fontSize: 11, padding: "6px 10px",
};

function LatencyPage() {
  const [period, setPeriod] = useState<AdminPeriod>("24h");
  const [clicks, setClicks] = useState<ClickLite[]>([]);
  const [links, setLinks] = useState<LinkLite[]>([]);
  const [probeSlug, setProbeSlug] = useState("");
  const [probeN] = useState(20);
  const [probing, setProbing] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);

  const range = useMemo(() => periodToRange(period), [period]);

  useEffect(() => { void load(); }, [range.start?.getTime()]);

  async function load() {
    if (!range.start) return;
    const endIso = (range.end ?? new Date()).toISOString();
    const all: ClickLite[] = [];
    const PAGE = 1000;
    for (let p = 0; p < 20; p++) {
      const { data, error } = await supabase
        .from("clicks")
        .select("link_id, redirect_ms, cache_status, created_at")
        .gte("created_at", range.start.toISOString())
        .lt("created_at", endIso)
        .not("redirect_ms", "is", null)
        .order("created_at", { ascending: false })
        .range(p * PAGE, p * PAGE + PAGE - 1);
      if (error || !data || !data.length) break;
      all.push(...(data as ClickLite[]));
      if (data.length < PAGE) break;
    }
    setClicks(all);
    const { data: lk } = await supabase.from("links").select("id, slug, name").order("slug");
    const arr = (lk ?? []) as LinkLite[];
    setLinks(arr);
    if (!probeSlug && arr.length > 0) setProbeSlug(arr[0].slug);
  }

  async function runProbe() {
    if (!probeSlug) return;
    setProbing(true);
    setResults([]);
    const out: ProbeResult[] = [];
    for (let i = 1; i <= probeN; i++) {
      const r = await probeOnce(probeSlug, i);
      out.push(r);
      setResults([...out]);
    }
    setProbing(false);
  }

  const data = useMemo(() => {
    const samples = clicks.map((c) => c.redirect_ms!).filter((v): v is number => v != null);
    const overall = computeStats(samples);
    const byCache: Record<CacheStatus, Stats> = { MEM: computeStats([]), HIT: computeStats([]), STALE: computeStats([]), MISS: computeStats([]) };
    const countByCache: Record<CacheStatus, number> = { MEM: 0, HIT: 0, STALE: 0, MISS: 0 };
    const cacheBuckets: Record<CacheStatus, number[]> = { MEM: [], HIT: [], STALE: [], MISS: [] };
    for (const c of clicks) {
      const s = (c.cache_status as CacheStatus) ?? null;
      if (s && CACHE_STATUSES.includes(s) && c.redirect_ms != null) {
        cacheBuckets[s].push(c.redirect_ms);
        countByCache[s]++;
      }
    }
    for (const s of CACHE_STATUSES) byCache[s] = computeStats(cacheBuckets[s]);

    // hourly buckets
    const start = range.start?.getTime() ?? 0;
    const end = (range.end ?? new Date()).getTime();
    const buckets = 24;
    const labels: string[] = [];
    const hourly: { label: string; p50: number; p95: number }[] = [];
    const stack: { label: string; MEM: number; HIT: number; STALE: number; MISS: number }[] = [];
    const cacheRatio: { label: string; ratio: number }[] = [];

    for (let i = 0; i < buckets; i++) {
      const d = new Date(start + ((end - start) * (i + 0.5)) / buckets);
      labels.push(d.toLocaleString("pt-BR", { day: "2-digit", hour: "2-digit" }));
    }

    const perBucket: Record<CacheStatus, number[][]> = {
      MEM: Array.from({ length: buckets }, () => []),
      HIT: Array.from({ length: buckets }, () => []),
      STALE: Array.from({ length: buckets }, () => []),
      MISS: Array.from({ length: buckets }, () => []),
    };
    const allInBucket: number[][] = Array.from({ length: buckets }, () => []);

    for (const c of clicks) {
      if (c.redirect_ms == null) continue;
      const t = new Date(c.created_at).getTime();
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor(((t - start) / (end - start)) * buckets)));
      allInBucket[idx].push(c.redirect_ms);
      const s = c.cache_status as CacheStatus;
      if (CACHE_STATUSES.includes(s)) perBucket[s][idx].push(c.redirect_ms);
    }

    for (let i = 0; i < buckets; i++) {
      hourly.push({
        label: labels[i],
        p50: percentile([...allInBucket[i]].sort((a, b) => a - b), 50),
        p95: percentile([...allInBucket[i]].sort((a, b) => a - b), 95),
      });
      stack.push({
        label: labels[i],
        MEM: perBucket.MEM[i].length, HIT: perBucket.HIT[i].length,
        STALE: perBucket.STALE[i].length, MISS: perBucket.MISS[i].length,
      });
      const totalI = stack[i].MEM + stack[i].HIT + stack[i].STALE + stack[i].MISS;
      const hits = stack[i].MEM + stack[i].HIT;
      cacheRatio.push({ label: labels[i], ratio: totalI ? Math.round((hits / totalI) * 100) : 0 });
    }

    const totalCount = clicks.length || 1;
    return { overall, byCache, countByCache, hourly, stack, cacheRatio, totalCount };
  }, [clicks, range.start, range.end]);

  const liveOverall = computeStats(results.map((r) => r.serverMs).filter((v): v is number => v != null));
  const stabilized = results.length >= 5 && results.slice(-5).every((r) => r.xCache === "MEM" || r.xCache === "HIT");

  return (
    <AdminShell period={period} onPeriod={setPeriod}>
      <div className="px-4 md:px-6 py-6 space-y-5">
        {/* Stat tiles */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile label="p50" value={data.overall.p50} accent />
          <StatTile label="p95" value={data.overall.p95} highlight={data.overall.p95 < 100 ? "ok" : data.overall.p95 < 200 ? "warn" : "bad"} />
          <StatTile label="p99" value={data.overall.p99} />
          <StatTile label="Média" value={data.overall.avg} />
          <StatTile label="Melhor" value={data.overall.min} variant="success" />
          <StatTile label="Pior" value={data.overall.max} variant="danger" />
        </section>

        {/* Cache breakdown */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {CACHE_STATUSES.map((s) => {
            const stat = data.byCache[s];
            const total = data.totalCount;
            const pct = total ? ((data.countByCache[s] / total) * 100).toFixed(1) : "0.0";
            return (
              <div key={s} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <StatusBadge kind={s} />
                  <span className="text-[10.5px] text-muted-foreground tabular-nums">{pct}%</span>
                </div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: CACHE_COLORS[s] }}>
                  {data.countByCache[s].toLocaleString("pt-BR")}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10.5px]">
                  <Kv k="p50" v={`${stat.p50}ms`} />
                  <Kv k="p95" v={`${stat.p95}ms`} />
                  <Kv k="p99" v={`${stat.p99}ms`} />
                </div>
              </div>
            );
          })}
        </section>

        {/* Latency by hour + Cache hit ratio */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card title="Latência por hora" subtitle="p50 e p95 ao longo do tempo" className="lg:col-span-2">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.hourly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#1C1C20" vertical={false} />
                  <XAxis dataKey="label" stroke="#3F3F46" tick={{ fontSize: 10, fill: "#71717A" }} />
                  <YAxis stroke="#3F3F46" tick={{ fontSize: 10, fill: "#71717A" }} width={32} />
                  <Tooltip contentStyle={TooltipStyle} />
                  <Legend iconType="circle" iconSize={6} formatter={(v) => <span className="text-[11px] text-muted-foreground">{v}</span>} />
                  <Line dataKey="p50" stroke="#22D3EE" strokeWidth={1.75} dot={false} />
                  <Line dataKey="p95" stroke="#F472B6" strokeWidth={1.75} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Taxa de acerto do cache" subtitle="(MEM + HIT) / total" icon={Database}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.cacheRatio} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g-ratio" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34D399" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1C1C20" vertical={false} />
                  <XAxis dataKey="label" stroke="#3F3F46" tick={{ fontSize: 10, fill: "#71717A" }} />
                  <YAxis stroke="#3F3F46" tick={{ fontSize: 10, fill: "#71717A" }} width={28} domain={[0, 100]} />
                  <Tooltip contentStyle={TooltipStyle} formatter={(v) => [`${v}%`, "Taxa de acerto"]} />
                  <Area dataKey="ratio" stroke="#34D399" strokeWidth={1.75} fill="url(#g-ratio)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>

        {/* Stacked cache status */}
        <Card title="Cliques por status de cache" subtitle="Distribuição empilhada">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stack} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#1C1C20" vertical={false} />
                <XAxis dataKey="label" stroke="#3F3F46" tick={{ fontSize: 10, fill: "#71717A" }} />
                <YAxis stroke="#3F3F46" tick={{ fontSize: 10, fill: "#71717A" }} width={32} />
                <Tooltip contentStyle={TooltipStyle} />
                <Legend iconType="square" iconSize={8} formatter={(v) => <span className="text-[11px] text-muted-foreground">{v}</span>} />
                {CACHE_STATUSES.map((s) => (
                  <Bar key={s} dataKey={s} stackId="x" fill={CACHE_COLORS[s]} radius={[0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Live probe */}
        <Card title="Teste de latência ao vivo" subtitle="20 requisições reais contra o slug selecionado" icon={Zap}>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Slug</label>
              <select
                value={probeSlug}
                onChange={(e) => setProbeSlug(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-secondary px-2 text-[12.5px] outline-none focus:border-accent"
              >
                {links.map((l) => (
                  <option key={l.id} value={l.slug}>/{l.slug} {l.name ? `· ${l.name}` : ""}</option>
                ))}
              </select>
            </div>
            <Button onClick={() => void runProbe()} disabled={probing || !probeSlug} className="gap-1.5">
              <Play className="h-3.5 w-3.5" />
              {probing ? `Testando ${results.length}/${probeN}…` : `Rodar ${probeN} hits`}
            </Button>
          </div>

          {results.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {results.map((r) => (
                  <span
                    key={r.index}
                    className="inline-flex items-center gap-1 rounded border border-border bg-secondary/50 px-1.5 py-0.5 font-mono text-[10.5px]"
                    title={`hit ${r.index} · ${r.serverMs ?? "?"}ms`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: CACHE_COLORS[(r.xCache as CacheStatus) ?? "MISS"] }} />
                    #{r.index} {r.xCache || "?"} · {r.serverMs ?? "?"}ms
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                <StatTile label="GERAL p50" value={liveOverall.p50} compact />
                <StatTile label="GERAL p95" value={liveOverall.p95} compact highlight={liveOverall.p95 < 100 ? "ok" : "warn"} />
                <StatTile label="GERAL p99" value={liveOverall.p99} compact />
                <StatTile label="Média" value={liveOverall.avg} compact />
                <StatTile label="Pior" value={liveOverall.max} compact variant="danger" />
              </div>
              <div className={cn("mt-3 rounded-md border px-3 py-2 text-[12px]",
                stabilized && liveOverall.p95 < 100
                  ? "border-[--success]/30 bg-[--success]/8 text-[--success]"
                  : "border-warning/30 bg-warning/8 text-warning")}>
                {stabilized && liveOverall.p95 < 100
                  ? `✓ Aprovado: p95 = ${liveOverall.p95}ms e últimos 5 hits estabilizaram em MEM/HIT.`
                  : `Em análise: p95 = ${liveOverall.p95}ms · estabilizado em MEM/HIT: ${stabilized ? "sim" : "não"}.`}
              </div>
            </>
          )}
        </Card>
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

function StatTile({
  label, value, accent, highlight, variant, compact,
}: {
  label: string; value: number; accent?: boolean;
  highlight?: "ok" | "warn" | "bad"; variant?: "success" | "danger"; compact?: boolean;
}) {
  const color =
    highlight === "ok" ? "text-[--success]" :
    highlight === "warn" ? "text-warning" :
    highlight === "bad" ? "text-destructive" :
    variant === "success" ? "text-[--success]" :
    variant === "danger" ? "text-destructive" :
    accent ? "text-foreground" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        <Activity className="h-3 w-3" />
        {label}
      </div>
      <div className={cn("mt-1 font-semibold tabular-nums tracking-tight", compact ? "text-lg" : "text-2xl", color)}>
        {value}<span className="text-[12px] text-muted-foreground ml-0.5">ms</span>
      </div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-border bg-secondary/40 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="tabular-nums text-[11px] font-medium">{v}</div>
    </div>
  );
}
