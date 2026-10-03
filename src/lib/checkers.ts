// Checkers (English draughts) — an 8×8 board of 12 men per side, played only on
// the dark squares. Jump over an opponent's man to capture it, crown a man on the
// far row, and capture every piece (or block your opponent) to win.
//
// Coordinates are row-major (0..63). Human men start on rows 5–7 and move up
// (toward row 0); the computer's men start on rows 0–2 and move down.

export type Player = "human" | "cpu";
export type Piece = { id: number; owner: Player; king: boolean };
/** null = empty square. Only dark squares ever hold a piece. */
export type Cell = Piece | null;
export type Board = Cell[];

export const SIZE = 8;

export const flip = (player: Player): Player => (player === "human" ? "cpu" : "human");

export const idx = (row: number, col: number) => row * SIZE + col;
export const cellRC = (i: number) => ({ row: Math.floor(i / SIZE), col: i % SIZE });
const inBounds = (row: number, col: number) =>
  row >= 0 && row < SIZE && col >= 0 && col < SIZE;

/** Only the dark squares are used: they satisfy (row + col) is odd. */
export const isDark = (row: number, col: number) => (row + col) % 2 === 1;

/** Chess-style name of a square, e.g. cell 0 is "a8", cell 63 is "h1". */
export function squareName(i: number): string {
  const { row, col } = cellRC(i);
  return `${String.fromCharCode(97 + col)}${SIZE - row}`;
}

/** The standard opening: twelve men each on the three rows nearest the player. */
export function makeInitialBoard(): Board {
  const board: Cell[] = Array.from({ length: SIZE * SIZE }, () => null);
  let id = 0;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (!isDark(row, col)) continue;
      if (row < 3) board[idx(row, col)] = { id: id++, owner: "cpu", king: false };
      else if (row > 4) board[idx(row, col)] = { id: id++, owner: "human", king: false };
    }
  }
  return board;
}

/** The vertical direction a man travels: human moves up, the computer down. */
const forward = (piece: Piece) => (piece.owner === "human" ? -1 : 1);


/** Single-step diagonal slides onto empty squares. */
export function normalMoves(board: Board, from: number): number[] {
  const piece = board[from];
  if (!piece) return [];
  const { row, col } = cellRC(from);
  const rows = piece.king ? [-1, 1] : [forward(piece)];
  const out: number[] = [];
  for (const dr of rows) {
    for (const dc of [-1, 1]) {
      const r = row + dr;
      const c = col + dc;
      if (inBounds(r, c) && board[idx(r, c)] === null) out.push(idx(r, c));
    }
  }
  return out;
}

/** Single-jump landings: over an opponent's piece onto an empty square. */
export function captureMoves(board: Board, from: number): number[] {
  const piece = board[from];
  if (!piece) return [];
  const { row, col } = cellRC(from);
  const rows = piece.king ? [-1, 1] : [forward(piece)];
  const out: number[] = [];
  for (const dr of rows) {
    for (const dc of [-1, 1]) {
      const r = row + dr;
      const c = col + dc;
      const r2 = row + 2 * dr;
      const c2 = col + 2 * dc;
      if (!inBounds(r, c) || !inBounds(r2, c2)) continue;
      const jumped = board[idx(r, c)];
      if (jumped && jumped.owner !== piece.owner && board[idx(r2, c2)] === null) {
        out.push(idx(r2, c2));
      }
    }
  }
  return out;
}

/** True when `player` has at least one capture available anywhere. */
export function hasAnyCapture(board: Board, player: Player): boolean {
  for (let i = 0; i < board.length; i += 1) {
    const piece = board[i];
    if (piece && piece.owner === player && captureMoves(board, i).length > 0) return true;
  }
  return false;
}

/**
 * Legal destinations for the piece at `from`. Capturing is compulsory: when any
 * capture is available, only captures may be made, and a piece that cannot
 * capture may not move at all this turn.
 */
export function legalDestinations(board: Board, from: number): number[] {
  const piece = board[from];
  if (!piece) return [];
  if (hasAnyCapture(board, piece.owner)) return captureMoves(board, from);
  return normalMoves(board, from);
}

/** Indices of every piece of `player`'s that can legally move this turn. */
export function movablePieces(board: Board, player: Player): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i += 1) {
    const piece = board[i];
    if (piece && piece.owner === player && legalDestinations(board, i).length > 0) out.push(i);
  }
  return out;
}

