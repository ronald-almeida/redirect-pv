import { supabase } from "@/integrations/supabase/client";
import type { AlertRow } from "@/lib/bigcloak";

export const alertsKey = ["alerts", "unread"] as const;

export async function fetchOpenAlerts(): Promise<AlertRow[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as AlertRow[];
}

export async function dismissAlert(id: string) {
  const { error } = await supabase
    .from("alerts")
    .update({ read_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}
