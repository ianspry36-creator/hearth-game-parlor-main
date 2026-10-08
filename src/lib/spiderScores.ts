import type { SpiderDifficulty } from "./spider";

/** How many of a player's best scores are kept for each difficulty. */
export const BEST_SCORES_LIMIT = 10;

const key = (difficulty: SpiderDifficulty) => `spider-best-scores-${difficulty}`;
const legacyKey = (difficulty: SpiderDifficulty) => `spider-best-score-${difficulty}`;

/** Read the saved top scores for a difficulty, best first. */
export function readBestScores(difficulty: SpiderDifficulty): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(difficulty));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const list = parsed
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (list.length > 0) return list.sort((a, b) => b - a).slice(0, BEST_SCORES_LIMIT);
      }
    }
    // Migrate the legacy single best score if a list hasn't been saved yet.
    const legacy = Number(window.localStorage.getItem(legacyKey(difficulty)) || 0);
    return legacy > 0 ? [legacy] : [];
  } catch {
    return [];
  }
}

/** Record a finished game's score, keeping only the top scores. Returns the new list. */
export function recordBestScore(difficulty: SpiderDifficulty, value: number): number[] {
  if (typeof window === "undefined" || !Number.isFinite(value) || value <= 0) {
    return readBestScores(difficulty);
  }
  const next = [...readBestScores(difficulty), value]
    .sort((a, b) => b - a)
    .slice(0, BEST_SCORES_LIMIT);
  try {
    window.localStorage.setItem(key(difficulty), JSON.stringify(next));
  } catch {
    // storage unavailable; ignore
  }
  return next;
}

/** Remove every saved score for a difficulty. */
export function clearBestScores(difficulty: SpiderDifficulty): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(difficulty));
    window.localStorage.removeItem(legacyKey(difficulty));
  } catch {
    // ignore
  }
}
