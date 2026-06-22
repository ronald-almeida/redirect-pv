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

type ClickLite = {
  link_id: string;
  redirect_ms: number | null;
  created_at: string;
};
type LinkLite = { id: string; slug: string; name: string | null };

type Stats = {
  count: number;
  avg: number;
  p50: number;
  p95: number;
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
    return { count: 0, avg: 0, p50: 0, p95: 0, min: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    count: sorted.length,
    avg: Math.round(sum / sorted.length),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function toIso(date: string, endOfDay = false): string {
  // BRT (America/Sao_Paulo, UTC-3). Build an ISO timestamp at boundaries.
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${date}T${time}-03:00`).toISOString();
}

function todayBRT(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function daysAgoBRT(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

async function fetchClicksRange(
  fromIso: string,
  toIso: string,
): Promise<ClickLite[]> {
  const all: ClickLite[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from("clicks")
      .select("link_id, redirect_ms, created_at")
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

function aggregateBySlug(
  clicks: ClickLite[],
  links: LinkLite[],
): Array<{ slug: string; name: string | null; stats: Stats }> {
  const linkById = new Map(links.map((l) => [l.id, l]));
  const buckets = new Map<string, number[]>();
  for (const c of clicks) {
    if (c.redirect_ms == null) continue;
    const arr = buckets.get(c.link_id) ?? [];
    arr.push(c.redirect_ms);
    buckets.set(c.link_id, arr);
  }
  const out: Array<{ slug: string; name: string | null; stats: Stats }> = [];
  for (const [linkId, samples] of buckets) {
    const link = linkById.get(linkId);
    if (!link) continue;
    out.push({
      slug: link.slug,
      name: link.name,
      stats: computeStats(samples),
    });
  }
  out.sort((a, b) => b.stats.count - a.stats.count);
  return out;
}

function deltaCell(after: number, before: number) {
  if (before === 0 && after === 0) return <span className="text-muted-foreground">—</span>;
  if (before === 0) return <span className="text-muted-foreground">novo</span>;
  const diff = after - before;
  const pct = Math.round((diff / before) * 100);
  const better = diff < 0;
  return (
    <span className={better ? "text-emerald-500" : diff > 0 ? "text-red-500" : "text-muted-foreground"}>
      {diff > 0 ? "+" : ""}
      {diff} ms ({pct > 0 ? "+" : ""}
      {pct}%)
    </span>
  );
}

function LatencyPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<LinkLite[]>([]);
  const [beforeClicks, setBeforeClicks] = useState<ClickLite[]>([]);
  const [afterClicks, setAfterClicks] = useState<ClickLite[]>([]);

  // Default: "before" = 7 dias atrás → ontem; "after" = hoje
  const [beforeFrom, setBeforeFrom] = useState(daysAgoBRT(7));
  const [beforeTo, setBeforeTo] = useState(daysAgoBRT(1));
  const [afterFrom, setAfterFrom] = useState(todayBRT());
  const [afterTo, setAfterTo] = useState(todayBRT());

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
      if (linksRes.data) setLinks(linksRes.data as LinkLite[]);
      const [b, a] = await Promise.all([
        fetchClicksRange(toIso(beforeFrom), toIso(beforeTo, true)),
        fetchClicksRange(toIso(afterFrom), toIso(afterTo, true)),
      ]);
      setBeforeClicks(b);
      setAfterClicks(a);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!checking) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  const beforeBySlug = useMemo(
    () => aggregateBySlug(beforeClicks, links),
    [beforeClicks, links],
  );
  const afterBySlug = useMemo(
    () => aggregateBySlug(afterClicks, links),
    [afterClicks, links],
  );

  const allSlugs = useMemo(() => {
    const set = new Set<string>();
    beforeBySlug.forEach((r) => set.add(r.slug));
    afterBySlug.forEach((r) => set.add(r.slug));
    return Array.from(set).sort();
  }, [beforeBySlug, afterBySlug]);

  const rows = useMemo(() => {
    const bMap = new Map(beforeBySlug.map((r) => [r.slug, r]));
    const aMap = new Map(afterBySlug.map((r) => [r.slug, r]));
    return allSlugs.map((slug) => ({
      slug,
      name: bMap.get(slug)?.name ?? aMap.get(slug)?.name ?? null,
      before:
        bMap.get(slug)?.stats ??
        ({ count: 0, avg: 0, p50: 0, p95: 0, min: 0, max: 0 } as Stats),
      after:
        aMap.get(slug)?.stats ??
        ({ count: 0, avg: 0, p50: 0, p95: 0, min: 0, max: 0 } as Stats),
    }));
  }, [allSlugs, beforeBySlug, afterBySlug]);

  const totalBefore = useMemo(
    () => computeStats(beforeClicks.map((c) => c.redirect_ms).filter((v): v is number => v != null)),
    [beforeClicks],
  );
  const totalAfter = useMemo(
    () => computeStats(afterClicks.map((c) => c.redirect_ms).filter((v): v is number => v != null)),
    [afterClicks],
  );

  if (checking) {
    return <div className="container mx-auto p-8">Carregando…</div>;
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Latência por slug</h1>
          <p className="text-sm text-muted-foreground">
            Compare a latência de redirecionamento entre dois períodos (BRT).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin">← Voltar</Link>
          </Button>
          <Button onClick={() => void loadAll()} disabled={loading}>
            {loading ? "Carregando…" : "Atualizar"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="font-medium">Período ANTES</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="bf">De</Label>
              <Input id="bf" type="date" value={beforeFrom} onChange={(e) => setBeforeFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bt">Até</Label>
              <Input id="bt" type="date" value={beforeTo} onChange={(e) => setBeforeTo(e.target.value)} />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {totalBefore.count} cliques · avg {totalBefore.avg}ms · p50 {totalBefore.p50}ms · p95 {totalBefore.p95}ms
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="font-medium">Período DEPOIS</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="af">De</Label>
              <Input id="af" type="date" value={afterFrom} onChange={(e) => setAfterFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="at">Até</Label>
              <Input id="at" type="date" value={afterTo} onChange={(e) => setAfterTo(e.target.value)} />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {totalAfter.count} cliques · avg {totalAfter.avg}ms · p50 {totalAfter.p50}ms · p95 {totalAfter.p95}ms
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">Cliques (A/D)</th>
              <th className="px-3 py-2">avg antes</th>
              <th className="px-3 py-2">avg depois</th>
              <th className="px-3 py-2">Δ avg</th>
              <th className="px-3 py-2">p50 antes</th>
              <th className="px-3 py-2">p50 depois</th>
              <th className="px-3 py-2">p95 antes</th>
              <th className="px-3 py-2">p95 depois</th>
              <th className="px-3 py-2">min/max depois</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                  {loading ? "Carregando…" : "Sem dados nos períodos selecionados."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.slug} className="border-t border-border/50">
                <td className="px-3 py-2 font-mono">
                  {r.slug}
                  {r.name ? <span className="ml-2 text-xs text-muted-foreground">{r.name}</span> : null}
                </td>
                <td className="px-3 py-2">
                  {r.before.count} / {r.after.count}
                </td>
                <td className="px-3 py-2">{r.before.avg} ms</td>
                <td className="px-3 py-2">{r.after.avg} ms</td>
                <td className="px-3 py-2">{deltaCell(r.after.avg, r.before.avg)}</td>
                <td className="px-3 py-2">{r.before.p50} ms</td>
                <td className="px-3 py-2">{r.after.p50} ms</td>
                <td className="px-3 py-2">{r.before.p95} ms</td>
                <td className="px-3 py-2">{r.after.p95} ms</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.after.min}–{r.after.max} ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted-foreground">
        Fonte: tabela <code>clicks.redirect_ms</code>. Cada redirect grava o tempo medido no Worker (
        <code>Server-Timing: redirect;dur=…</code>). Bots e prefetch são ignorados na coleta.
      </p>
    </div>
  );
}
