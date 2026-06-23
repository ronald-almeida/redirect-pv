import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/latency")({
  head: () => ({
    meta: [
      { title: "Latência · Painel" },
      { name: "description", content: "Métricas de latência por slug." },
    ],
  }),
  component: LatencyPage,
});

type CacheStatus = "MEM" | "HIT" | "STALE" | "MISS";
const CACHE_STATUSES: CacheStatus[] = ["MEM", "HIT", "STALE", "MISS"];

type ClickLite = {
  link_id: string;
  redirect_ms: number | null;
  cache_status: string | null;
  created_at: string;
};
type LinkLite = { id: string; slug: string; name: string | null };

type Stats = {
  count: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx];
}

function computeStats(samples: number[]): Stats {
  if (samples.length === 0)
    return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    count: sorted.length,
    avg: Math.round(sum / sorted.length),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function badgeColor(status: string): string {
  switch (status) {
    case "MEM":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "HIT":
      return "bg-sky-500/20 text-sky-400 border-sky-500/30";
    case "STALE":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "MISS":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-neutral-500/20 text-neutral-400 border-neutral-500/30";
  }
}

function p95Color(ms: number): string {
  if (ms === 0) return "text-neutral-500";
  if (ms < 50) return "text-emerald-400";
  if (ms < 100) return "text-sky-400";
  if (ms < 200) return "text-amber-400";
  return "text-red-400";
}

// ─── Live test ──────────────────────────────────────────────────────────────

type ProbeResult = {
  index: number;
  ms: number;
  serverMs: number | null;
  status: number;
  xCache: string | null;
  location: string | null;
  error?: string;
};

async function probeOnce(slug: string, i: number): Promise<ProbeResult> {
  const t0 = performance.now();
  try {
    const res = await fetch(`/r/${encodeURIComponent(slug)}?probe=${i}&t=${Date.now()}`, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { "user-agent-hint": "latency-probe" },
    });
    const ms = Math.round(performance.now() - t0);
    const xCache = res.headers.get("x-cache");
    const timing = res.headers.get("server-timing") || "";
    const m = /redirect;dur=(\d+(?:\.\d+)?)/.exec(timing);
    const serverMs = m ? Math.round(Number(m[1])) : null;
    return {
      index: i,
      ms,
      serverMs,
      status: res.status,
      xCache,
      location: res.headers.get("location"),
    };
  } catch (e) {
    return {
      index: i,
      ms: Math.round(performance.now() - t0),
      serverMs: null,
      status: 0,
      xCache: null,
      location: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─── Historical comparison helpers ──────────────────────────────────────────

function toIso(date: string, endOfDay = false): string {
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${date}T${time}-03:00`).toISOString();
}
function todayBRT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function daysAgoBRT(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function fetchClicksRange(fromIso: string, toIso: string): Promise<ClickLite[]> {
  const all: ClickLite[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from("clicks")
      .select("link_id, redirect_ms, cache_status, created_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error || !data) break;
    all.push(...(data as ClickLite[]));
    if (data.length < PAGE) break;
  }
  return all;
}

function statsByCache(clicks: ClickLite[]): Record<string, Stats> {
  const buckets: Record<string, number[]> = { MEM: [], HIT: [], STALE: [], MISS: [], OTHER: [] };
  for (const c of clicks) {
    if (c.redirect_ms == null) continue;
    const key = (c.cache_status && CACHE_STATUSES.includes(c.cache_status as CacheStatus))
      ? c.cache_status
      : "OTHER";
    buckets[key].push(c.redirect_ms);
  }
  const out: Record<string, Stats> = {};
  for (const k of Object.keys(buckets)) out[k] = computeStats(buckets[k]);
  return out;
}

// ─── Page ───────────────────────────────────────────────────────────────────

function LatencyPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [links, setLinks] = useState<LinkLite[]>([]);
  const [recentClicks, setRecentClicks] = useState<ClickLite[]>([]);
  const [loading, setLoading] = useState(false);

  // Live probe
  const [probeSlug, setProbeSlug] = useState<string>("");
  const [probeN, setProbeN] = useState<number>(20);
  const [probing, setProbing] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);

  // Period stats
  const [from, setFrom] = useState(todayBRT());
  const [to, setTo] = useState(todayBRT());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/login" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function loadAll() {
    setLoading(true);
    try {
      const linksRes = await supabase
        .from("links")
        .select("id, slug, name")
        .order("slug");
      if (linksRes.data) {
        const arr = linksRes.data as LinkLite[];
        setLinks(arr);
        if (!probeSlug && arr.length > 0) setProbeSlug(arr[0].slug);
      }
      const data = await fetchClicksRange(toIso(from), toIso(to, true));
      setRecentClicks(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!checking) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

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

  const liveStatsByCache = useMemo(() => {
    const buckets: Record<string, number[]> = { MEM: [], HIT: [], STALE: [], MISS: [], OTHER: [] };
    for (const r of results) {
      if (r.serverMs == null) continue;
      const key = r.xCache && CACHE_STATUSES.includes(r.xCache as CacheStatus) ? r.xCache : "OTHER";
      buckets[key].push(r.serverMs);
    }
    const out: Record<string, Stats> = {};
    for (const k of Object.keys(buckets)) out[k] = computeStats(buckets[k]);
    return out;
  }, [results]);

  const liveOverall = useMemo(
    () => computeStats(results.map((r) => r.serverMs).filter((v): v is number => v != null)),
    [results],
  );

  const historicalByCache = useMemo(() => statsByCache(recentClicks), [recentClicks]);
  const historicalOverall = useMemo(
    () => computeStats(recentClicks.map((c) => c.redirect_ms).filter((v): v is number => v != null)),
    [recentClicks],
  );

  if (checking) return <div className="container mx-auto p-8">Carregando…</div>;

  const stabilized =
    results.length >= 5 &&
    results.slice(-5).every((r) => r.xCache === "MEM" || r.xCache === "HIT");
  const p95Live = liveOverall.p95;
  const passed = results.length >= 10 && stabilized && p95Live < 100;

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Latência de Redirect</h1>
          <p className="text-sm text-muted-foreground">
            Breakdown por <code>X-Cache</code> usando <code>Server-Timing: redirect;dur=…</code> (tempo do Worker, não do browser).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin">← Voltar</Link>
          </Button>
        </div>
      </div>

      {/* ─── Cache validation note ─── */}
      <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
        <div className="text-sm">
          <span className="font-medium text-emerald-400">✓ Cache-Control: no-store NÃO bloqueia o Edge Cache interno.</span>{" "}
          <span className="text-muted-foreground">
            O header <code>no-store</code> está apenas na resposta 302 (impede o browser/CDN de cachear o redirect, comportamento desejado).
            O cache interno do Worker usa <code>caches.default.put()</code> com uma <em>Response própria</em> que carrega{" "}
            <code>Cache-Control: public, max-age=86400</code> — totalmente independente da resposta enviada ao usuário.
            O cache em memória do isolate (camada MEM) também é independente. Veja <code>src/lib/redirect-handler.ts</code> linha ~120.
          </span>
        </div>
      </Card>

      {/* ─── Live 20-hit probe ─── */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="probe-slug">Slug para testar</Label>
            <select
              id="probe-slug"
              value={probeSlug}
              onChange={(e) => setProbeSlug(e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {links.map((l) => (
                <option key={l.id} value={l.slug}>
                  /{l.slug} {l.name ? `· ${l.name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <Label htmlFor="probe-n">Nº de hits</Label>
            <Input
              id="probe-n"
              type="number"
              min={1}
              max={100}
              value={probeN}
              onChange={(e) => setProbeN(Math.max(1, Math.min(100, Number(e.target.value) || 20)))}
            />
          </div>
          <Button onClick={() => void runProbe()} disabled={probing || !probeSlug}>
            {probing ? `Testando ${results.length}/${probeN}…` : `Rodar ${probeN} hits`}
          </Button>
        </div>

        {results.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              {results.map((r) => (
                <span
                  key={r.index}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-mono ${badgeColor(r.xCache || "")}`}
                  title={`hit ${r.index} · navegador ${r.ms}ms · server ${r.serverMs ?? "?"}ms · status ${r.status}`}
                >
                  #{r.index} {r.xCache || "?"} · {r.serverMs ?? "?"}ms
                </span>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <StatTile label="GERAL" stats={liveOverall} highlight />
              {CACHE_STATUSES.map((s) => (
                <StatTile key={s} label={s} stats={liveStatsByCache[s]} status={s} />
              ))}
            </div>

            <div
              className={`rounded-md border p-3 text-sm ${
                passed
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
            >
              {passed ? (
                <>✓ <strong>Aprovado</strong>: p95 = {p95Live}ms (&lt; 100ms) e os últimos 5 hits ficaram em MEM/HIT.</>
              ) : (
                <>
                  {results.length < probeN
                    ? `Em andamento (${results.length}/${probeN})…`
                    : `Atenção: p95 = ${p95Live}ms · estabilizado em MEM/HIT? ${stabilized ? "sim" : "não"}.`}
                </>
              )}
            </div>
          </>
        )}
      </Card>

      {/* ─── Historical breakdown ─── */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="hf">De</Label>
            <Input id="hf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ht">Até</Label>
            <Input id="ht" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => void loadAll()} disabled={loading}>
            {loading ? "Carregando…" : "Recarregar"}
          </Button>
          <div className="text-xs text-muted-foreground">
            {recentClicks.length} cliques no período · fonte: <code>clicks.redirect_ms</code> + <code>clicks.cache_status</code>.
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatTile label="GERAL" stats={historicalOverall} highlight />
          {CACHE_STATUSES.map((s) => (
            <StatTile key={s} label={s} stats={historicalByCache[s]} status={s} />
          ))}
        </div>

        {(historicalByCache["OTHER"]?.count ?? 0) > 0 && (
          <div className="text-xs text-muted-foreground">
            {historicalByCache["OTHER"].count} cliques antigos sem <code>cache_status</code> registrado (anteriores à migração).
          </div>
        )}
      </Card>
    </div>
  );
}

function StatTile({
  label,
  stats,
  status,
  highlight,
}: {
  label: string;
  stats: Stats | undefined;
  status?: string;
  highlight?: boolean;
}) {
  const s = stats ?? { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  return (
    <div
      className={`rounded-md border p-3 ${
        highlight
          ? "border-white/20 bg-white/5"
          : status
            ? badgeColor(status)
            : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 font-mono text-xs space-y-0.5">
        <div>
          n=<span className="tabular-nums">{s.count}</span>
        </div>
        <div>p50 <span className="tabular-nums">{s.p50}ms</span></div>
        <div>
          p95 <span className={`tabular-nums font-semibold ${p95Color(s.p95)}`}>{s.p95}ms</span>
        </div>
        <div>p99 <span className="tabular-nums">{s.p99}ms</span></div>
        <div className="opacity-70">avg {s.avg}ms · {s.min}–{s.max}</div>
      </div>
    </div>
  );
}
