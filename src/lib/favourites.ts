import { useEffect, useState } from "react";
import type { GameId } from "@/lib/games";

const KEY = "cardsandgames.favourites";

/** Read the saved favourites as a Set, or an empty Set when unavailable. */
export function readFavourites(): Set<GameId> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is GameId => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeFavourites(ids: Set<GameId>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable (private mode, etc.) — favourites simply won't persist.
  }
}

/**
 * Favourite games, persisted in localStorage. Starts empty and hydrates on
 * mount to avoid a server/client mismatch before the browser is available.
 */
export function useFavourites() {
  const [favourites, setFavourites] = useState<Set<GameId>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFavourites(readFavourites());
    setHydrated(true);
  }, []);

  const isFavourite = (id: GameId) => favourites.has(id);

  const toggleFavourite = (id: GameId) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeFavourites(next);
      return next;
    });
  };

  return { favourites, hydrated, isFavourite, toggleFavourite };
}
