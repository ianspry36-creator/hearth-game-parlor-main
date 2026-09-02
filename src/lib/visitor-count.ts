import { supabase } from "@/integrations/supabase/client";

/** Log this visitor so the running total advances by one. */
export async function recordVisit(): Promise<void> {
  await supabase.from("site_visits").insert({});
}

/** Total number of recorded visits. */
export async function getVisitCount(): Promise<number | null> {
  const { count } = await supabase
    .from("site_visits")
    .select("id", { count: "exact", head: true });
  return count;
}
