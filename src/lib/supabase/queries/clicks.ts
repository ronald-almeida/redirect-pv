import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "@/lib/date-range";

/** Clique enriquecido com os campos operacionais usados no painel. */
export interface AdminClickRow {
  link_id: string;
  mode_at_click: string;
  country: string | null;
  device: string | null;
  is_vpn: boolean;
  utm_source: string | null;
  created_at: string;
  redirect_ms?: number | null;
  cache_status?: string | null;
}

const SELECT =
  "link_id, mode_at_click, country, device, is_vpn, utm_source, created_at, redirect_ms, cache_status";

export function clicksKey(range: DateRange) {
  return ["clicks", range.start?.toISOString() ?? null, range.end?.toISOString() ?? null] as const;
}

export async function fetchClicks(range: DateRange): Promise<AdminClickRow[]> {
  if (!range.start) return [];
  const { data, error } = await supabase
    .from("clicks")
    .select(SELECT)
    .gte("created_at", range.start.toISOString())
    .lt("created_at", (range.end ?? new Date()).toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as unknown as AdminClickRow[];
}

/** Último `cache_status` conhecido por link (linhas já vêm desc por data). */
export function latestCacheByLink(rows: AdminClickRow[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const r of rows) {
    if (!out[r.link_id] && r.cache_status) out[r.link_id] = r.cache_status;
  }
  return out;
}

/** Distribui os cliques em N baldes uniformes dentro do intervalo. */
export function bucketCounts(rows: AdminClickRow[], range: DateRange, buckets = 16): number[] {
  if (!range.start) return [];
  const start = range.start.getTime();
  const end = (range.end ?? new Date()).getTime();
  const span = end - start;
  if (span <= 0) return [];
  const out = new Array<number>(buckets).fill(0);
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (t < start || t >= end) continue;
    out[Math.min(buckets - 1, Math.floor(((t - start) / span) * buckets))]++;
  }
  return out;
}

/** Latência média por balde de tempo. */
export function bucketLatency(rows: AdminClickRow[], range: DateRange, buckets = 16): number[] {
  if (!range.start) return new Array<number>(buckets).fill(0);
  const start = range.start.getTime();
  const end = (range.end ?? new Date()).getTime();
  const span = end - start;
  const sum = new Array<number>(buckets).fill(0);
  const cnt = new Array<number>(buckets).fill(0);
  if (span <= 0) return sum;
  for (const r of rows) {
    const ms = r.redirect_ms;
    if (!ms) continue;
    const t = new Date(r.created_at).getTime();
    if (t < start || t >= end) continue;
    const i = Math.min(buckets - 1, Math.floor(((t - start) / span) * buckets));
    sum[i] += ms;
    cnt[i]++;
  }
  return sum.map((s, i) => (cnt[i] ? Math.round(s / cnt[i]) : 0));
}

/** Série de latência rotulada por horário, para o gráfico de área. */
export function latencySeries(rows: AdminClickRow[], range: DateRange, buckets = 24) {
  if (!range.start) return [] as { t: string; ms: number }[];
  const start = range.start.getTime();
  const end = (range.end ?? new Date()).getTime();
  const span = end - start;
  const avg = bucketLatency(rows, range, buckets);
  return avg.map((ms, i) => ({
    t: new Date(start + (span * i) / buckets).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    ms,
  }));
}
