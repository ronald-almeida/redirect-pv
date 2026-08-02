/**
 * Big Cloak — tipos e helpers compartilhados pelo painel.
 * Centraliza o que antes estava duplicado em cada rota admin.
 */

export type Mode = "real" | "decoy" | "waiting";

export interface LinkRow {
  id: string;
  slug: string;
  name: string | null;
  mode: string;
  real_url: string | null;
  decoy_url: string | null;
  page_title: string | null;
  page_message: string | null;
  page_icon: string | null;
  active: boolean;
  archived_at: string | null;
  auto_activate: boolean;
  auto_activate_after: number;
  last_click_at: string | null;
  domain_id: string | null;
  owner_only: boolean;
  owner_ips: string[];
  created_at: string;
  avg_redirect_ms: number | null;
  last_redirect_ms: number | null;
  total_redirects: number | null;
  click_count: number | null;
}

export interface DomainRow {
  id: string;
  domain: string;
  description: string | null;
  active: boolean;
  is_primary: boolean;
  archived_at: string | null;
  dns_status: string;
  worker_status: string;
  /** Campos preparados para a futura integração com a API da Cloudflare. */
  cf_zone_id: string | null;
  cf_api_token_secret: string | null;
  cf_dns_status: string;
  cf_worker_status: string;
  cf_ssl_status: string;
  health_status: string;
  last_health_at: string | null;
  last_checked_at: string | null;
  check_error: string | null;
  notes: string | null;
  created_at: string;
}


export interface ClickRow {
  id?: string;
  link_id: string;
  mode_at_click: string;
  country: string | null;
  device: string | null;
  is_vpn: boolean;
  utm_source: string | null;
  created_at: string;
  redirect_ms?: number | null;
  host?: string | null;
  ip?: string | null;
}

export interface AlertRow {
  id: string;
  kind: string;
  severity: string;
  title: string;
  detail: string | null;
  link_id: string | null;
  domain_id: string | null;
  read_at: string | null;
  created_at: string;
}

/** Colunas mínimas do link usadas no painel — evita `select("*")`. */
export const LINK_SELECT =
  "id,slug,name,mode,real_url,decoy_url,page_title,page_message,page_icon,active,archived_at,auto_activate,auto_activate_after,last_click_at,domain_id,owner_only,owner_ips,created_at,avg_redirect_ms,last_redirect_ms,total_redirects,click_count";

export const CLICK_SELECT =
  "id,link_id,mode_at_click,country,device,is_vpn,utm_source,created_at,redirect_ms,host,ip";

export const SLUG_RE = /^[a-zA-Z0-9_\-\.\/\?=]+$/;
export const SLUG_HINT = "Use letras, números, hífens, underscores, barras e pontos";

export const DOMAIN_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\s/g, "");
}

export function nf(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function formatRel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "agora";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Classificação operacional da latência. */
export function latencyTone(ms: number): { label: string; className: string } {
  if (!ms) return { label: "—", className: "text-muted-foreground" };
  if (ms < 150) return { label: "Ótimo", className: "text-primary" };
  if (ms < 400) return { label: "Normal", className: "text-warning" };
  return { label: "Lento", className: "text-destructive" };
}

/** Modo base do clique ("waiting:bot" → "waiting"). */
export function baseMode(modeAtClick: string): Mode {
  const m = modeAtClick.split(":")[0];
  return m === "real" || m === "decoy" ? (m as Mode) : "waiting";
}

export function linkTitle(l: Pick<LinkRow, "name" | "slug">): string {
  return l.name?.trim() || l.slug;
}
