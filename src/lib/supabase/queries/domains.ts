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

/** Domínio principal ativo, com fallback para o primeiro ativo. */
export function pickPrimaryDomain(domains: DomainRow[]): string {
  const actives = domains.filter((d) => d.active);
  return actives.find((d) => d.is_primary)?.domain ?? actives[0]?.domain ?? "";
}
