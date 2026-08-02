import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { domainsKey, fetchDomains, pickPrimaryDomain } from "@/lib/supabase/queries/domains";

export function useDomains() {
  const query = useQuery({
    queryKey: domainsKey,
    queryFn: fetchDomains,
    staleTime: 60_000,
  });

  const domains = useMemo(() => query.data ?? [], [query.data]);
  const activeDomains = useMemo(() => domains.filter((d) => d.active), [domains]);
  const primaryDomain = useMemo(() => pickPrimaryDomain(domains), [domains]);

  return { ...query, domains, activeDomains, primaryDomain };
}
