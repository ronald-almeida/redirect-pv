/**
 * Eventos Operacionais — acessos aos links (tabela `clicks`).
 *
 * Só acessos: nenhuma ação administrativa entra aqui (isso é `audit.ts`).
 * Toda filtragem e paginação acontece no banco.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "@/lib/date-range";

export type AccessResult = "redirected" | "waiting" | "blocked" | "error";

export const RESULT_LABEL: Record<AccessResult, string> = {
  redirected: "Redirecionado",
  waiting: "Página de espera",
  blocked: "Bloqueado",
  error: "Erro",
};

export const RESULT_TONE: Record<AccessResult, string> = {
  redirected: "bg-primary/12 text-primary border-primary/30",
  waiting: "bg-[#F59E0B]/12 text-[#F59E0B] border-[#F59E0B]/30",
  blocked: "bg-muted text-muted-foreground border-border",
  error: "bg-destructive/12 text-destructive border-destructive/30",
};

export interface AccessRow {
  id: string;
  created_at: string;
  link_id: string;
  mode_at_click: string;
  redirect_ms: number | null;
  device: string | null;
  country: string | null;
  host: string | null;
}

/** Deriva o resultado operacional a partir do modo registrado no clique. */
export function resultOf(mode: string): AccessResult {
  const m = (mode ?? "").toLowerCase();
  if (m.startsWith("error") || m.includes("404") || m.includes("fail")) return "error";
  if (m.includes("block") || m.includes("bot") || m.includes("deny")) return "blocked";
  if (m.startsWith("real") || m.startsWith("decoy")) return "redirected";
  return "waiting";
}

export interface AccessFilters {
  result: AccessResult | "all";
  domainId: string | "all";
  linkId: string | "all";
  device: string | "all";
  country: string | "all";
  search: string;
  page: number;
  pageSize: number;
}

export const DEFAULT_ACCESS_FILTERS: AccessFilters = {
  result: "all",
  domainId: "all",
  linkId: "all",
  device: "all",
  country: "all",
  search: "",
  page: 0,
  pageSize: 25,
};

export function accessKey(range: DateRange, f: AccessFilters, linkIds: string[] | null) {
  return [
    "access-events",
    range.start?.toISOString() ?? null,
    range.end?.toISOString() ?? null,
    f.result,
    f.domainId,
    f.linkId,
    f.device,
    f.country,
    f.page,
    f.pageSize,
    linkIds?.join(",") ?? null,
  ] as const;
}

const ACCESS_SELECT = "id, created_at, link_id, mode_at_click, redirect_ms, device, country, host";

export interface AccessPage {
  rows: AccessRow[];
  total: number;
}

/**
 * `linkIds` já vem resolvido no cliente (a partir de busca por nome/slug/domínio/
 * destino sobre a lista de links, que é pequena) — assim o filtro continua
 * sendo executado no banco via `in()` sem baixar milhares de cliques.
 */
export async function fetchAccessPage(
  range: DateRange,
  f: AccessFilters,
  linkIds: string[] | null,
): Promise<AccessPage> {
  if (linkIds && linkIds.length === 0) return { rows: [], total: 0 };

  let q = supabase
    .from("clicks")
    .select(ACCESS_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (range.start) q = q.gte("created_at", range.start.toISOString());
  if (range.end) q = q.lt("created_at", range.end.toISOString());
  if (linkIds) q = q.in("link_id", linkIds.slice(0, 500));
  if (f.device !== "all") q = q.eq("device", f.device);
  if (f.country !== "all") q = q.eq("country", f.country);

  if (f.result === "redirected") q = q.or("mode_at_click.like.real%,mode_at_click.like.decoy%");
  else if (f.result === "waiting") q = q.like("mode_at_click", "waiting%");
  else if (f.result === "blocked") q = q.or("mode_at_click.ilike.%block%,mode_at_click.ilike.%bot%");
  else if (f.result === "error") q = q.or("mode_at_click.ilike.%error%,mode_at_click.ilike.%404%");

  const from = f.page * f.pageSize;
  const { data, error, count } = await q.range(from, from + f.pageSize - 1);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as AccessRow[], total: count ?? 0 };
}

/** Valores distintos para os selects de dispositivo/país (amostra recente). */
export async function fetchAccessFacets(range: DateRange) {
  let q = supabase.from("clicks").select("device, country").limit(1000);
  if (range.start) q = q.gte("created_at", range.start.toISOString());
  if (range.end) q = q.lt("created_at", range.end.toISOString());
  const { data } = await q;
  const devices = new Set<string>();
  const countries = new Set<string>();
  for (const r of (data ?? []) as { device: string | null; country: string | null }[]) {
    if (r.device) devices.add(r.device);
    if (r.country) countries.add(r.country);
  }
  return { devices: [...devices].sort(), countries: [...