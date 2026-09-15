/**
 * Backgammon engine.
 * Board is 24 points, index 0 = point 1 ... index 23 = point 24.
 * Positive counts = human (moves from high index to low index, bears off below 0).
 * Negative counts = computer (moves from low index to high index, bears off above 23).
 */

export type Player = "human" | "cpu";

export type BoardState = {
  points: number[];
  bar: { human: number; cpu: number };
  off: { human: number; cpu: number };
};

export type Move = {
  from: number | "bar";
  to: number | "off";
  dice: number[];
  /**
   * Intermediate landing points (in order) for a combined move that plays two or
   * more dice on a single checker. Empty/omitted for single-die, bar, and off moves.
   */
  via?: number[];
};

export function initialBoard(): BoardState {
  const points = new Array(24).fill(0);
  points[23] = 2;
  points[12] = 5;
  points[7] = 3;
  points[5] = 5;
  points[0] = -2;
  points[11] = -5;
  points[16] = -3;
  points[18] = -5;
  return { points, bar: { human: 0, cpu: 0 }, off: { human: 0, cpu: 0 } };
}

export const rollDie = () => 1 + Math.floor(Math.random() * 6);

export function rollDice(): number[] {
  const a = rollDie();
  const b = rollDie();
  return a === b ? [a, a, a, a] : [a, b];
}

const sign = (p: Player) => (p === "human" ? 1 : -1);
const owns = (count: number, p: Player) => (p === "human" ? count > 0 : count < 0);

function inHomeBoard(board: BoardState, p: Player): boolean {
  if (board.bar[p] > 0) return false;
  for (let i = 0; i < 24; i++) {
    if (!owns(board.points[i]!, p)) continue;
    if (p === "human" && i > 5) return false;
    if (p === "cpu" && i < 18) return false;
  }
  return true;
}

function destination(from: number, die: number, p: Player): number {
  return p === "human" ? from - die : from + die;
}

function canLand(board: BoardState, to: number, p: Player): boolean {
  const count = board.points[to]!;
  if (owns(count, p)) return true;
  return Math.abs(count) <= 1;
}

/** True when a checker sits further from home than `from` (rules out overshooting). */
function hasFurtherChecker(board: BoardState, from: number, p: Player): boolean {
  return p === "human"
    ? board.points.slice(from + 1, 6).some((c) => c > 0)
    : board.points.slice(18, from).some((c) => c < 0);
}

