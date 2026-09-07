import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameId } from "@/lib/games";

/** The nine single-player tables, which have no named opponent to rank. */
const SOLO_GAMES: GameId[] = [
  "solitaire",
  "freecell",
  "addiction",
  "kings-in-the-corner",
  "canfield",
  "clock",
  "scorpion",
  "tripeaks",
  "yukon",
];

export const isSoloGame = (id: GameId): boolean => SOLO_GAMES.includes(id);

export type LeaderboardEntry = {
  nickname: string;
  played: number;
  won: number;
  lost: number;
};

type MatchResultRow = {
  host_nickname: string;
  host_session: string;
  guest_nickname: string;
  guest_session: string;
  winner_session: string | null;
  status: string;
};

/**
 * Mark a match finished with its winner. `winnerSession` is null for a draw.
 * Both the winner's and the loser's clients converge on the same value, so a
 * second write is harmless.
 */
export async function recordMatchResult(
  matchId: string,
  winnerSession: string | null,
): Promise<void> {
  await supabase
    .from("matches")
    .update({
      winner_session: winnerSession,
      status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);
}

/** Map a local result to the winning player's session id (null for a draw). */
export function resolveWinnerSession(
  isHost: boolean,
  match: { host_session: string; guest_session: string } | null,
  result: "win" | "loss" | "draw",
): string | null {
  if (!match || result === "draw") return null;
  const mySession = isHost ? match.host_session : match.guest_session;
  const oppSession = isHost ? match.guest_session : match.host_session;
  return result === "win" ? mySession : oppSession;
}

function bump(
  counts: Map<string, LeaderboardEntry>,
  nickname: string,
  won: boolean | null,
) {
  const entry = counts.get(nickname) ?? { nickname, played: 0, won: 0, lost: 0 };
  entry.played += 1;
  if (won === true) entry.won += 1;
  else if (won === false) entry.lost += 1;
  counts.set(nickname, entry);
}

/**
 * The top `limit` nicknamed players for a game, ordered by wins then games
 * played. Leaving a game (a forfeit) is already reflected because the winner
 * records `winner_session`, which casts the other player as the loser.
 */
export async function fetchLeaderboard(
  game: GameId,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const { data } = await supabase
    .from("matches")
    .select("host_nickname, host_session, guest_nickname, guest_session, winner_session, status")
    .eq("game", game)
    .eq("status", "completed");

  const counts = new Map<string, LeaderboardEntry>();
  for (const m of (data ?? []) as MatchResultRow[]) {
    const hostResult =
      m.winner_session == null ? null : m.winner_session === m.host_session;
    const guestResult =
      m.winner_session == null ? null : m.winner_session === m.guest_session;
    bump(counts, m.host_nickname, hostResult);
    bump(counts, m.guest_nickname, guestResult);
  }

  return Array.from(counts.values())
    .sort(
      (a, b) =>
        b.won - a.won || b.played - a.played || a.nickname.localeCompare(b.nickname),
    )
    .slice(0, limit);
}

/**
 * Turn a game's winner seat into a local result. A null winner means the game
 * is still in progress. `"draw"` maps to a draw; the computer/bot seats map to
 * a loss; every other seat (`"human"`, `"you"`, `"player"`) is the local player.
 */
function winnerToResult(winner: string | null): "win" | "loss" | "draw" | null {
  if (!winner) return null;
  if (winner === "draw") return "draw";
  if (winner === "cpu" || winner === "ada" || winner === "leo") return "loss";
  return "win";
}

/**
 * Record a multiplayer match result the moment a winner is decided. Call this
 * from each multiplayer route with its `state.winner`; it records exactly once
 * per finished game (per client) and is idempotent across the two clients.
 */
export function useRecordMatchResult(
  match: { id: string; host_session: string; guest_session: string } | null,
  isHost: boolean,
  winner: string | null,
) {
  const lastWinnerRef = useRef<string | null>(null);

  useEffect(() => {
    if (winner) {
      if (winner !== lastWinnerRef.current) {
        lastWinnerRef.current = winner;
        const result = winnerToResult(winner);
        if (result && match?.id) {
          void recordMatchResult(match.id, resolveWinnerSession(isHost, match, result));
        }
      }
    } else {
      lastWinnerRef.current = null;
    }
  }, [winner, match, isHost]);
}

