import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveDomain,
  createDomain,
  domainsKey,
  fetchDomains,
  pickPrimaryDomain,
  restoreDomain,
  setDomainActive,
  setPrimaryDomain,
  updateDomain,
  updateDomainAudited,
  type CreateDomainInput,
} from "@/lib/supabase/queries/domains";
import type { DomainRow } from "@/lib/bigcloak";

export function useDomains() {
  const query = useQuery({
    queryKey: domainsKey,
    queryFn: fetchDomains,
    staleTime: 60_000,
  });

  const domains = useMemo(() => query.data ?? [], [query.data]);
  const activeDomains = useMemo(
    () => domains.filter((d) => d.active && !d.archived_at),
    [domains],
  );
  const primaryDomain = useMemo(() => pickPrimaryDomain(domains), [domains]);

  return { ...query, domains, activeDomains, primaryDomain };
}

export function useDomainMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: domainsKey });
  return {
    create: useMutation({
      mutationFn: ({ input, existing }: { input: CreateDomainInput; existing: DomainRow[] }) =>
        createDomain(input, existing),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        patch,
        domain,
      }: { id: string; patch: Partial<DomainRow>; domain?: DomainRow }) =>
        domain ? updateDomainAudited(domain, patch) : updateDomain(id, patch),
      onSuccess: invalidate,
    }),
    setPrimary: useMutation({
      mutationFn: (id: string) => setPrimaryDomain(id),
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: (arg: string | DomainRow) =>
        typeof arg === "string" ? archiveDomain(arg) : archiveDomain(arg.id, arg),
      onSuccess: invalidate,
    }),
    restore: useMutation({
      mutationFn: (arg: string | DomainRow) =>
        typeof arg === "string" ? restoreDomain(arg) : restoreDomain(arg.id, arg),
      onSuccess: invalidate,
    }),
    setActive: useMutation({
      mutationFn: ({ id, active }: { id: string; active: boolean }) => setDomainActive(id, active),
      onSuccess: invalidate,
    }),
  };
}
