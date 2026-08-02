/**
 * Histórico de Alterações (auditoria administrativa) — Big Cloak.
 *
 * Separado dos Eventos Operacionais (`clicks`): aqui só entram ações feitas
 * pelo operador ou pelo sistema sobre links, domínios e configurações.
 * Nada é apagado ao arquivar um link ou domínio.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "@/lib/date-range";

export type AuditEntity = "link" | "domain" | "settings";

export type AuditAction =
  | "link_created"
  | "link_updated"
  | "link_url_changed"
  | "link_domain_changed"
  | "manual_activate"
  | "manual_waiting"
  | "link_archived"
  | "link_restored"
  | "domain_created"
  | "domain_updated"
  | "domain_archived"
  | "domain_restored"
  | "domain_primary"
  | "settings_updated"
  | "auto_activate";

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  link_created: "Link criado",
  link_updated: "Link editado",
  link_url_changed: "Destino alterado",
  link_domain_changed: "Domínio alterado",
  manual_activate: "Link ativado",
  manual_waiting: "Link colocado em espera",
  link_archived: "Link arquivado",
  link_restored: "Link restaurado",
  domain_created: "Domínio cadastrado",
  domain_updated: "Domínio editado",
  domain_archived: "Domínio arquivado",
  domain_restored: "Domínio restaurado",
  domain_primary: "Domínio definido como principal",
  settings_updated: "Configuração alterada",
  auto_activate: "Ativação automática executada",
};

export const ENTITY_LABEL: Record<AuditEntity, string> = {
  link: "Link",
  domain: "Domínio",
  settings: "Configuração",
};

export interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  actor: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  link_id: string | null;
  slug: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  detail: Record<string, unknown> | null;
}

interface LogInput {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  label?: string | null;
  slug?: string | null;
  linkId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actor?: string;
}

/** Nunca deixa a auditoria derrubar a operação principal. */
export async function logAudit(input: LogInput): Promise<void> {
  try {
    await supabase.from("link_audit").insert({
      action: input.action,
      entity_type: input.entity,
      entity_id: input.entityId ?? null,
      entity_label: input.label ?? null,
      link_id: input.linkId ?? null,
      slug: input.slug ?? null,
      before_value: (input.before ?? null) as never,
      after_value: (input.after ?? null) as never,
      actor: input.actor ?? "operador",
    });
  } catch {
    /* auditoria é best-effort */
  }
}

/** Extrai só as chaves relevantes de um registro para gravar antes/depois. */
export function pick<T extends object>(obj: T | null | undefined, keys: (keyof T)[]) {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const k of keys) out[String(k)] = obj[k] ?? null;
  return out;
}

/** Diferença entre dois snapshots — só o que realmente mudou. */
export function diff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    const bv = before?.[k] ?? null;
    const av = after?.[k] ?? null;
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[k] = bv;
      a[k] = av;
    }
  }
  return { before: b, after: a };
}

/* ------------------------------------------------------------------ */
/* Leitura paginada (filtros executados no banco)                      */
/* ------------------------------------------------------------------ */

export interface AuditFilters {
  entity: AuditEntity | "all";
  action: string | "all";
  search: string;
}

export const AUDIT_PAGE_SIZE = 30;

export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  entity: "all",
  action: "all",
  search: "",
};

export function auditKey(range: DateRange, f: AuditFilters) {
  return [
    "audit",
    range.start?.toISOString() ?? null,
    range.end?.toISOString() ?? null,
    f.entity,
    f.action,
    f.search.trim().toLowerCase(),
  ] as const;
}

export interface AuditPage {
  rows: AuditRow[];
  total: number;
  nextOffset: number | null;
}

const AUDIT_SELECT =
  "id, created_at, action, actor, entity_type, entity_id, entity_label, link_id, slug, before_value, after_value, detail";

export async function fetchAuditPage(
  range: DateRange,
  f: AuditFilters,
  offset = 0,
): Promise<AuditPage> {
  let q = supabase
    .from("link_audit")
    .select(AUDIT_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (range.start) q = q.gte("created_at", range.start.toISOString());
  if (range.end) q = q.lt("created_at", range.end.toISOString());
  if (f.entity !== "all") q = q.eq("entity_type", f.entity);
  if (f.action !== "all") q = q.eq("action", f.action);

  const term = f.search.trim();
  if (term) {
    const like = `%${term}%`;
    q = q.or(`slug.ilike.${like},entity_label.ilike.${like},action.ilike.${like}`);
  }

  const { data, error, count } = await q.range(offset, offset + AUDIT_PAGE_SIZE - 1);
  if (error) throw error;

  const rows = (data ?? []) as unknown as AuditRow[];
  const loaded = offset + rows.length;
  const total = count ?? loaded;
  return {
    rows,
    total,
    nextOffset: rows.length === AUDIT_PAGE_SIZE && loaded < total ? loaded : null,
  };
}

/** Campos individuais de antes/depois, para exibição comparativa. */
export function valuePairs(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { field: string; before: string; after: string }[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].map((k) => ({
    field: FIELD_LABEL[k] ?? k,
    before: formatVal(before?.[k] ?? null),
    after: formatVal(after?.[k] ?? null),
  }));
}

/** Texto curto e legível para um valor de auditoria. */
export function describeValue(v: Record<string, unknown> | null): string {
  if (!v || Object.keys(v).length === 0) return "—";
  return Object.entries(v)
    .map(([k, val]) => `${FIELD_LABEL[k] ?? k}: ${formatVal(val)}`)
    .join(" · ");
}

const FIELD_LABEL: Record<string, string> = {
  name: "Nome",
  slug: "Slug",
  mode: "Modo",
  real_url: "Destino",
  decoy_url: "Destino alternativo",
  domain_id: "Domínio",
  domain: "Domínio",
  active: "Ativo",
  archived_at: "Arquivado em",
  is_primary: "Principal",
  description: "Descrição",
  auto_activate: "Ativação automática",
  auto_activate_after: "Ativar após",
  default_waiting_url: "URL de espera padrão",
};

function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "string" && v.length > 60) return `${v.slice(0, 57)}…`;
  return String(v);
}
