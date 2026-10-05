import { supabase } from "@/integrations/supabase/client";
import { getNickname, getSessionId } from "@/lib/multiplayer";

/** How a started game can end, written to `games_started.completed_status`. */
export type GameCompletionStatus =
  | "in play"
  | "won"
  | "lost"
  | "conceded"
  | "error"
  | "new game"
  | "game room"
  | "other";

/**
 * Insert a row for a freshly started game and return its id so later events
 * (win / loss / concede / leaving) can update the same row. Returns null when
 * the write fails (e.g. the table is missing), so callers keep playing.
 */
export async function startGame(gameName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("games_started")
    .insert({
      game_name: gameName,
      nickname: getNickname(),
      session_id: getSessionId(),
      completed_status: "in play",
    })
    .select("id")
    .single();
  if (error) {
    console.error("[games-started] startGame failed:", error);
    return null;
  }
  return data?.id ?? null;
}

/** Mark a started game's completion status (won, conceded, new game, …). */
export async function updateGameStatus(
  rowId: string | null,
  status: GameCompletionStatus,
): Promise<void> {
  if (!rowId) return;
  const { error } = await supabase
    .from("games_started")
    .update({ completed_status: status })
    .eq("id", rowId);
  if (error) console.error("[games-started] updateGameStatus failed:", error);
}
