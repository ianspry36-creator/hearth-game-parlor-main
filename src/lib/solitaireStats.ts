import { useCallback, useEffect, useState } from "react";
import type { GameId } from "@/lib/games";

export type SolitaireStats = { won: number; lost: number };

const key = (game: GameId) => `parlor.stats.${game}`;

function read(game: GameId): SolitaireStats {
  if (typeof window === "undefined") return { won: 0, lost: 0 };
  try {
    const raw = window.localStorage.getItem(key(game));
    if (!raw) return { won: 0, lost: 0 };
    const parsed = JSON.parse(raw) as Partial<SolitaireStats>;
    return { won: Number(parsed.won) || 0, lost: Number(parsed.lost) || 0 };
  } catch {
    return { won: 0, lost: 0 };
  }
}

function write(game: GameId, stats: SolitaireStats) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key(game), JSON.stringify(stats));
  }
}

/** Record a finished single-player game (played = won + lost). */
export function recordSolitaireResult(game: GameId, result: "win" | "loss") {
  const stats = read(game);
  if (result === "win") stats.won += 1;
  else stats.lost += 1;
  write(game, stats);
}

/**
 * Local, per-game single-player record. `played` is derived from won + lost,
 * so an abandoned hand counted as a loss is reflected here too.
 */
export function useSolitaireStats(game: GameId) {
  const [stats, setStats] = useState<SolitaireStats>({ won: 0, lost: 0 });

  useEffect(() => {
    setStats(read(game));
  }, [game]);

  const recordResult = useCallback(
    (result: "win" | "loss") => {
      recordSolitaireResult(game, result);
      setStats(read(game));
    },
    [game],
  );

  return { won: stats.won, lost: stats.lost, played: stats.won + stats.lost, recordResult };
}
