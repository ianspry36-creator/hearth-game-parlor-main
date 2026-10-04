// Reversi (Othello) — an 8×8 board of dark and light discs. Place a disc and
// every opposing disc you sandwich in a straight line flips to your colour.

export type Player = "human" | "cpu";
export type Cell = Player | null;
/** 64 cells in row-major order. */
export type Board = Cell[];

export const SIZE = 8;

export const flip = (player: Player): Player => (player === "human" ? "cpu" : "human");

export const idx = (row: number, col: number) => row * SIZE + col;
export const cellRC = (i: number) => ({ row: Math.floor(i / SIZE), col: i % SIZE });
const inBounds = (row: number, col: number) => row >= 0 && row < SIZE && col >= 0 && col < SIZE;

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/** The standard Othello opening: two discs of each colour in the centre. */
export function makeInitialBoard(): Board {
  const board: Cell[] = Array.from({ length: SIZE * SIZE }, () => null);
  board[idx(3, 3)] = "human";
  board[idx(4, 4)] = "human";
  board[idx(3, 4)] = "cpu";
  board[idx(4, 3)] = "cpu";
  return board;
}

/** Chess-style name of a square, e.g. cell 0 is "a1", cell 63 is "h8". */
export function squareName(i: number): string {
  const { row, col } = cellRC(i);
  return `${String.fromCharCode(97 + col)}${row + 1}`;
}

/** Every empty square where `player` may legally place a disc. */
export function legalMoves(board: Board, player: Player): number[] {
  const opponent = flip(player);
  const moves: number[] = [];
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] !== null) continue;
    const { row, col } = cellRC(i);
    let legal = false;
    for (const [dr, dc] of DIRECTIONS) {
      let r = row + dr;
      let c = col + dc;
      let found = false;
      while (inBounds(r, c) && board[idx(r, c)] === opponent) {
        found = true;
        r += dr;
        c += dc;
      }
      if (found && inBounds(r, c) && board[idx(r, c)] === player) {
        legal = true;
        break;
      }
    }
    if (legal) moves.push(i);
  }
  return moves;
}

/** Place a disc for `player` and flip every sandwiched line. Assumes legal. */
export function applyMove(board: Board, player: Player, index: number): Board {
  if (board[index] !== null) return board;
  const opponent = flip(player);
  const next = board.slice();
  next[index] = player;
  const { row, col } = cellRC(index);
  for (const [dr, dc] of DIRECTIONS) {
    const line: number[] = [];
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c) && board[idx(r, c)] === opponent) {
      line.push(idx(r, c));
      r += dr;
      c += dc;
    }
    if (line.length && inBounds(r, c) && board[idx(r, c)] === player) {
      for (const cell of line) next[cell] = player;
    }
  }
  return next;
}

export function countDiscs(board: Board): { human: number; cpu: number } {
  let human = 0;
  let cpu = 0;
  for (const cell of board) {
    if (cell === "human") human += 1;
    else if (cell === "cpu") cpu += 1;
  }
  return { human, cpu };
}

/** The game is over once neither side has a legal move. */
export function isGameOver(board: Board): boolean {
  return legalMoves(board, "human").length === 0 && legalMoves(board, "cpu").length === 0;
}

const CORNERS = new Set([idx(0, 0), idx(0, SIZE - 1), idx(SIZE - 1, 0), idx(SIZE - 1, SIZE - 1)]);

export type Difficulty = "easy" | "medium" | "hard";

const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];

/** The next difficulty when the toggle is clicked, wrapping hard → easy. */
export function nextDifficulty(difficulty: Difficulty): Difficulty {
  const index = DIFFICULTY_ORDER.indexOf(difficulty);
  return DIFFICULTY_ORDER[(index + 1) % DIFFICULTY_ORDER.length]!;
}

const DIFFICULTY_KEY = "parlor.reversi.difficulty";

/** Read the saved reversi difficulty, defaulting to "easy". */
export function readDifficulty(): Difficulty {
  if (typeof window === "undefined") return "easy";
  try {
    const stored = window.localStorage.getItem(DIFFICULTY_KEY);
    return stored === "medium" || stored === "hard" ? stored : "easy";
  } catch {
    return "easy";
  }
}

/** Persist the chosen reversi difficulty. */
export function writeDifficulty(difficulty: Difficulty) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DIFFICULTY_KEY, difficulty);
  } catch {
    // Ignore storage failures (private browsing, etc.).
  }
}

// Positional weights favour corners and edges while penalising the cells that
// hand the opponent a corner (the squares adjacent to each corner).
const POSITIONAL_WEIGHTS: number[] = [
  100, -20, 10, 5, 5, 10, -20, 100, -20, -50, -2, -2, -2, -2, -50, -20, 10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 1, 1, 1, -2, 5, 5, -2, 1, 1, 1, 1, -2, 5, 10, -2, 1, 1, 1, 1, -2, 10, -20, -50, -2, -2,
  -2, -2, -50, -20, 100, -20, 10, 5, 5, 10, -20, 100,
];

const HARD_DEPTH = 4;

/** Score the board from `player`'s point of view using positional weights. */
function evaluate(board: Board, player: Player): number {
  let score = 0;
  for (let i = 0; i < board.length; i += 1) {
    const cell = board[i];
    if (cell === player) score += POSITIONAL_WEIGHTS[i]!;
    else if (cell !== null) score -= POSITIONAL_WEIGHTS[i]!;
  }
  return score;
}

/** Negamax search; passes the turn when a side has no legal move. */
function negamax(board: Board, player: Player, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(board, player);
  if (moves.length === 0) {
    const opponent = flip(player);
    if (legalMoves(board, opponent).length === 0) {
      const discs = countDiscs(board);
      const mine = discs[player];
      const theirs = discs[opponent];
      return mine > theirs ? 10000 : mine < theirs ? -10000 : 0;
    }
    return -negamax(board, opponent, depth, -beta, -alpha);
  }
  if (depth === 0) return evaluate(board, player);

  let best = Number.NEGATIVE_INFINITY;
  for (const move of moves) {
    const value = -negamax(applyMove(board, player, move), flip(player), depth - 1, -beta, -alpha);
    if (value > best) best = value;
    if (value > alpha) alpha = value;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Ada's move. The difficulty controls how hard she tries: easy plays at
 * random, medium plays greedily (corner first, then most discs flipped with a
 * small edge bonus), and hard searches a few plies ahead with positional
 * weighting.
 */
export function chooseMove(
  board: Board,
  player: Player,
  difficulty: Difficulty = "medium",
): number | null {
  const moves = legalMoves(board, player);
  if (!moves.length) return null;

  if (difficulty === "easy") {
    return moves[Math.floor(Math.random() * moves.length)]!;
  }

  if (difficulty === "hard") {
    let best = moves[0]!;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const move of moves) {
      const value = -negamax(
        applyMove(board, player, move),
        flip(player),
        HARD_DEPTH - 1,
        -Infinity,
        Infinity,
      );
      if (value > bestValue) {
        bestValue = value;
        best = move;
      }
    }
    return best;
  }

  // medium: greedy — corner, then most discs flipped with an edge bonus.
  const corner = moves.find((move) => CORNERS.has(move));
  if (corner !== undefined) return corner;

  let best = moves[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const move of moves) {
    const after = applyMove(board, player, move);
    const gained = countDiscs(after)[player] - countDiscs(board)[player];
    const { row, col } = cellRC(move);
    const edgeBonus = row === 0 || row === SIZE - 1 || col === 0 || col === SIZE - 1 ? 0.5 : 0;
    const score = gained + edgeBonus;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
