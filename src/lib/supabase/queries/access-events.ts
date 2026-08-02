/**
 * Eventos Operacionais — acessos aos links (tabela `clicks`).
 *
 * Só acessos: nenhuma ação administrativa entra aqui (isso é `audit.ts`).
 * Toda filtragem e paginação acontece no banco.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "@/lib/date-range";

/** Apenas três resultados operacionais são exibidos ao operador. */
export type AccessResult = "redirected" | "waiting" | "error";

export const RESULT_LABEL: Record<AccessResult, string> = {
  redirected: "Redirecionado",
  waiting: "Página de espera",
  error: "Erro",
};

export const RESULT_ICON: Record<AccessResult, string> = {
  redirected: "✅",
  waiting: "🟡",
  error: "🔴",
};

export const RESULT_TONE: Record<AccessResult, string> = {
  redirected: "bg-primary/12 text-primary border-primary/30",
  waiting: "bg-[#F59E0B]/12 text-[#F59E0B] border-[#F59E0B]/30",
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

/**
 * Deriva o resultado operacional a partir do modo registrado no clique.
 * Bloqueios por IP/país continuam sendo "página de espera" (foi o que o
 * visitante viu); falhas técnicas viram "erro".
 */
export function resultOf(mode: string): AccessResult {
  const m = (mode ?? "").toLowerCase();
  if (m.startsWith("error") || m.includes("404") || m.includes("fail")) return "error";
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
}

export const ACCESS_PAGE_SIZE = 30;

export const DEFAULT_ACCESS_FILTERS: AccessFilters = {
  result: "all",
  domainId: "all",
  linkId: "all",
  device: "all",
  country: "all",
  search: "",
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
    linkIds?.join(",") ?? null,
  ] as const;
}

const ACCESS_SELECT = "id, created_at, link_id, mode_at_click, redirect_ms, device, country, host";

export interface AccessPage {
  rows: AccessRow[];
  total: number;
  nextOffset: number | null;
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
  offset = 0,
): Promise<AccessPage> {
  if (linkIds && linkIds.length === 0) return { rows: [], total: 0, nextOffset: null };

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
  else if (f.result === "error")
    q = q.or("mode_at_click.ilike.%error%,mode_at_click.ilike.%404%,mode_at_click.ilike.%fail%");
  else if (f.result === "waiting")
    q = q
      .not("mode_at_click", "like", "real%")
      .not("mode_at_click", "like", "decoy%")
      .not("mode_at_click", "ilike", "%error%")
      .not("mode_at_click", "ilike", "%404%")
      .not("mode_at_click", "ilike", "%fail%");

  const { data, error, count } = await q.range(offset, offset + ACCESS_PAGE_SIZE - 1);
  if (error) throw error;

  const rows = (data ?? []) as unknown as AccessRow[];
  const loaded = offset + rows.length;
  const total = count ?? loaded;
  return {
    rows,
    total,
    nextOffset: rows.length === ACCESS_PAGE_SIZE && loaded < total ? loaded : null,
  };
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
  return { devices: [...devices].sort(), countries: [...countries].sort() };
}
