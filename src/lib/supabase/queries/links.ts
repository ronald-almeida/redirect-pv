import { supabase } from "@/integrations/supabase/client";
import type { LinkRow, Mode } from "@/lib/bigcloak";

/** Valores padrão da página de espera de um novo slug. */
export const LINK_DEFAULTS = {
  page_title: "Link em breve",
  page_message: "Este link está sendo configurado. Volte em breve.",
  page_icon: "⏳",
};

export const linksKey = ["links"] as const;

export async function fetchLinks(): Promise<LinkRow[]> {
  const { data, error } = await supabase
    .from("links")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LinkRow[];
}

export async function slugExists(slug: string): Promise<boolean> {
  const { data } = await supabase.from("links").select("id").eq("slug", slug).maybeSingle();
  return !!data;
}

export interface CreateLinkInput {
  slug: string;
  name?: string | null;
  real_url?: string | null;
  domain_id?: string | null;
}

export async function createLink(input: CreateLinkInput) {
  const real = input.real_url?.trim() || null;
  const { error } = await supabase.from("links").insert({
    slug: input.slug,
    name: input.name?.trim() || null,
    real_url: real,
    mode: real ? "real" : "waiting",
    domain_id: input.domain_id || null,
  });
  if (error) throw error;
}

export async function updateLink(id: string, patch: Partial<LinkRow>) {
  const { error } = await supabase.from("links").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function setLinkMode(id: string, mode: Mode) {
  return updateLink(id, { mode });
}

export async function setLinkActive(id: string, active: boolean) {
  return updateLink(id, { active });
}

export async function setLinkDomain(id: string, domain_id: string | null) {
  return updateLink(id, { domain_id });
}

/** Registra uma ação no histórico interno (link_audit). */
async function logAudit(link: LinkRow, action: string, detail: Record<string, unknown>) {
  await supabase.from("link_audit").insert({
    link_id: link.id,
    slug: link.slug,
    action,
    detail: detail as never,
    actor: "operator",
  });
}

export class MissingRealUrlError extends Error {
  constructor() {
    super("Adicione uma URL de destino antes de ativar este link.");
    this.name = "MissingRealUrlError";
  }
}

export function canActivate(l: LinkRow): boolean {
  const hasList = Array.isArray(l.real_urls) && l.real_urls.length > 0;
  return !!(l.real_url?.trim() || hasList);
}

/**
 * Ativação manual (plano B). Não altera slug, domínio nem URL — apenas
 * coloca o link em modo real e ativo, com registro em auditoria.
 */
export async function activateLink(link: LinkRow) {
  if (!canActivate(link)) throw new MissingRealUrlError();
  await updateLink(link.id, {
    mode: "real",
    active: true,
    archived_at: null,
    updated_at: new Date().toISOString(),
  } as Partial<LinkRow>);
  await logAudit(link, "manual_activate", {
    at: new Date().toISOString(),
    from_mode: link.mode,
    real_url: link.real_url,
  });
}

/** Volta o link para modo espera sem excluir, arquivar ou alterar o destino. */
export async function deactivateLink(link: LinkRow) {
  await updateLink(link.id, {
    mode: "waiting",
    updated_at: new Date().toISOString(),
  } as Partial<LinkRow>);
  await logAudit(link, "manual_waiting", {
    at: new Date().toISOString(),
    from_mode: link.mode,
  });
}

export async function archiveLink(id: string) {
  const { error } = await supabase
    .from("links")
    .update({ archived_at: new Date().toISOString(), active: false } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function restoreLink(id: string) {
  const { error } = await supabase
    .from("links")
    .update({ archived_at: null } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteLink(id: string) {
  const { error } = await supabase.from("links").delete().eq("id", id);
  if (error) throw error;
}

/** Duplica um link gerando um slug livre `<base>-copy[-n]`. */
export async function duplicateLink(source: LinkRow, existingSlugs: string[]) {
  const base = source.slug.replace(/-copy(-\d+)?$/, "");
  const taken = new Set(existingSlugs);
  let candidate = `${base}-copy`;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}-copy-${n++}`;

  const { error } = await supabase.from("links").insert({
    slug: candidate,
    name: source.name,
    mode: source.mode,
    real_url: source.real_url,
    decoy_url: source.decoy_url,
    page_title: source.page_title,
    page_message: source.page_message,
    page_icon: source.page_icon,
    active: source.active,
    domain_id: source.domain_id,
  });
  if (error) throw error;
  return candidate;
}

/** Mensagem amigável para erros comuns do Postgres. */
export function humanizeLinkError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return "Erro desconhecido.";
  if (e.code === "23505") return "Este slug já existe. Escolha outro.";
  return e.message ?? "Não foi possível concluir a operação.";
}
