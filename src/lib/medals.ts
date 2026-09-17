import { supabase } from "@/integrations/supabase/client";

/** Medal tiers derived from a player's completed-game streak. */
export type MedalTier = "none" | "bronze" | "silver" | "gold";

/**
 * Map a completed-online-game streak to a medal. A player earns bronze at 3
 * completed games, silver at 7 and gold at 12.
 */
export function medalForStreak(streak: number): MedalTier {
  if (streak >= 12) return "gold";
  if (streak >= 7) return "silver";
  if (streak >= 3) return "bronze";
  return "none";
}

/**
 * The streak a player drops to after disconnecting: one tier below where they
 * were. Gold drops to the bottom of silver (7), silver to bronze (3), and
 * bronze back to none (0). The gaps match the tier boundaries, so recovering a
 * lost medal takes the same number of finished games as crossing the gap the
 * first time: 5 back to gold, 4 back to silver, 3 back to bronze.
 */
export function disconnectPenalty(streak: number): number {
  if (streak >= 12) return 7;
  if (streak >= 7) return 3;
  return 0;
}

/** A player's current completed-game streak (0 for players with no record). */
export async function getStreak(sessionId: string): Promise<number> {
  const { data } = await supabase
    .from("player_profiles")
    .select("streak")
    .eq("session_id", sessionId)
    .maybeSingle();
  return (data?.streak as number | undefined) ?? 0;
}

/** Record one more completed online game for a player. */
export async function recordCompletedGame(sessionId: string): Promise<void> {
  const streak = await getStreak(sessionId);
  await supabase
    .from("player_profiles")
    .upsert(
      { session_id: sessionId, streak: streak + 1, updated_at: new Date().toISOString() },
      { onConflict: "session_id" },
    );
}

/** Drop a player's streak one tier after they disconnect mid-game. */
export async function recordDisconnect(sessionId: string): Promise<void> {
  const streak = await getStreak(sessionId);
  const next = disconnectPenalty(streak);
  if (next === streak) return; // already at "none" — nothing to drop.
  await supabase
    .from("player_profiles")
    .upsert(
      { session_id: sessionId, streak: next, updated_at: new Date().toISOString() },
      { onConflict: "session_id" },
    );
}
