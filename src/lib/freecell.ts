import { freshDeck, type Card, type Suit } from "./cribbage";

/**
 * The four foundations are each reserved for a fixed suit, shown left to right
 * as spades, hearts, diamonds, clubs. A card only ever lands on its own suit's
 * column, so it snaps to the matching predefined box.
 */
export const FOUNDATION_SUITS: Suit[] = ["S", "H", "D", "C"];

export type GameState = {
  cells: (Card | null)[]; // four free cells, each empty or holding a single card
  foundations: Card[][]; // four piles, each empty or a single-suit ascending stack
  tableau: Card[][]; // eight piles, index 0 = bottom, last index = top
  moves: number;
  won: boolean;
};

export const isRed = (suit: Suit) => suit === "H" || suit === "D";

/** Deal a fresh FreeCell layout: piles 1-4 get seven cards, piles 5-8 get six. */
export function freshGame(random: () => number = Math.random): GameState {
  const deck = freshDeck(random);
  const tableau: Card[][] = [];
  for (let i = 0; i < 8; i++) tableau.push(deck.splice(0, i < 4 ? 7 : 6));
  return {
    cells: [null, null, null, null],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    won: false,
  };
}

/** A valid foundation move: an Ace on an empty pile, or the next rank in suit. */
export function canPlaceOnFoundation(card: Card, pile: Card[]): boolean {
  if (pile.length === 0) return card.rank === 1;
  const top = pile[pile.length - 1]!;
  return top.suit === card.suit && card.rank === top.rank + 1;
}

/** `cards` must be a run: descending rank, alternating colour. */
export function isRun(cards: Card[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    const prev = cards[i - 1]!;
    const cur = cards[i]!;
    if (cur.rank !== prev.rank - 1) return false;
    if (isRed(cur.suit) === isRed(prev.suit)) return false;
  }
  return true;
}

/**
 * A tableau move: a valid run onto an empty pile (any single card) or a
 * matching top card (one higher, opposite colour).
 */
export function canPlaceOnTableau(cards: Card[], pile: Card[]): boolean {
  if (!isRun(cards)) return false;
  if (pile.length === 0) return cards.length === 1;
  const top = pile[pile.length - 1]!;
  const bottom = cards[0]!;
  return top.rank === bottom.rank + 1 && isRed(top.suit) !== isRed(bottom.suit);
}

/** The foundation index reserved for `card`'s suit, if it can be placed there. */
export function foundationTarget(card: Card, foundations: Card[][]): number | null {
  const index = FOUNDATION_SUITS.indexOf(card.suit);
  if (index === -1 || !canPlaceOnFoundation(card, foundations[index]!)) return null;
  return index;
}

/** A legal single-card destination for a double-click auto-move. */
export type CardMove =
  | { kind: "foundation"; foundationIndex: number }
  | { kind: "cell"; cellIndex: number }
  | { kind: "tableau"; toIndex: number };

/** All legal single-card destinations for the top card of a tableau pile. */
export function tableauCardMoves(state: GameState, fromIndex: number): CardMove[] {
  const pile = state.tableau[fromIndex]!;
  if (pile.length === 0) return [];
  const card = pile[pile.length - 1]!;
  const moves: CardMove[] = [];
  const foundationIndex = foundationTarget(card, state.foundations);
  if (foundationIndex !== null) moves.push({ kind: "foundation", foundationIndex });
  state.cells.forEach((c, i) => {
    if (c === null) moves.push({ kind: "cell", cellIndex: i });
  });
  state.tableau.forEach((p, i) => {
    if (i !== fromIndex && canPlaceOnTableau([card], p)) moves.push({ kind: "tableau", toIndex: i });
  });
  return moves;
}