/** True when a step from `from` to `to` leaps over (and captures) a piece. */
export function isCapture(board: Board, from: number, to: number): boolean {
  const piece = board[from];
  return Boolean(piece) && Math.abs(cellRC(from).row - cellRC(to).row) === 2;
}

/** True when this step crowns a man (it reaches the far row). */
export function wasPromoted(board: Board, from: number, to: number): boolean {
  const piece = board[from];
  if (!piece || piece.king) return false;
  const { row } = cellRC(to);
  return piece.owner === "human" ? row === 0 : row === SIZE - 1;
}

/** True when the piece at `to` can immediately capture again. */
export function canContinueCapture(board: Board, to: number): boolean {
  const piece = board[to];
  return Boolean(piece) && captureMoves(board, to).length > 0;
}

/** Move the piece from `from` to `to`, removing any jumped piece and crowning as needed. */
export function applyStep(board: Board, from: number, to: number): Board {
  const piece = board[from];
  if (!piece) return board;
  const next = board.slice();
  next[from] = null;
  const { row: r0, col: c0 } = cellRC(from);
  const { row: r1, col: c1 } = cellRC(to);
  const king = piece.king || (piece.owner === "human" ? r1 === 0 : r1 === SIZE - 1);
  next[to] = { id: piece.id, owner: piece.owner, king };
  if (Math.abs(r1 - r0) === 2) {
    next[idx((r0 + r1) / 2, (c0 + c1) / 2)] = null;
  }
  return next;
}

export function countPieces(board: Board): { human: number; cpu: number } {
  let human = 0;
  let cpu = 0;
  for (const cell of board) {
    if (!cell) continue;
    if (cell.owner === "human") human += 1;
    else cpu += 1;
  }
  return { human, cpu };
}

export function hasLegalMove(board: Board, player: Player): boolean {
  return movablePieces(board, player).length > 0;
}

/** 180° rotation with the owners swapped — the guest's view of the host's board. */
export function mirroredBoard(board: Board): Board {
  const out: Cell[] = new Array<Cell>(board.length);
  for (let i = 0; i < board.length; i += 1) {
    const cell = board[board.length - 1 - i];
    out[i] = cell ? { id: cell.id, owner: flip(cell.owner), king: cell.king } : null;
  }
  return out;
}

function encode(board: Board, turn: Player): string {
  let s = turn === "human" ? "h" : "c";
  for (const cell of board) {
    if (cell === null) s += ".";
    else s += cell.owner === "human" ? (cell.king ? "H" : "h") : cell.king ? "C" : "c";
  }
  return s;
}

/**
 * A position signature that is invariant under the board mirror, so both sides
 * of a networked match agree on it for threefold-repetition detection.
 */
export function boardSignature(board: Board, turn: Player): string {
  const a = encode(board, turn);
  const b = encode(mirroredBoard(board), flip(turn));
  return a < b ? a : b;
}

/** Every capture chain available from `from`, respecting the crown-then-stop rule. */
function allCaptureChains(board: Board, from: number): number[][] {
  const piece = board[from];
  if (!piece) return [];
  const landings = captureMoves(board, from);
  if (landings.length === 0) return [];
  const chains: number[][] = [];
  for (const to of landings) {
    const next = applyStep(board, from, to);
    const rest = wasPromoted(board, from, to) ? [] : allCaptureChains(next, to);
    if (rest.length === 0) chains.push([to]);
    else for (const r of rest) chains.push([to, ...r]);
  }
  return chains;
}

/** Every legal move for `player`: full capture chains when capturing is compulsory, single steps otherwise. */
function allLegalMoves(board: Board, player: Player): { from: number; path: number[] }[] {
  const mustCapture = hasAnyCapture(board, player);
  const moves: { from: number; path: number[] }[] = [];
  for (let from = 0; from < board.length; from += 1) {
    const piece = board[from];
    if (!piece || piece.owner !== player) continue;
    if (mustCapture) {
      for (const path of allCaptureChains(board, from)) moves.push({ from, path });
    } else {
      for (const to of normalMoves(board, from)) moves.push({ from, path: [to] });
    }
  }
  return moves;
}

/** Apply a whole path (a single move, or a multi-jump capture) to the board. */
function applyPath(board: Board, from: number, path: number[]): Board {
  let b = board;
  let cur = from;
  for (const to of path) {
    b = applyStep(b, cur, to);
    cur = to;
  }
  return b;
}

