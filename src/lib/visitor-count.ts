import { supabase } from "@/integrations/supabase/client";

/** Log this visitor so the running total advances by one. */
export async function recordVisit(): Promise<void> {
  await supabase.from("site_visits").insert({});
}

/**
 * Total number of recorded visits. Since the `id` column is an
 * auto-incrementing identity, the latest record's id equals the running
 * total, so we read that single row instead of counting every row.
 */
export async function getVisitCount(): Promise<number | null> {
  const { data } = await supabase
    .from("site_visits")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? 0;
}
