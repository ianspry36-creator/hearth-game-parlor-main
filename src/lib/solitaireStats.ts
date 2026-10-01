import { useCallback, useEffect, useState } from "react";
import type { GameId } from "@/lib/games";

export type SolitaireStats = { won: number; lost: number; abandoned: number };

const key = (game: GameId) => `parlor.stats.${game}`;

function read(game: GameId): SolitaireStats {
  if (typeof window === "undefined") return { won: 0, lost: 0, abandoned: 0 };
  try {
    const raw = window.localStorage.getItem(key(game));
    if (!raw) return { won: 0, lost: 0, abandoned: 0 };
    const parsed = JSON.parse(raw) as Partial<SolitaireStats>;
    return {
      won: Number(parsed.won) || 0,
      lost: Number(parsed.lost) || 0,
      abandoned: Number(parsed.abandoned) || 0,
    };
  } catch {
    return { won: 0, lost: 0, abandoned: 0 };
  }
}

function write(game: GameId, stats: SolitaireStats) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key(game), JSON.stringify(stats));
  }
}

/** Record a finished single-player game (played = won + lost + abandoned). */
export function recordSolitaireResult(game: GameId, result: "win" | "loss" | "abandoned") {
  const stats = read(game);
  if (result === "win") stats.won += 1;
  else if (result === "loss") stats.lost += 1;
  else stats.abandoned += 1;
  write(game, stats);
}

/**
 * Local, per-game single-player record. `played` is derived from won + lost +
 * abandoned, so a hand left unfinished is recorded separately from a real loss.
 */
export function useSolitaireStats(game: GameId) {
  const [stats, setStats] = useState<SolitaireStats>({ won: 0, lost: 0, abandoned: 0 });

  useEffect(() => {
    setStats(read(game));
  }, [game]);

  const recordResult = useCallback(
    (result: "win" | "loss" | "abandoned") => {
      recordSolitaireResult(game, result);
      setStats(read(game));
    },
    [game],
  );

  const reset = useCallback(() => {
    clearSolitaireStats(game);
    setStats({ won: 0, lost: 0, abandoned: 0 });
  }, [game]);

  return {
    won: stats.won,
    lost: stats.lost,
    abandoned: stats.abandoned,
    played: stats.won + stats.lost + stats.abandoned,
    recordResult,
    reset,
  };
}

/** Remove all locally stored single-player statistics for a game (record and best scores). */
export function clearSolitaireStats(game: GameId) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(game));
  window.localStorage.removeItem(`${game}-best-moves`);
  window.localStorage.removeItem(`${game}-best-time`);
}