export function legalMoves(board: BoardState, dice: number[], p: Player): Move[] {
  const moves: Move[] = [];
  const dieSet = [...new Set(dice)];

  if (board.bar[p] > 0) {
    for (const die of dieSet) {
      const to = p === "human" ? 24 - die : die - 1;
      if (canLand(board, to, p)) moves.push({ from: "bar", to, dice: [die] });
    }
    return moves;
  }

  const home = inHomeBoard(board, p);
  for (const die of dieSet) {
    for (let from = 0; from < 24; from++) {
      if (!owns(board.points[from]!, p)) continue;
      const to = destination(from, die, p);
      if (to >= 0 && to <= 23) {
        if (canLand(board, to, p)) moves.push({ from, to, dice: [die] });
      } else if (home) {
        const pipsNeeded = p === "human" ? from + 1 : 24 - from;
        if (die === pipsNeeded) {
          moves.push({ from, to: "off", dice: [die] });
        } else if (die > pipsNeeded) {
          // Only legal when no checker sits further from home
          if (!hasFurtherChecker(board, from, p)) moves.push({ from, to: "off", dice: [die] });
        }
      }
    }
  }

  // Combined moves: play two or more dice on a single checker (e.g. 3 + 5 = 8,
  // or all four dice on a double). Every distinct ordering is emitted so the
  // player (and the CPU) can pick whichever path the board allows, and the
  // chosen sequence of intermediate points is recorded in `via` so it can be
  // animated as separate single-die steps.
  const seen = new Set<string>();
  const addCombined = (from: number, seq: number[], to: number | "off", via: number[]) => {
    const key = `${from}|${to}|${seq.join(",")}|${via.join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    moves.push({ from, to, dice: [...seq], via: via.length ? via : undefined });
  };

  const used = new Array<boolean>(dice.length).fill(false);
  const walk = (from: number, positions: number[], seq: number[]) => {
    const pos = positions[positions.length - 1]!;
    for (let i = 0; i < dice.length; i++) {
      if (used[i]) continue;
      const die = dice[i]!;
      const next = destination(pos, die, p);
      used[i] = true;
      const newSeq = [...seq, die];
      if (next >= 0 && next <= 23 && canLand(board, next, p)) {
        if (newSeq.length >= 2) addCombined(from, newSeq, next, positions.slice(1));
        walk(from, [...positions, next], newSeq);
      } else if (home && (next < 0 || next > 23)) {
        // Bear off with the sum of the dice: legal when the last die lands the
        // checker exactly, or overshoots with no checker further from home.
        const pipsNeeded = p === "human" ? pos + 1 : 24 - pos;
        if (
          newSeq.length >= 2 &&
          (die === pipsNeeded || (die > pipsNeeded && !hasFurtherChecker(board, pos, p)))
        ) {
          addCombined(from, newSeq, "off", positions.slice(1));
        }
      }
      used[i] = false;
    }
  };

  for (let from = 0; from < 24; from++) {
    if (!owns(board.points[from]!, p)) continue;
    walk(from, [from], []);
  }

  return moves;
}

export type ApplyResult = { board: BoardState; hit: boolean };

export function applyMove(board: BoardState, move: Move, p: Player): ApplyResult {
  const next: BoardState = {
    points: [...board.points],
    bar: { ...board.bar },
    off: { ...board.off },
  };
  const s = sign(p);
  const opponent: Player = p === "human" ? "cpu" : "human";

  if (move.from === "bar") next.bar[p] -= 1;
  else next.points[move.from] = next.points[move.from]! - s;

  let hit = false;
  if (move.to === "off") {
    next.off[p] += 1;
  } else {
    if (owns(next.points[move.to]!, opponent) && Math.abs(next.points[move.to]!) === 1) {
      next.points[move.to] = 0;
      next.bar[opponent] += 1;
      hit = true;
    }
    next.points[move.to] = next.points[move.to]! + s;
  }

  return { board: next, hit };
}

/** Remove one instance of each die in `used` from a copy of `dice`. */
export function consumeDice(dice: number[], used: number[]): number[] {
  const rest = [...dice];
  for (const d of used) {
    const idx = rest.indexOf(d);
    if (idx !== -1) rest.splice(idx, 1);
  }
  return rest;
}

/**
 * Break a move into its single-die legs so each can be animated separately.
 * A combined move becomes one leg per die: `from → via[0] → … → to`, each step
 * carrying a single die. Single-die, bar, and off moves are returned as-is.
 */
export function splitMove(move: Move): Move[] {
  const via = move.via ?? [];
  if (via.length === 0) return [move];
  const legs: Move[] = [];
  let from: number | "bar" = move.from;
  for (let i = 0; i < via.length; i++) {
    legs.push({ from, to: via[i]!, dice: [move.dice[i]!] });
    from = via[i]!;
  }
  legs.push({ from, to: move.to, dice: [move.dice[move.dice.length - 1]!] });
  return legs;
}

export const winner = (board: BoardState): Player | null =>
  board.off.human === 15 ? "human" : board.off.cpu === 15 ? "cpu" : null;

export function pipCount(board: BoardState, p: Player): number {
  let pips = board.bar[p] * 25;
  for (let i = 0; i < 24; i++) {
    const count = board.points[i]!;
    if (!owns(count, p)) continue;
    const distance = p === "human" ? i + 1 : 24 - i;
    pips += Math.abs(count) * distance;
  }
  return pips;
}

/** Greedy heuristic: hit blots, make points, avoid leaving blots, race home. */
export function chooseCpuMove(board: BoardState, dice: number[]): Move | null {
  const moves = legalMoves(board, dice, "cpu");
  if (!moves.length) return null;
  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const move of moves) {
    const { board: after, hit } = applyMove(board, move, "cpu");
    let score = 0;
    if (hit) score += 40;
    if (move.to === "off") score += 30;
    else if (after.points[move.to]! <= -2) score += 12;
    else if (after.points[move.to]! === -1) score -= 8;
    score += move.dice.reduce((sum, die) => sum + die, 0);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
