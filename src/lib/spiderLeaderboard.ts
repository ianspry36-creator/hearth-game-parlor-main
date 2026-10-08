import { supabase } from "@/integrations/supabase/client";
import { getNickname, getSessionId } from "@/lib/multiplayer";
import type { SpiderDifficulty } from "./spider";

/** How many of the best players are shown per difficulty. */
export const SPIDER_LEADERBOARD_LIMIT = 10;

/** A single player's best score on the shared Spider leaderboard. */
export type SpiderLeaderboardEntry = {
  nickname: string;
  score: number;
};

/** Fallback label for a solo player who has not picked a nickname yet. */
const ANONYMOUS = "Anonymous";

/**
 * Push a finished game's score onto the shared online leaderboard, keeping only
 * each player's best score for the difficulty. The write is a no-op when the
 * player already has an equal-or-better score on record.
 */
export async function recordSpiderScore(
  difficulty: SpiderDifficulty,
  value: number,
): Promise<void> {
  if (!Number.isFinite(value) || value <= 0) return;

  const sessionId = getSessionId();
  if (!sessionId) return;
  const nickname = getNickname()?.trim() || ANONYMOUS;

  // Only bump the record when this run actually improves on the saved best.
  const { data, error } = await supabase
    .from("spider_scores")
    .select("score")
    .eq("session_id", sessionId)
    .eq("difficulty", difficulty)
    .maybeSingle();

  if (error) {
    console.error("[spider] recordSpiderScore lookup failed:", error);
    return;
  }
  if (data && data.score >= value) return;

  const { error: upsertError } = await supabase.from("spider_scores").upsert(
    { session_id: sessionId, nickname, difficulty, score: value },
    { onConflict: "session_id,difficulty" },
  );
  if (upsertError) {
    console.error("[spider] recordSpiderScore upsert failed:", upsertError);
  }
}

/**
 * The top `limit` best scores for a difficulty across every player, best first.
 */
export async function fetchSpiderLeaderboard(
  difficulty: SpiderDifficulty,
  limit = SPIDER_LEADERBOARD_LIMIT,
): Promise<SpiderLeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("spider_scores")
    .select("nickname, score")
    .eq("difficulty", difficulty)
    .order("score", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[spider] fetchSpiderLeaderboard failed:", error);
    return [];
  }

  return (data ?? []).map((row) => ({ nickname: row.nickname, score: row.score }));
}
