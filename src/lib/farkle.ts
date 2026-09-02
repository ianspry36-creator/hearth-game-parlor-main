export const DICE_COUNT = 6;
export const TARGET = 10000;

export type Die = { face: number; set: boolean };

export const rollFace = () => 1 + Math.floor(Math.random() * 6);

const counts = (faces: number[]) => {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const f of faces) c[f] = (c[f] ?? 0) + 1;
  return c;
};

const tripleBase = (face: number) => (face === 1 ? 1000 : face * 100);

/**
 * Best score for a selection where EVERY die must take part in a combination.
 * Returns null when the selection is not a legal keep.
 */
export function scoreSelection(faces: number[]): number | null {
  if (!faces.length) return null;
  return best(counts(faces));
}

function best(c: number[]): number | null {
  const total = c.reduce((s, n) => s + n, 0);
  if (total === 0) return 0;

  const options: number[] = [];

  // Straight 1-6
  if (total === 6 && c.slice(1).every((n) => n === 1)) options.push(1500);

  // Three pairs
  if (total === 6 && c.slice(1).filter((n) => n === 2).length === 3) options.push(1500);

  // Two triplets
  if (total === 6 && c.slice(1).filter((n) => n === 3).length === 2) options.push(2500);

  for (let face = 1; face <= 6; face += 1) {
    const n = c[face] ?? 0;
    if (n >= 3) {
      for (let take = 3; take <= n; take += 1) {
        const next = [...c];
        next[face] = n - take;
        const rest = best(next);
        if (rest !== null) options.push(tripleBase(face) * Math.pow(2, take - 3) + rest);
      }
    }
  }

  if ((c[1] ?? 0) > 0) {
    const next = [...c];
    next[1] = (c[1] ?? 0) - 1;
    const rest = best(next);
    if (rest !== null) options.push(100 + rest);
  }

  if ((c[5] ?? 0) > 0) {
    const next = [...c];
    next[5] = (c[5] ?? 0) - 1;
    const rest = best(next);
    if (rest !== null) options.push(50 + rest);
  }

  if (!options.length) return null;
  return Math.max(...options);
}

/** Does this roll contain anything at all that can be kept? */
export function hasScoring(faces: number[]): boolean {
  const c = counts(faces);
  if ((c[1] ?? 0) > 0 || (c[5] ?? 0) > 0) return true;
  if (c.slice(1).some((n) => n >= 3)) return true;
  if (faces.length === 6 && c.slice(1).filter((n) => n === 2).length === 3) return true;
  return false;
}

/** The highest-scoring legal keep from a roll, as indexes into `faces`. */
export function bestKeep(faces: number[]): { indexes: number[]; score: number } | null {
  let winner: { indexes: number[]; score: number } | null = null;
  for (let mask = 1; mask < 1 << faces.length; mask += 1) {
    const indexes: number[] = [];
    for (let i = 0; i < faces.length; i += 1) if (mask & (1 << i)) indexes.push(i);
    const score = scoreSelection(indexes.map((i) => faces[i]!));
    if (score === null) continue;
    if (!winner || score > winner.score || (score === winner.score && indexes.length < winner.indexes.length)) {
      winner = { indexes, score };
    }
  }
  return winner;
}

/** Charlotte banks once the turn is worth having, or when the risk gets steep. */
export function shouldBank(turnScore: number, diceLeft: number, behindBy: number): boolean {
  if (diceLeft === 0) return false; // hot dice — always worth another throw
  if (behindBy > 1500 && turnScore < 1000) return false;
  if (diceLeft <= 2) return turnScore >= 300;
  if (diceLeft === 3) return turnScore >= 500;
  return turnScore >= 750;
}
