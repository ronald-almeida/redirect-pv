/**
 * Consultas agregadas exclusivas do Dashboard.
 * Objetivo: poucos requests, todos com chave de cache própria — nada de
 * baixar milhares de linhas só para calcular um número.
 */
import { supabase } from "@/integrations/supabase/client";
import { brtDayStart, todayBrtYmd, type DateRange } from "@/lib/date-range";

/** Linha mínima usada pelos gráficos e pelo feed. */
export interface DashClick {
  link_id: string;
  created_at: string;
  redirect_ms: number | null;
  mode_at_click: string;
  host: string | null;
}

const DASH_SELECT = "link_id, created_at, redirect_ms, mode_at_click, host";

async function countClicks(start: Date, end: Date | null): Promise<number> {
  let q = supabase
    .from("clicks")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start.toISOString());
  if (end) q = q.lt("created_at", end.toISOString());
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** Início do mês corrente no fuso de São Paulo. */
export function brtMonthStart(now = new Date()): Date {
  const [y, m] = todayBrtYmd(now).split("-");
  return new Date(`${y}-${m}-01T00:00:00-03:00`);
}

/** Mesmo período do mês anterior, para comparação. */
export function brtPrevMonthRange(now = new Date()): { start: Date; end: Date } {
  const end = brtMonthStart(now);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 1);
  return { start, end };
}

export interface DashboardTotals {
  clicksToday: number;
  clicksYesterday: number;
  clicksMonth: number;
  clicksPrevMonth: number;
  avgMsToday: number;
  avgMsYesterday: number;
  /** Cliques de hoje que caíram na página de espera. */
  waitingToday: number;
  checkedAt: string;
}

export function dashboardTotalsKey(dayKey: string) {
  return ["dashboard", "totals", dayKey] as const;
}

/** Um fetch de detalhes (hoje + ontem) e duas contagens agregadas do mês. */
export async function fetchDashboardTotals(now = new Date()): Promise<DashboardTotals> {
  const todayStart = brtDayStart(now, 0);
  const yesterdayStart = brtDayStart(now, 1);
  const monthStart = brtMonthStart(now);
  const prevMonth = brtPrevMonthRange(now);

  const [recent, clicksMonth, clicksPrevMonth] = await Promise.all([
    supabase
      .from("clicks")
      .select("created_at, redirect_ms, mode_at_click")
      .gte("created_at", yesterdayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000),
    countClicks(monthStart, null),
    countClicks(prevMonth.start, prevMonth.end),
  ]);

  if (recent.error) throw recent.error;

  const rows = (recent.data ?? []) as {
    created_at: string;
    redirect_ms: number | null;
    mode_at_click: string;
  }[];

  const t0 = todayStart.getTime();
  let clicksToday = 0;
  let clicksYesterday = 0;
  let waitingToday = 0;
  let sumToday = 0;
  let nToday = 0;
  let sumYest = 0;
  let nYest = 0;

  for (const r of rows) {
    if (new Date(r.created_at).getTime() >= t0) {
      clicksToday++;
      if (r.mode_at_click.startsWith("waiting")) waitingToday++;
      if (r.redirect_ms) {
        sumToday += r.redirect_ms;
        nToday++;
      }
    } else {
      clicksYesterday++;
      if (r.redirect_ms) {
        sumYest += r.redirect_ms;
        nYest++;
      }
    }
  }

  return {
    clicksToday,
    clicksYesterday,
    clicksMonth,
    clicksPrevMonth,
    avgMsToday: nToday ? Math.round(sumToday / nToday) : 0,
    avgMsYesterday: nYest ? Math.round(sumYest / nYest) : 0,
    waitingToday,
    checkedAt: new Date().toISOString(),
  };
}

export function dashboardSeriesKey(range: DateRange) {
  return [
    "dashboard",
    "series",
    range.start?.toISOString() ?? null,
    range.end?.toISOString()