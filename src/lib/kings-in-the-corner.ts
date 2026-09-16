import { freshDeck, RANK_LABEL, type Card } from "./cribbage";

/**
 * Kings in the Corner is played on a four-by-four board. The four corner
 * slots take kings, the two middle slots of the top and bottom rows take
 * queens, the two middle slots of the left and right columns take jacks,
 * and the remaining four centre slots are free for numbered cards, which
 * may also be set on any other empty slot until they are paired off.
 */
export const ROWS = 4;
export const COLS = 4;

export type Position = { row: number; col: number };
export type Slot = Card | null;
export type Board = Slot[][];

export type SlotKind = "king" | "queen" | "jack" | "any";

export type GameState = {
  board: Board;
  stock: Card[]; // face-down cards still to be drawn
  draw: Card | null; // the current face-up card to place
  moves: number;
  won: boolean;
  lost: boolean;
  lostReason: string | null;
};

/** Which kind of card a slot on the board accepts. */
export function slotKind(pos: Position): SlotKind {
  const { row, col } = pos;
  const onEdge = row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1;
  if (!onEdge) return "any";
  if ((row === 0 || row === ROWS - 1) && (col === 0 || col === COLS - 1)) return "king";
  if (row === 0 || row === ROWS - 1) return "queen";
  return "jack";
}

/** Jacks, queens and kings must land in the slots reserved for them. */
export function isFace(card: Card): boolean {
  return card.rank >= 11;
}

/** Whether `card` may legally be placed into the (empty) slot at `pos`. */
export function canPlace(board: Board, card: Card, pos: Position): boolean {
  if (board[pos.row]?.[pos.col] !== null) return false;
  if (card.rank === 13) return slotKind(pos) === "king";
  if (card.rank === 12) return slotKind(pos) === "queen";
  if (card.rank === 11) return slotKind(pos) === "jack";
  return true; // numbered cards fit any empty slot
}

/** Every empty slot the given card may currently be placed into. */
export function legalSlots(board: Board, card: Card): Position[] {
  const out: Position[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const pos = { row: r, col: c };
      if (canPlace(board, card, pos)) out.push(pos);
    }
  }
  return out;
}

export function freshGame(random: () => number = Math.random): GameState {
  const deck = freshDeck(random);
  const draw = deck.pop() ?? null;
  const board: Board = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => null as Slot),
  );
  return { board, stock: deck, draw, moves: 0, won: false, lost: false, lostReason: null };
}

/** Two numbered cards (ace through nine) whose ranks add up to ten. */
export function pairSumsToTen(a: Card, b: Card): boolean {
  return a.rank < 10 && b.rank < 10 && a.rank + b.rank === 10;
}

/** Whether every slot on the board currently holds a card. */
export function isBoardFull(board: Board): boolean {
  return board.every((row) => row.every((slot) => slot !== null));
}

/** Whether the board still holds a removable ten or a removable pair. */
export function hasAnyRemoval(board: Board): boolean {
  const numbered: Card[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const card = board[r]![c];
      if (card && card.rank <= 10) numbered.push(card);
    }
  }
  if (numbered.some((card) => card.rank === 10)) return true;
  for (let i = 0; i < numbered.length; i += 1) {
    for (let j = i + 1; j < numbered.length; j += 1) {
      if (pairSumsToTen(numbered[i]!, numbered[j]!)) return true;
    }
  }
  return false;
}

/**
 * Won once all twelve face cards sit in their reserved slots. Numbered
 * cards — whether still in the centre or the stock — do not matter: when
 * every jack, queen and king is placed, no numbered card can occupy a face
 * slot, so the hand is simply won.
 */
export function isWon(board: Board): boolean {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const card = board[r]![c];
      const kind = slotKind({ row: r, col: c });
      if (kind === "king") {
        if (!card || card.rank !== 13) return false;
      } else if (kind === "queen") {
        if (!card || card.rank !== 12) return false;
      } else if (kind === "jack") {
        if (!card || card.rank !== 11) return false;
      }
    }
  }
  return true;
}

/** Re-evaluate win/loss after a move, returning a new state when it changes. */
function recompute(state: GameState): GameState {
  if (state.won || state.lost) return state;
  const { board, draw } = state;

  if (isWon(board)) return { ...state, won: true };

  const canPlaceDraw = draw !== null && legalSlots(board, draw).length > 0;

  // Drawing a face card whose slots are all taken is an immediate loss, even
  // if removable pairs still sit on the board.
  if (draw !== null && draw.rank >= 11 && !canPlaceDraw) {
    return { ...state, lost: true, lostReason: stuckReason(state) };
  }

  if (!canPlaceDraw && !hasAnyRemoval(board)) {
    return { ...state, lost: true, lostReason: stuckReason(state) };
  }
  return state;
}

function stuckReason(state: GameState): string {
  const { draw } = state;
  if (draw && draw.rank >= 11) {
    return `The ${RANK_LABEL[draw.rank]} cannot be placed — every slot of its kind is taken.`;
  }
  return "The board is full and no two cards add up to ten.";
}

/**
 * Place the face-up card into `pos`, then draw the next card from the stock.
 * Filling the board pauses the deal: every ten and ten-pair must be cleared
 * before the next card is withdrawn.
 */
export function placeCard(state: GameState, pos: Position): GameState {
  if (state.won || state.lost) return state;
  const card = state.draw;
  if (!card) return state;
  if (!canPlace(state.board, card, pos)) return state;

  const board = state.board.map((row) => row.slice());
  board[pos.row]![pos.col] = card;
  const stock = state.stock.slice();
  const draw = isBoardFull(board) ? null : (stock.pop() ?? null);
  return recompute({ ...state, board, stock, draw, moves: state.moves + 1 });
}

/**
 * Remove a single ten (pass `null` for `b`) or a pair of cards at `a` and
 * `b` whose ranks add up to ten.
 */
export function removeCards(state: GameState, a: Position, b: Position | null): GameState {
  if (state.won || state.lost) return state;
  // Cards may only be removed when the board is full — that is, when the
  // current draw card has nowhere to go. This keeps removal out of normal play
  // (you must keep placing) while still allowing it when a full board, an
  // unplaceable face card, or an empty stock leaves removal as the only move.
  if (state.draw !== null && legalSlots(state.board, state.draw).length > 0) {
    return state;
  }
  const board = state.board.map((row) => row.slice());
  const cardA = board[a.row]?.[a.col];
  if (!cardA || cardA.rank > 10) return state;

  if (b === null) {
    if (cardA.rank !== 10) return state;
    board[a.row]![a.col] = null;
  } else {
    const cardB = board[b.row]?.[b.col];
    if (!cardB || !pairSumsToTen(cardA, cardB)) return state;
    board[a.row]![a.col] = null;
    board[b.row]![b.col] = null;
  }

  // Keep clearing until no ten or ten-pair remains, then withdraw the next
  // card. Only the clearing phase (draw held back as null) resumes drawing;
  // an unplaceable face card in hand is never discarded.
  const stock = state.stock.slice();
  const draw = state.draw === null && !hasAnyRemoval(board) ? (stock.pop() ?? null) : state.draw;
  return recompute({ ...state, board, stock, draw, moves: state.moves + 1 });
}
