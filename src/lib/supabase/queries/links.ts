import { supabase } from "@/integrations/supabase/client";
import type { LinkRow, Mode } from "@/lib/bigcloak";
import { diff, logAudit, pick } from "@/lib/supabase/queries/audit";

/** Campos de link registrados no Histórico de Alterações. */
const AUDITED: (keyof LinkRow)[] = [
  "name",
  "slug",
  "mode",
  "real_url",
  "domain_id",
  "active",
  "archived_at",
  "auto_activate",
  "auto_activate_after",
];

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
  const { data, error } = await supabase
    .from("links")
    .insert({
      slug: input.slug,
      name: input.name?.trim() || null,
      real_url: real,
      mode: real ? "real" : "waiting",
      domain_id: input.domain_id || null,
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  await logAudit({
    action: "link_created",
    entity: "link",
    entityId: data?.id ?? null,
    linkId: data?.id ?? null,
    slug: input.slug,
    label: input.name?.trim() || input.slug,
    before: null,
    after: {
      slug: input.slug,
      name: input.name?.trim() || null,
      real_url: real,
      mode: real ? "real" : "waiting",
      domain_id: input.domain_id || null,
    },
  });
}

/** Edição com registro de valor anterior e novo. */
export async function updateLinkAudited(link: LinkRow, patch: Partial<LinkRow>) {
  const before = pick(link, AUDITED);
  await updateLink(link.id, patch);
  const after = pick({ ...link, ...patch } as LinkRow, AUDITED);
  const d = diff(before, after);
  if (Object.keys(d.after).length === 0) return;
  const action =
    "real_url" in d.after
      ? "link_url_changed"
      : "domain_id" in d.after
        ? "link_domain_changed"
        : "link_updated";
  await logAudit({
    action,
    entity: "link",
    entityId: link.id,
    linkId: link.id,
    slug: link.slug,
    label: link.name?.trim() || link.slug,
    before: d.before,
    after: d.after,
  });
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

export class MissingRealUrlError extends Error {
  constructor() {
    super("Adicione uma URL de destino antes de ativar este link.");
    this.name = "MissingRealUrlError";
  }
}

export function canActivate(l: LinkRow): boolean {
  const list = (l as { real_urls?: string[] | null }).real_urls;
  return !!(l.real_url?.trim() || (Array.isArray(list) && list.length > 0));
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
  await logAudit({
    action: "manual_activate",
    entity: "link",
    entityId: link.id,
    linkId: link.id,
    slug: link.slug,
    label: link.name?.trim() || link.slug,
    before: { mode: link.mode, active: link.active },
    after: { mode: "real", active: true },
  });
}

/** Volta o link para modo espera sem excluir, arquivar ou alterar o destino. */
export async function deactivateLink(link: LinkRow) {
  await updateLink(link.id, {
    mode: "waiting",
    updated_at: new Date().toISOString(),
  } as Partial<LinkRow>);
  await logAudit({
    action: "manual_waiting",
    entity: "link",
    entityId: link.id,
    linkId: link.id,
    slug: link.slug,
    label: link.name?.trim() || link.slug,
    before: { mode: link.mode },
    after: { mode: "waiting" },
  });
}

/**
 * Arquivar NUNCA apaga cliques, eventos ou histórico — apenas marca a data.
 */
export async function archiveLink(id: string, link?: LinkRow) {
  const at = new Date().toISOString();
  const { error } = await supabase
    .from("links")
    .update({ archived_at: at, active: false } as never)
    .eq("id", id);
  if (error) throw error;
  await logAudit({
    action: "link_archived",
    entity: "link",
    entityId: id,
    linkId: id,
    slug: link?.slug ?? null,
    label: link?.name?.trim() || link?.slug || null,
    before: { archived_at: null, active: true },
    after: { archived_at: at, active: false },
  });
}

export async function restoreLink(id: string, link?: LinkRow) {
  const { error } = await supabase
    .from("links")
    .update({ archived_at: null } as never)
    .eq("id", id);
  if (error) throw error;
  await logAudit({
    action: "link_restored",
    entity: "link",
    entityId: id,
    linkId: id,
    slug: link?.slug ?? null,
    label: link?.name?.trim() || link?.slug || null,
    before: { archived_at: link?.archived_at ?? null },
    after: { archived_at: null },
  });
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