/** A rough value for a move: captures first, then crowning, then forward progress. */
function scorePath(board: Board, from: number, path: number[]): number {
  let score = 0;
  let cur = from;
  let b = board;
  const start = b[from]!;
  for (const to of path) {
    if (isCapture(b, cur, to)) score += 100;
    b = applyStep(b, cur, to);
    cur = to;
  }
  const end = b[path[path.length - 1]!]!;
  if (end.king && !start.king) score += 30;
  if (!end.king) {
    const r0 = cellRC(from).row;
    const r1 = cellRC(path[path.length - 1]!).row;
    score += end.owner === "human" ? r0 - r1 : r1 - r0;
  }
  return score;
}

/** Material and positional value of the board, positive when the computer is ahead. */
function evaluate(board: Board): number {
  let score = 0;
  for (let i = 0; i < board.length; i += 1) {
    const piece = board[i];
    if (!piece) continue;
    const { row, col } = cellRC(i);
    let value = piece.king ? 160 : 100;
    // Reward progress toward the promotion row.
    value += piece.owner === "cpu" ? row * 4 : (SIZE - 1 - row) * 4;
    // Reward pieces nearer the centre files.
    value += (3 - Math.abs(col - 3.5)) * 2;
    score += piece.owner === "cpu" ? value : -value;
  }
  return score;
}

const SEARCH_DEPTH = 4;
const SEARCH_WIN = 100_000;

/**
 * Negamax with alpha–beta pruning, returning the position value from `player`'s
 * perspective. A player with no legal move has lost.
 */
function negamax(board: Board, player: Player, depth: number, alpha: number, beta: number): number {
  const moves = allLegalMoves(board, player);
  if (moves.length === 0) return -SEARCH_WIN + depth;
  if (depth === 0) return player === "cpu" ? evaluate(board) : -evaluate(board);

  let best = -Infinity;
  for (const move of moves) {
    const next = applyPath(board, move.from, move.path);
    const value = -negamax(next, flip(player), depth - 1, -beta, -alpha);
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export type Difficulty = "easy" | "medium" | "hard";

const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];

/** The next difficulty when the toggle is clicked, wrapping hard → easy. */
export function nextDifficulty(difficulty: Difficulty): Difficulty {
  const index = DIFFICULTY_ORDER.indexOf(difficulty);
  return DIFFICULTY_ORDER[(index + 1) % DIFFICULTY_ORDER.length]!;
}

const DIFFICULTY_KEY = "parlor.checkers.difficulty";

/** Read the saved checkers difficulty, defaulting to "easy". */
export function readDifficulty(): Difficulty {
  if (typeof window === "undefined") return "easy";
  try {
    const stored = window.localStorage.getItem(DIFFICULTY_KEY);
    return stored === "medium" || stored === "hard" ? stored : "easy";
  } catch {
    return "easy";
  }
}

/** Persist the chosen checkers difficulty. */
export function writeDifficulty(difficulty: Difficulty) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DIFFICULTY_KEY, difficulty);
  } catch {
    // Ignore storage failures (private browsing, etc.).
  }
}

/**
 * Ada's move. When a capture is available it is compulsory. The difficulty
 * controls how hard she tries: easy plays at random, medium uses a greedy
 * heuristic, and hard searches a few plies ahead.
 */
export function chooseMove(
  board: Board,
  player: Player,
  difficulty: Difficulty = "medium",
): { from: number; path: number[] } | null {
  const moves = allLegalMoves(board, player);
  if (moves.length === 0) return null;

  if (difficulty === "easy") {
    return moves[Math.floor(Math.random() * moves.length)]!;
  }

  if (difficulty === "hard") {
    let best: { from: number; path: number[] } | null = null;
    let bestValue = -Infinity;
    for (const move of moves) {
      const next = applyPath(board, move.from, move.path);
      const value = -negamax(next, flip(player), SEARCH_DEPTH - 1, -Infinity, Infinity);
      if (value > bestValue) {
        bestValue = value;
        best = { from: move.from, path: move.path };
      }
    }
    return best;
  }

  // medium: greedy — most captures, then a crown, then forward progress.
  let best: { from: number; path: number[]; score: number } | null = null;
  for (const move of moves) {
    const score = scorePath(board, move.from, move.path);
    if (!best || score > best.score) best = { from: move.from, path: move.path, score };
  }
  return best ? { from: best.from, path: best.path } : null;
}

