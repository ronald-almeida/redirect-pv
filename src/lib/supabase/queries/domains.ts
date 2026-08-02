import { supabase } from "@/integrations/supabase/client";
import type { DomainRow } from "@/lib/bigcloak";

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
  const { error } = await supabase.from("domains").insert({
    domain: input.domain,
    description: input.description?.trim() || null,
    is_primary: shouldBePrimary,
    active: true,
  } as never);
  if (error) throw error;
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
  const { error: e2 } = await supabase
    .from("domains")
    .update({ is_primary: true, active: true, archived_at: null } as never)
    .eq("id", id);
  if (e2) throw e2;
}

export async function archiveDomain(id: string) {
  await updateDomain(id, {
    archived_at: new Date().toISOString(),
    active: false,
    is_primary: false,
  } as Partial<DomainRow>);
}

export async function restoreDomain(id: string) {
  await updateDomain(id, {
    archived_at: null,
    active: true,
  } as Partial<DomainRow>);
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
