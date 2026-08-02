import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LinkRow, Mode } from "@/lib/bigcloak";
import {
  archiveLink,
  createLink,
  deleteLink,
  duplicateLink,
  fetchLinks,
  linksKey,
  restoreLink,
  setLinkActive,
  setLinkDomain,
  setLinkMode,
  updateLink,
} from "@/lib/supabase/queries/links";

export function useLinks() {
  return useQuery({
    queryKey: linksKey,
    queryFn: fetchLinks,
    staleTime: 30_000,
  });
}

/** Mutations de link com invalidação centralizada. */
export function useLinkMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: linksKey });

  return {
    create: useMutation({
      mutationFn: createLink,
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<LinkRow> }) => updateLink(id, patch),
      onSuccess: invalidate,
    }),
    setMode: useMutation({
      mutationFn: ({ id, mode }: { id: string; mode: Mode }) => setLinkMode(id, mode),
      onSuccess: invalidate,
    }),
    setActive: useMutation({
      mutationFn: ({ id, active }: { id: string; active: boolean }) => setLinkActive(id, active),
      onSuccess: invalidate,
    }),
    setDomain: useMutation({
      mutationFn: ({ id, domain_id }: { id: string; domain_id: string | null }) =>
        setLinkDomain(id, domain_id),
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: (id: string) => archiveLink(id),
      onSuccess: invalidate,
    }),
    restore: useMutation({
      mutationFn: (id: string) => restoreLink(id),
      onSuccess: invalidate,
    }),
    duplicate: useMutation({
      mutationFn: ({ source, slugs }: { source: LinkRow; slugs: string[] }) =>
        duplicateLink(source, slugs),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteLink(id),
      onSuccess: invalidate,
    }),
  };
}

/**
 * Assina mudanças em `links` e `clicks`, invalida os caches e devolve o
 * conjunto de ids que devem piscar (pulse verde) por 1,4s.
 */
export function useLinksRealtime() {
  const qc = useQueryClient();
  const [pulseIds, setPulseIds] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const pulse = (id: string) => {
      setPulseIds((prev) => new Set(prev).add(id));
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        id,
        setTimeout(() => {
          setPulseIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          timers.current.delete(id);
        }, 1400),
      );
    };

    const channel = supabase
      .channel("bigcloak-admin-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "links" }, (p) => {
        void qc.invalidateQueries({ queryKey: linksKey });
        const next = p.new as Partial<LinkRow> | undefined;
        const old = p.old as Partial<LinkRow> | undefined;
        if (p.eventType === "UPDATE" && next?.id && old && next.click_count !== old.click_count) {
          pulse(next.id);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clicks" }, (p) => {
        void qc.invalidateQueries({ queryKey: ["clicks"] });
        const row = p.new as { link_id?: string };
        if (row.link_id) pulse(row.link_id);
      })
      .subscribe();

    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  return pulseIds;
}
