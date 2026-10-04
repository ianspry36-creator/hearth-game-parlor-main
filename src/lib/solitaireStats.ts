import { useCallback, useEffect, useState } from "react";
import type { GameId } from "@/lib/games";

export type SolitaireStats = { won: number; lost: number; abandoned: number };

const key = (game: GameId, variant?: string) =>
  variant ? `parlor.stats.${game}.${variant}` : `parlor.stats.${game}`;

function read(game: GameId, variant?: string): SolitaireStats {
  if (typeof window === "undefined") return { won: 0, lost: 0, abandoned: 0 };
  try {
    const raw = window.localStorage.getItem(key(game, variant));
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

function write(game: GameId, stats: SolitaireStats, variant?: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key(game, variant), JSON.stringify(stats));
  }
}

/** Fired whenever single-player statistics change so open dialogs stay in sync. */
const STATS_CHANGED_EVENT = "parlor.stats.changed";

/** Record a finished single-player game (played = won + lost + abandoned). */
export function recordSolitaireResult(
  game: GameId,
  result: "win" | "loss" | "abandoned",
  variant?: string,
) {
  const stats = read(game, variant);
  if (result === "win") stats.won += 1;
  else if (result === "loss") stats.lost += 1;
  else stats.abandoned += 1;
  write(game, stats, variant);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<GameId>(STATS_CHANGED_EVENT, { detail: game }));
  }
}

/**
 * Local, per-game single-player record. `played` is derived from won + lost +
 * abandoned, so a hand left unfinished is recorded separately from a real loss.
 *
 * `variant` scopes the record to a sub-key (e.g. a difficulty level), so a game
 * like checkers can keep separate records for easy / medium / hard.
 */
export function useSolitaireStats(game: GameId, variant?: string) {
  const [stats, setStats] = useState<SolitaireStats>({ won: 0, lost: 0, abandoned: 0 });

  useEffect(() => {
    setStats(read(game, variant));
    const sync = (e: Event) => {
      if ((e as CustomEvent<GameId>).detail === game) setStats(read(game, variant));
    };
    window.addEventListener(STATS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(STATS_CHANGED_EVENT, sync);
  }, [game, variant]);

  const recordResult = useCallback(
    (result: "win" | "loss" | "abandoned") => {
      recordSolitaireResult(game, result, variant);
      setStats(read(game, variant));
    },
    [game, variant],
  );

  const reset = useCallback(() => {
    clearSolitaireStats(game, variant);
    setStats({ won: 0, lost: 0, abandoned: 0 });
  }, [game, variant]);

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
export function clearSolitaireStats(game: GameId, variant?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(game, variant));
  if (!variant) {
    window.localStorage.removeItem(`${game}-best-moves`);
    window.localStorage.removeItem(`${game}-best-time`);
  }
  window.dispatchEvent(new CustomEvent<GameId>(STATS_CHANGED_EVENT, { detail: game }));
}
