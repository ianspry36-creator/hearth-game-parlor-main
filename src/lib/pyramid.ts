import { freshDeck, type Card } from "./cribbage";

export const ROWS = 7;

export type GameState = {
  // The pyramid is dealt face up: row 0 is the single apex card, row 6 the
  // seven-card base. A null slot means the card has been removed.
  pyramid: (Card | null)[][];
  // Face-down draw pile; the last card is drawn next.
  stock: Card[];
  // Face-up pile; the last card is on top.
  waste: Card[];
  // Removed cards (kept as a count and a visual pile).
  foundation: Card[];
  moves: number;
  won: boolean;
  lost: boolean;
};

/** Deal a fresh game: 28 cards to the pyramid, the remaining 24 to the stock. */
export function freshGame(random: () => number = Math.random): GameState {
  const deck = freshDeck(random);
  const pyramid: (Card | null)[][] = [];
  for (let r = 0; r < ROWS; r += 1) {
    const row: (Card | null)[] = [];
    for (let c = 0; c <= r; c += 1) row.push(deck.shift()!);
    pyramid.push(row);
  }
  return { pyramid, stock: deck, waste: [], foundation: [], moves: 0, won: false, lost: false };
}

// The two cards in the row below that cover (r, c). Each row is layered in
// front of the row above it, so a card is hidden by the cards below it.
function covering(r: number, c: number): [number, number][] {
  if (r >= ROWS - 1) return [];
  return [
    [r + 1, c],
    [r + 1, c + 1],
  ];
}

/** A card is covered when any card in the row below still sits in front of it. */
export function isCovered(pyramid: (Card | null)[][], r: number, c: number): boolean {
  return covering(r, c).some(([rr, cc]) => pyramid[rr]?.[cc] != null);
}

/** A card is open (available) when it is present and nothing covers it. */
export function isOpen(pyramid: (Card | null)[][], r: number, c: number): boolean {
  return pyramid[r]?.[c] != null && !isCovered(pyramid, r, c);
}

export const sumsToThirteen = (a: Card, b: Card): boolean => a.rank + b.rank === 13;

function removeCard(
  pyramid: (Card | null)[][],
  r: number,
  c: number,
): (Card | null)[][] {
  return pyramid.map((row, rr) =>
    rr === r ? row.map((card, cc) => (cc === c ? null : card)) : row,
  );
}

/**
 * When a card A covers a card B (A sits in the row directly below B) and B's
 * other covering card has already been removed, A may be moved onto B if their
 * ranks sum to 13. Returns B's coordinates, or null when no such match exists.
 */
export function coveringTarget(
  state: GameState,
  r: number,
  c: number,
): { r: number; c: number } | null {
  const a = state.pyramid[r]?.[c];
  if (!a || !isOpen(state.pyramid, r, c) || r <= 0) return null;
  const candidates: [number, number][] = [];
  if (c - 1 >= 0) candidates.push([r - 1, c - 1]);
  if (c <= r - 1) candidates.push([r - 1, c]);
  for (const [br, bc] of candidates) {
    const b = state.pyramid[br]![bc];
    if (!b) continue;
    // B's covering cards are (r, bc) and (r, bc + 1); A is one of them, so the
    // "other" covering card must already be gone.
    const other = bc === c - 1 ? state.pyramid[r]![c - 1] : state.pyramid[r]![c + 1];
    if (other != null) continue;
    if (a.rank + b.rank === 13) return { r: br, c: bc };
  }
  return null;
}

/** Every open pyramid card, in row-major order. */
function openCards(state: GameState): { r: number; c: number; card: Card }[] {
  const out: { r: number; c: number; card: Card }[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c <= r; c += 1) {
      const card = state.pyramid[r]![c];
      if (card && isOpen(state.pyramid, r, c)) out.push({ r, c, card });
    }
  }
  return out;
}