/** All legal single-card destinations for the card sitting in a free cell. */
export function cellCardMoves(state: GameState, cellIndex: number): CardMove[] {
  const card = state.cells[cellIndex]!;
  if (card === null) return [];
  const moves: CardMove[] = [];
  const foundationIndex = foundationTarget(card, state.foundations);
  if (foundationIndex !== null) moves.push({ kind: "foundation", foundationIndex });
  state.tableau.forEach((p, i) => {
    if (canPlaceOnTableau([card], p)) moves.push({ kind: "tableau", toIndex: i });
  });
  return moves;
}

/**
 * How many cards can move together as a run: empty free cells plus empty
 * tableau piles (excluding the source pile) plus one.
 */
export function maxMoveable(state: GameState, sourceIndex: number): number {
  const emptyCells = state.cells.filter((c) => c === null).length;
  const emptyTableaus = state.tableau.filter((p, i) => i !== sourceIndex && p.length === 0).length;
  return 1 + emptyCells + emptyTableaus;
}

/** A move that changed nothing (illegal) returns the same state reference. */
function moved(state: GameState, patch: Partial<GameState>): GameState {
  const next = { ...state, ...patch, moves: state.moves + 1 };
  next.won = next.foundations.every((p) => p.length === 13);
  return next;
}

/** Move the top card of a tableau pile onto an empty free cell. */
export function moveTableauToCell(state: GameState, fromIndex: number, cellIndex: number): GameState {
  if (state.won) return state;
  const from = state.tableau[fromIndex]!;
  if (from.length === 0 || state.cells[cellIndex] !== null) return state;
  const card = from[from.length - 1]!;
  return moved(state, {
    cells: state.cells.map((c, i) => (i === cellIndex ? card : c)),
    tableau: state.tableau.map((p, i) => (i === fromIndex ? p.slice(0, -1) : p)),
  });
}

/** Move a card from one free cell to another empty free cell. */
export function moveCellToCell(state: GameState, fromIndex: number, cellIndex: number): GameState {
  if (state.won) return state;
  const card = state.cells[fromIndex]!;
  if (card === null || state.cells[cellIndex] !== null) return state;
  return moved(state, {
    cells: state.cells.map((c, i) => (i === fromIndex ? null : i === cellIndex ? card : c)),
  });
}

/** Move a free cell card onto a foundation. */
export function moveCellToFoundation(state: GameState, cellIndex: number, foundationIndex: number): GameState {
  if (state.won) return state;
  const card = state.cells[cellIndex]!;
  if (card === null) return state;
  const pile = state.foundations[foundationIndex]!;
  if (!canPlaceOnFoundation(card, pile)) return state;
  return moved(state, {
    cells: state.cells.map((c, i) => (i === cellIndex ? null : c)),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? [...p, card] : p)),
  });
}

/** Move a free cell card onto a tableau pile. */
export function moveCellToTableau(state: GameState, cellIndex: number, toIndex: number): GameState {
  if (state.won) return state;
  const card = state.cells[cellIndex]!;
  if (card === null) return state;
  const to = state.tableau[toIndex]!;
  if (!canPlaceOnTableau([card], to)) return state;
  return moved(state, {
    cells: state.cells.map((c, i) => (i === cellIndex ? null : c)),
    tableau: state.tableau.map((p, i) => (i === toIndex ? [...p, card] : p)),
  });
}

/** Move a foundation card onto an empty free cell. */
export function moveFoundationToCell(state: GameState, foundationIndex: number, cellIndex: number): GameState {
  if (state.won) return state;
  const pile = state.foundations[foundationIndex]!;
  if (pile.length === 0 || state.cells[cellIndex] !== null) return state;
  const card = pile[pile.length - 1]!;
  return moved(state, {
    cells: state.cells.map((c, i) => (i === cellIndex ? card : c)),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? p.slice(0, -1) : p)),
  });
}

/** Move a foundation card back onto a tableau pile. */
export function moveFoundationToTableau(state: GameState, foundationIndex: number, toIndex: number): GameState {
  if (state.won) return state;
  const pile = state.foundations[foundationIndex]!;
  if (pile.length === 0) return state;
  const card = pile[pile.length - 1]!;
  const to = state.tableau[toIndex]!;
  if (!canPlaceOnTableau([card], to)) return state;
  return moved(state, {
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? p.slice(0, -1) : p)),
    tableau: state.tableau.map((p, i) => (i === toIndex ? [...p, card] : p)),
  });
}


/** Move a run of `count` cards from the top of one tableau pile to another. */
export function moveTableauToTableau(
  state: GameState,
  fromIndex: number,
  count: number,
  toIndex: number,
): GameState {
  if (state.won || fromIndex === toIndex) return state;
  const from = state.tableau[fromIndex]!;
  const to = state.tableau[toIndex]!;
  const moving = from.slice(from.length - count);
  if (moving.length !== count || !isRun(moving)) return state;
  if (moving.length > maxMoveable(state, fromIndex)) return state;
  if (!canPlaceOnTableau(moving, to)) return state;
  return moved(state, {
    tableau: state.tableau.map((p, i) => {
      if (i === fromIndex) return p.slice(0, p.length - count);
      if (i === toIndex) return [...p, ...moving];
      return p;
    }),
  });
}

/** Move the top tableau card onto a foundation. */
export function moveTableauToFoundation(
  state: GameState,
  fromIndex: number,
  foundationIndex: number,
): GameState {
  if (state.won) return state;
  const from = state.tableau[fromIndex]!;
  if (from.length === 0) return state;
  const card = from[from.length - 1]!;
  const pile = state.foundations[foundationIndex]!;
  if (!canPlaceOnFoundation(card, pile)) return state;
  return moved(state, {
    tableau: state.tableau.map((p, i) => (i === fromIndex ? p.slice(0, -1) : p)),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? [...p, card] : p)),
  });
}

/** True once the free cells are empty and every tableau pile is a valid run. */
export function canAutoComplete(state: GameState): boolean {
  if (state.cells.some((c) => c !== null)) return false;
  return state.tableau.every((p) => p.length === 0 || isRun(p));
}

/** Move every remaining tableau card home (guaranteed win when canAutoComplete). */
export function autoComplete(state: GameState): GameState {
  const foundations = state.foundations.map((p) => [...p]);
  const bySuit: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const p of state.tableau) for (const c of p) bySuit[c.suit].push(c);
  for (const suit of FOUNDATION_SUITS) {
    const cards = bySuit[suit].sort((a, b) => a.rank - b.rank);
    if (cards.length === 0) continue;
    const index = FOUNDATION_SUITS.indexOf(suit);
    if (index === -1) continue;
    foundations[index] = [...foundations[index]!, ...cards];
  }
  return moved(state, { foundations, tableau: state.tableau.map(() => []) });
}

/** Intermediate states (one card home per frame) for animating the auto-complete. */
export function autoCompleteFrames(state: GameState): GameState[] {
  const frames: GameState[] = [];
  const foundations = state.foundations.map((p) => [...p]);
  const tableau = state.tableau.map((p) => [...p]);
  const bySuit: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const p of tableau) for (const c of p) bySuit[c.suit].push(c);
  const order: Card[] = [];
  for (const suit of FOUNDATION_SUITS) order.push(...bySuit[suit].sort((a, b) => a.rank - b.rank));
  for (const card of order) {
    const pileIndex = tableau.findIndex((p) => p.length > 0 && p[p.length - 1] === card);
    if (pileIndex === -1) continue;
    tableau[pileIndex]!.pop();
    const fi = FOUNDATION_SUITS.indexOf(card.suit);
    if (fi === -1) continue;
    foundations[fi]!.push(card);
    frames.push({
      cells: state.cells,
      foundations: foundations.map((p) => [...p]),
      tableau: tableau.map((p) => [...p]),
      moves: state.moves,
      won: false,
    });
  }
  return frames;
}

