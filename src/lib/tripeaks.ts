import { freshDeck, type Card } from "./cribbage";

export const ROWS = 4;
// Row 0 is the bottom (the widest, dealt face up); row 3 caps the three peaks.
// Rows 1–3 are dealt face down and are turned up as they are uncovered.
export const ROW_LENGTHS = [10, 9, 6, 3];
export const PEAK_CARDS = ROW_LENGTHS.reduce((sum, n) => sum + n, 0); // 28

export type Slot = { card: Card; faceUp: boolean } | null;

export type GameState = {
  peaks: Slot[][]; // peaks[row][col]; a null slot means the card was played to the waste
  stock: Card[]; // face-down draw pile; the last card is drawn next
  waste: Card[]; // face-up pile; the last card is on top
  moves: number;
  won: boolean;
  lost: boolean;
};

/**
 * Tri Peaks is dealt into three separate pyramids: ten cards face up on the
 * bottom row, then nine face down above them, six more face down above those
 * (with a one-card gap after the second and fourth to split the three
 * pyramids), and finally three face-down cards capping each peak. The
 * remaining twenty-four cards form the stock. The object is to clear every
 * peak onto the waste by playing cards one rank above or below the waste's
 * top card.
 */
export function freshGame(random: () => number = Math.random): GameState {
  const deck = freshDeck(random);
  const peaks: Slot[][] = [];
  for (let row = 0; row < ROWS; row += 1) {
    const rowSlots: Slot[] = [];
    for (let col = 0; col < ROW_LENGTHS[row]!; col += 1) {
      rowSlots.push({ card: deck.shift()!, faceUp: row === 0 });
    }
    peaks.push(rowSlots);
  }
  // Only the bottom row is dealt face up. Lower rows render in front, so the
  // bottom tier is never covered and is immediately playable; rows 1–3 are
  // dealt face down and turn face up as the card in front of them is played.
  return { peaks, stock: deck, waste: [], moves: 0, won: false, lost: false };
}

/** Two ranks are neighbours when they differ by one, wrapping Ace (1) to King (13). */
export function isAdjacentRank(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff === 1 || diff === 12;
}

/**
 * Horizontal position of a card in the tableau, measured in column steps
 * (each step is `--tripeaks-step-x`, sized so neighbouring cards do not
 * overlap). Every row is offset half a step to the right of the row below it.
 * Row 2 leaves a one-card gap after its second and fourth cards so it forms
 * the bases of three separate pyramids, and row 3 places one card on top of
 * each of those three pyramids.
 */
export function slotX(row: number, col: number): number {
  switch (row) {
    case 0: return col; // 0 … 9
    case 1: return col + 0.5; // 0.5 … 8.5
    case 2: return col + 1 + Math.floor(col / 2); // 1, 2, 4, 5, 7, 8
    case 3: return col * 3 + 1.5; // 1.5, 4.5, 7.5
    default: return col;
  }
}

/**
 * A card is covered when a card directly below it still sits in front of it.
 * Lower rows render at a higher z-index (`ROWS - row`), so the bottom tier
 * hides the cards behind it and is itself always exposed.
 */
function isCovered(peaks: Slot[][], row: number, col: number): boolean {
  if (row <= 0) return false;
  const x = slotX(row, col);
  const below = peaks[row - 1]!;
  for (let c = 0; c < below.length; c += 1) {
    if (!below[c]) continue;
    if (Math.abs(slotX(row - 1, c) - x) < 0.75) return true;
  }
  return false;
}

/** A card is open when it is face up and no card still covers it. */
export function isOpen(peaks: Slot[][], row: number, col: number): boolean {
  const slot = peaks[row]?.[col];
  if (!slot || !slot.faceUp) return false;
  return !isCovered(peaks, row, col);
}

export function canMoveToWaste(card: Card, waste: Card[]): boolean {
  if (waste.length === 0) return true;
  return isAdjacentRank(card.rank, waste[waste.length - 1]!.rank);
}

export function hasAvailableMove(state: GameState): boolean {
  for (let row = 0; row < ROWS; row += 1) {
    const rowSlots = state.peaks[row]!;
    for (let col = 0; col < rowSlots.length; col += 1) {
      const slot = rowSlots[col];
      if (slot && isOpen(state.peaks, row, col) && canMoveToWaste(slot.card, state.waste)) return true;
    }
  }
  return false;
}

/** Turn any newly-exposed face-down card face up. */
function flipExposed(peaks: Slot[][]): Slot[][] {
  return peaks.map((rowSlots, row) =>
    rowSlots.map((slot, col) => {
      if (slot && !slot.faceUp && !isCovered(peaks, row, col)) return { ...slot, faceUp: true };
      return slot;
    }),
  );
}

function evaluate(state: GameState): GameState {
  const won = state.peaks.every((rowSlots) => rowSlots.every((s) => s === null));
  if (won) return { ...state, won: true, lost: false };
  const lost = state.stock.length === 0 && !hasAvailableMove(state);
  return { ...state, won: false, lost };
}

/** Play an open peak card onto the waste. */
export function moveToWaste(state: GameState, row: number, col: number): GameState {
  if (state.won || state.lost) return state;
  const slot = state.peaks[row]?.[col];
  if (!slot || !isOpen(state.peaks, row, col) || !canMoveToWaste(slot.card, state.waste)) return state;
  const peaks = state.peaks.map((rowSlots, r) =>
    r === row ? rowSlots.map((s, c) => (c === col ? null : s)) : rowSlots,
  );
  return evaluate({
    ...state,
    peaks: flipExposed(peaks),
    waste: [...state.waste, slot.card],
    moves: state.moves + 1,
  });
}

/** Draw the top card of the stock onto the waste. */
export function drawFromStock(state: GameState): GameState {
  if (state.won || state.lost || state.stock.length === 0) return state;
  const card = state.stock[state.stock.length - 1]!;
  return evaluate({
    ...state,
    stock: state.stock.slice(0, -1),
    waste: [...state.waste, card],
    moves: state.moves + 1,
  });
}

/** How many peak cards are still on the table. */
export function cardsRemaining(state: GameState): number {
  let count = 0;
  for (const rowSlots of state.peaks) for (const slot of rowSlots) if (slot) count += 1;
  return count;
}
