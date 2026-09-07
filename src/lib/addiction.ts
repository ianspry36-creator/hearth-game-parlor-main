import { freshDeck, shuffle, type Card } from "./cribbage";

/** Four horizontal rows of thirteen slots each. */
export const ROWS = 4;
export const COLS = 13;
/** A player may shuffle the table at most three times per game. */
export const MAX_SHUFFLES = 3;

export type Slot = Card | null;
export type Board = Slot[][];
export type Position = { row: number; col: number };

export type GameState = {
  board: Board;
  moves: number;
  shuffles: number; // how many of the three shuffles have been used
  won: boolean;
};

/**
 * Deal a shuffled deck into the fifty-two slots, then remove the four aces so
 * that four random slots stand empty with forty-eight cards in play.
 */
export function freshGame(random: () => number = Math.random): GameState {
  const deck = freshDeck(random);
  const slots: Slot[] = deck.map((card) => (card.rank === 1 ? null : card));
  const board: Board = [];
  for (let r = 0; r < ROWS; r += 1) {
    board.push(slots.slice(r * COLS, r * COLS + COLS));
  }
  return { board, moves: 0, shuffles: 0, won: false };
}

/**
 * A card is correctly placed when a two sits in the leftmost slot of its row,
 * or when the card immediately to its left is the same suit one rank lower and
 * is itself correctly placed. This recursion means the whole leftward prefix
 * must form an unbroken, same-suit ascending run.
 */
export function isCorrect(board: Board, row: number, col: number): boolean {
  const card = board[row]?.[col];
  if (!card) return false;
  if (col === 0) return card.rank === 2;
  const left = board[row]?.[col - 1];
  if (!left) return false;
  return left.suit === card.suit && left.rank === card.rank - 1 && isCorrect(board, row, col - 1);
}

/** Whether `card` may legally move into the empty slot at `row`/`col`. */
export function canPlace(board: Board, card: Card, row: number, col: number): boolean {
  if (board[row]?.[col] !== null) return false;
  if (col === 0) return card.rank === 2;
  const left = board[row]?.[col - 1];
  if (!left || left.rank === 13) return false;
  return left.suit === card.suit && left.rank === card.rank - 1;
}

/** Win when every row is a single ordered suit (two through king) with an empty rightmost slot. */
export function isWon(board: Board): boolean {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const card = board[r]![c];
      if (c === COLS - 1) {
        if (card !== null) return false;
      } else if (!isCorrect(board, r, c)) {
        return false;
      }
    }
  }
  return true;
}

/** Every empty slot a card at `from` may legally move into. */
export function legalTargets(board: Board, from: Position): Position[] {
  const card = board[from.row]?.[from.col];
  if (!card) return [];
  const out: Position[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (canPlace(board, card, r, c)) out.push({ row: r, col: c });
    }
  }
  return out;
}

/** Move the card at `from` to the empty slot at `to`, when the move is legal. */
export function moveCard(state: GameState, from: Position, to: Position): GameState {
  if (state.won) return state;
  const card = state.board[from.row]?.[from.col];
  if (!card) return state;
  if (!canPlace(state.board, card, to.row, to.col)) return state;
  const board = state.board.map((row) => row.slice());
  board[from.row]![from.col] = null;
  board[to.row]![to.col] = card;
  return { ...state, board, moves: state.moves + 1, won: isWon(board) };
}

/**
 * Shuffle every incorrectly placed card and redeal it into a random free slot.
 * Correctly placed cards never move, so a shuffle can only ever keep progress
 * and may open up fresh moves.
 */
export function shuffleBoard(state: GameState, random: () => number = Math.random): GameState {
  if (state.shuffles >= MAX_SHUFFLES || state.won) return state;
  const board = state.board.map((row) => row.slice());

  // First identify the correct positions against the untouched board.
  const correct = new Set<string>();
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (isCorrect(board, r, c)) correct.add(`${r}:${c}`);
    }
  }

  // Gather every incorrect card and every slot it can be redealt into.
  const pool: Card[] = [];
  const slots: Position[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const card = board[r]![c];
      if (!card) {
        slots.push({ row: r, col: c });
      } else if (!correct.has(`${r}:${c}`)) {
        pool.push(card);
        board[r]![c] = null;
        slots.push({ row: r, col: c });
      }
    }
  }

  const shuffledCards = shuffle(pool, random);
  const shuffledSlots = shuffle(slots, random);
  for (let i = 0; i < shuffledCards.length; i += 1) {
    const slot = shuffledSlots[i]!;
    board[slot.row]![slot.col] = shuffledCards[i]!;
  }
  return { ...state, board, shuffles: state.shuffles + 1 };
}

export function shufflesRemaining(state: GameState): number {
  return Math.max(0, MAX_SHUFFLES - state.shuffles);
}
