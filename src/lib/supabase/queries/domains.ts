import { supabase } from "@/integrations/supabase/client";
import type { DomainRow } from "@/lib/bigcloak";
import { diff, logAudit, pick } from "@/lib/supabase/queries/audit";

const AUDITED: (keyof DomainRow)[] = [
  "domain",
  "description",
  "active",
  "is_primary",
  "archived_at",
  "notes",
];

export const domainsKey = ["domains"] as const;

export async function fetchDomains(): Promise<DomainRow[]> {
  const { data, error } = await supabase
    .from("domains")
    .select("*")
    .order("is_primary", { ascending: false })
    .order("domain", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DomainRow[];
}

/** Domínio principal ativo, com fallback para o primeiro ativo não arquivado. */
export function pickPrimaryDomain(domains: DomainRow[]): string {
  const actives = domains.filter((d) => d.active && !d.archived_at);
  return actives.find((d) => d.is_primary)?.domain ?? actives[0]?.domain ?? "";
}

export interface CreateDomainInput {
  domain: string;
  description?: string | null;
  makePrimary?: boolean;
}

export async function createDomain(input: CreateDomainInput, existing: DomainRow[]) {
  const isFirst = existing.length === 0;
  const shouldBePrimary = isFirst || !!input.makePrimary;
  if (shouldBePrimary && !isFirst) {
    await supabase.from("domains").update({ is_primary: false } as never).neq("id", "");
  }
  const { data, error } = await supabase
    .from("domains")
    .insert({
      domain: input.domain,
      description: input.description?.trim() || null,
      is_primary: shouldBePrimary,
      active: true,
    } as never)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  await logAudit({
    action: "domain_created",
    entity: "domain",
    entityId: (data as { id?: string } | null)?.id ?? null,
    label: input.domain,
    before: null,
    after: {
      domain: input.domain,
      description: input.description?.trim() || null,
      is_primary: shouldBePrimary,
      active: true,
    },
  });
}

/** Edição com registro de valor anterior e novo. */
export async function updateDomainAudited(domain: DomainRow, patch: Partial<DomainRow>) {
  const before = pick(domain, AUDITED);
  await updateDomain(domain.id, patch);
  const after = pick({ ...domain, ...patch } as DomainRow, AUDITED);
  const d = diff(before, after);
  if (Object.keys(d.after).length === 0) return;
  await logAudit({
    action: "domain_updated",
    entity: "domain",
    entityId: domain.id,
    label: domain.domain,
    before: d.before,
    after: d.after,
  });
}

export async function updateDomain(id: string, patch: Partial<DomainRow>) {
  const { error } = await supabase.from("domains").update(patch as never).eq("id", id);
  if (error) throw error;
}

/** Sempre exatamente um principal — remove o anterior e promove este. */
export async function setPrimaryDomain(id: string) {
  const { error: e1 } = await supabase
    .from("domains")
    .update({ is_primary: false } as never)
    .neq("id", id);
  if (e1) throw e1;
  const { data, error: e2 } = await supabase
    .from("domains")
    .update({ is_primary: true, active: true, archived_at: null } as never)
    .eq("id", id)
    .select("domain")
    .maybeSingle();
  if (e2) throw e2;
  await logAudit({
    action: "domain_primary",
    entity: "domain",
    entityId: id,
    label: (data as { domain?: string } | null)?.domain ?? null,
    before: { is_primary: false },
    after: { is_primary: true },
  });
}

/** Arquivar preserva slugs, cliques, eventos e histórico do domínio. */
export async function archiveDomain(id: string, domain?: DomainRow) {
  const at = new Date().toISOString();
  await updateDomain(id, {
    archived_at: at,
    active: false,
    is_primary: false,
  } as Partial<DomainRow>);
  await logAudit({
    action: "domain_archived",
    entity: "domain",
    entityId: id,
    label: domain?.domain ?? null,
    before: { archived_at: null, active: true },
    after: { archived_at: at, active: false },
  });
}

export async function restoreDomain(id: string, domain?: DomainRow) {
  await updateDomain(id, {
    archived_at: null,
    active: true,
  } as Partial<DomainRow>);
  await logAudit({
    action: "domain_restored",
    entity: "domain",
    entityId: id,
    label: domain?.domain ?? null,
    before: { archived_at: domain?.archived_at ?? null, active: false },
    after: { archived_at: null, active: true },
  });
}

export async function setDomainActive(id: string, active: boolean) {
  await updateDomain(id, { active } as Partial<DomainRow>);
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function normalizeDomainName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\s/g, "");
}

export function isValidDomain(v: string): boolean {
  return DOMAIN_RE.test(v);
}
