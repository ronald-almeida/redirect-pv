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
  domain_id?: