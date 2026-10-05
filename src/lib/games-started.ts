import { useCallback, useEffect, useRef } from "react";
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

/**
 * Track a single game's lifecycle in `games_started` from a React component.
 *
 * - On mount it inserts an `"in play"` row and remembers its id.
 * - `end(status)` flips that row to a completion status (won / conceded / …).
 * - `beginNew()` marks the current row `"new game"` and opens a fresh row, for
 *   "New game" resets that should supersede the previous hand.
 *
 * All writes are fire-and-forget and fail soft, so a missing table never
 * interrupts play.
 */
export function useGameStarted(gameName: string) {
  const rowRef = useRef<string | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void startGame(gameName).then((id) => {
      if (!cancelled) rowRef.current = id;
    });
    return () => {
      cancelled = true;
    };
  }, [gameName]);

  const end = useCallback((status: GameCompletionStatus) => {
    endedRef.current = true;
    void updateGameStatus(rowRef.current, status);
  }, []);

  const beginNew = useCallback(() => {
    // A finished hand (won / lost / conceded) keeps its outcome; only an
    // abandoned, still-in-play hand is marked "new game" before we open a
    // fresh row for the next deal.
    if (!endedRef.current) {
      void updateGameStatus(rowRef.current, "new game");
    }
    endedRef.current = false;
    void startGame(gameName).then((id) => {
      rowRef.current = id;
    });
  }, [gameName]);

  return { end, beginNew };
}
