import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameId } from "@/lib/games";
import { recordCompletedGame } from "@/lib/medals";

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

export type OpponentStats = {
  opponentSession: string;
  nickname: string;
  avatar: string | null;
  flag: string | null;
  played: number;
  won: number;
  lost: number;
};

type MatchResultRow = {
  host_nickname: string;
  host_session: string;
  host_avatar: string | null;
  host_flag: string | null;
  guest_nickname: string;
  guest_session: string;
  guest_avatar: string | null;
  guest_flag: string | null;
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
 * The current player's head-to-head record against every opponent they have
 * completed a match with, for a given game. A draw counts as a game played but
 * neither a win nor a loss. Rows are ordered by games played, then wins.
 */
export async function fetchOpponentStats(
  game: GameId,
  sessionId: string,
): Promise<OpponentStats[]> {
  const { data } = await supabase
    .from("matches")
    .select(
      "host_nickname, host_session, host_avatar, host_flag, guest_nickname, guest_session, guest_avatar, guest_flag, winner_session, status",
    )
    .eq("game", game)
    .eq("status", "completed");

  const counts = new Map<string, OpponentStats>();
  for (const m of (data ?? []) as MatchResultRow[]) {
    let opponent:
      | { session: string; nickname: string; avatar: string | null; flag: string | null }
      | null = null;

    if (m.host_session === sessionId) {
      opponent = {
        session: m.guest_session,
        nickname: m.guest_nickname,
        avatar: m.guest_avatar,
        flag: m.guest_flag,
      };
    } else if (m.guest_session === sessionId) {
      opponent = {
        session: m.host_session,
        nickname: m.host_nickname,
        avatar: m.host_avatar,
        flag: m.host_flag,
      };
    }
    if (!opponent) continue;

    const entry =
      counts.get(opponent.session) ??
      {
        opponentSession: opponent.session,
        nickname: opponent.nickname,
        avatar: opponent.avatar,
        flag: opponent.flag,
        played: 0,
        won: 0,
        lost: 0,
      };
    entry.played += 1;
    if (m.winner_session != null) {
      if (m.winner_session === sessionId) entry.won += 1;
      else entry.lost += 1;
    }
    // Refresh display fields in case they changed between matches.
    entry.nickname = opponent.nickname;
    entry.avatar = opponent.avatar;
    entry.flag = opponent.flag;
    counts.set(opponent.session, entry);
  }

  return Array.from(counts.values()).sort(
    (a, b) => b.played - a.played || b.won - a.won || a.nickname.localeCompare(b.nickname),
  );
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
 *
 * `delayMs` optionally defers the write so a live opponent who drops right as
 * the game ends still gets their reconnect window before the match is closed
 * out and they are bumped from the table.
 */
export function useRecordMatchResult(
  match: { id: string; host_session: string; guest_session: string } | null,
  isHost: boolean,
  winner: string | null,
  delayMs = 0,
) {
  const lastWinnerRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending write if the component unmounts first.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (winner) {
      if (winner !== lastWinnerRef.current) {
        lastWinnerRef.current = winner;
        const result = winnerToResult(winner);
        if (result && match?.id) {
          // Record the completed game immediately. It must not be deferred by the
          // reconnect window, nor lost when the player navigates back to the game
          // room before that window elapses (route unmount clears the timer below).
          void recordCompletedGame(isHost ? match.host_session : match.guest_session);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            void recordMatchResult(match.id, resolveWinnerSession(isHost, match, result));
          }, delayMs);
        }
      }
    } else {
      lastWinnerRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [winner, match, isHost, delayMs]);
}