export function hasAvailableMove(state: GameState): boolean {
  // Unlimited redeals: while the waste still holds cards it can always be put
  // back onto the stock, so an empty stock is not itself a dead end.
  if (state.stock.length > 0 || state.waste.length > 0) return true;
  const open = openCards(state);
  const wasteTop = state.waste[state.waste.length - 1];
  if (open.some((o) => o.card.rank === 13)) return true;
  if (wasteTop && wasteTop.rank === 13) return true;
  if (wasteTop) {
    for (const o of open) if (sumsToThirteen(wasteTop, o.card)) return true;
  }
  for (let i = 0; i < open.length; i += 1) {
    for (let j = i + 1; j < open.length; j += 1) {
      if (sumsToThirteen(open[i]!.card, open[j]!.card)) return true;
    }
  }
  for (let r = 1; r < ROWS; r += 1) {
    for (let c = 0; c <= r; c += 1) {
      if (coveringTarget(state, r, c)) return true;
    }
  }
  return false;
}

/** How many pyramid cards are still on the table. */
export function cardsRemaining(state: GameState): number {
  let count = 0;
  for (const row of state.pyramid) for (const card of row) if (card) count += 1;
  return count;
}

function evaluate(state: GameState): GameState {
  const won = state.pyramid.every((row) => row.every((card) => card === null));
  if (won) return { ...state, won: true, lost: false };
  const lost = !hasAvailableMove(state);
  return { ...state, won: false, lost };
}

function settle(state: GameState, pyramid: (Card | null)[][], gained: Card[]): GameState {
  return evaluate({
    ...state,
    pyramid,
    foundation: [...state.foundation, ...gained],
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

/** Put the waste back onto the stock so it can be drawn through again. */
export function resetStock(state: GameState): GameState {
  if (state.won || state.lost || state.stock.length !== 0 || state.waste.length === 0) {
    return state;
  }
  return evaluate({
    ...state,
    stock: [...state.waste].reverse(),
    waste: [],
    moves: state.moves + 1,
  });
}

/** Move an open King to the foundation on its own. */
export function moveKingToFoundation(state: GameState, r: number, c: number): GameState {
  if (state.won || state.lost) return state;
  const card = state.pyramid[r]?.[c];
  if (!card || card.rank !== 13 || !isOpen(state.pyramid, r, c)) return state;
  return settle(state, removeCard(state.pyramid, r, c), [card]);
}

/** Move a King sitting on top of the waste to the foundation. */
export function moveWasteKingToFoundation(state: GameState): GameState {
  if (state.won || state.lost) return state;
  const card = state.waste[state.waste.length - 1];
  if (!card || card.rank !== 13) return state;
  return evaluate({
    ...state,
    waste: state.waste.slice(0, -1),
    foundation: [...state.foundation, card],
    moves: state.moves + 1,
  });
}

/** Match the top waste card with an open pyramid card whose ranks sum to 13. */
export function matchWasteToPyramid(state: GameState, r: number, c: number): GameState {
  if (state.won || state.lost) return state;
  const wasteTop = state.waste[state.waste.length - 1];
  const card = state.pyramid[r]?.[c];
  if (!wasteTop || !card) return state;
  if (!isOpen(state.pyramid, r, c)) return state;
  if (!sumsToThirteen(wasteTop, card)) return state;
  return evaluate({
    ...state,
    pyramid: removeCard(state.pyramid, r, c),
    waste: state.waste.slice(0, -1),
    foundation: [...state.foundation, wasteTop, card],
    moves: state.moves + 1,
  });
}

/** Match two open pyramid cards whose ranks sum to 13. */
export function matchPyramidCards(
  state: GameState,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): GameState {
  if (state.won || state.lost) return state;
  if (r1 === r2 && c1 === c2) return state;
  const a = state.pyramid[r1]?.[c1];
  const b = state.pyramid[r2]?.[c2];
  if (!a || !b) return state;
  if (!isOpen(state.pyramid, r1, c1) || !isOpen(state.pyramid, r2, c2)) return state;
  if (!sumsToThirteen(a, b)) return state;
  const pyramid = removeCard(removeCard(state.pyramid, r1, c1), r2, c2);
  return settle(state, pyramid, [a, b]);
}

/** Move an open card onto the card directly above it that it covers. */
export function matchCovering(state: GameState, r: number, c: number): GameState {
  if (state.won || state.lost) return state;
  const target = coveringTarget(state, r, c);
  if (!target) return state;
  const a = state.pyramid[r]![c]!;
  const b = state.pyramid[target.r]![target.c]!;
  const pyramid = removeCard(removeCard(state.pyramid, r, c), target.r, target.c);
  return settle(state, pyramid, [a, b]);
}
