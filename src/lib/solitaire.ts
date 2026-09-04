import { freshDeck, type Card, type Suit } from "./cribbage";

export type DrawMode = 1 | 3;

/** A tableau pile: face-down cards at the bottom, face-up cards on top. */
export type TableauPile = {
  faceDown: Card[];
  faceUp: Card[];
};

export type GameState = {
  stock: Card[];
  waste: Card[];
  foundations: Card[][]; // four piles, each empty or a single-suit ascending stack
  tableau: TableauPile[]; // seven piles
  moves: number;
  won: boolean;
};

export const isRed = (suit: Card["suit"]) => suit === "H" || suit === "D";

/** Deal a fresh Klondike layout from a shuffled deck. */
export function freshGame(random: () => number = Math.random): GameState {
  const deck = freshDeck(random);
  const tableau: TableauPile[] = [];
  for (let i = 0; i < 7; i++) {
    const count = i + 1;
    const pile: TableauPile = { faceDown: [], faceUp: [] };
    for (let j = 0; j < count; j++) {
      const card = deck.shift()!;
      if (j === count - 1) pile.faceUp.push(card);
      else pile.faceDown.push(card);
    }
    tableau.push(pile);
  }
  return {
    stock: deck,
    waste: [],
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

/** `cards` must be a face-up run: descending rank, alternating colour. */
export function isRun(cards: Card[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    const prev = cards[i - 1]!;
    const cur = cards[i]!;
    if (cur.rank !== prev.rank - 1) return false;
    if (isRed(cur.suit) === isRed(prev.suit)) return false;
  }
  return true;
}

/** A tableau move: a valid run onto an empty pile (King only) or a matching top. */
export function canPlaceOnTableau(cards: Card[], pile: TableauPile): boolean {
  if (!isRun(cards)) return false;
  const bottom = cards[0]!;
  if (pile.faceUp.length === 0) {
    return pile.faceDown.length === 0 && bottom.rank === 13;
  }
  const top = pile.faceUp[pile.faceUp.length - 1]!;
  return top.rank === bottom.rank + 1 && isRed(top.suit) !== isRed(bottom.suit);
}

/**
 * The four foundations are each reserved for a fixed suit, shown left to right
 * as spades, hearts, diamonds, clubs. A card only ever lands on its own suit's
 * column, so it snaps to the matching predefined box.
 */
export const FOUNDATION_SUITS: Suit[] = ["S", "H", "D", "C"];

/** The foundation index reserved for `card`'s suit, if it can be placed there. */
export function foundationTarget(card: Card, foundations: Card[][]): number | null {
  const index = FOUNDATION_SUITS.indexOf(card.suit);
  if (index === -1 || !canPlaceOnFoundation(card, foundations[index]!)) return null;
  return index;
}

/** A move that changed nothing (illegal) returns the same state reference. */
function moved(state: GameState, patch: Partial<GameState>): GameState {
  const next = { ...state, ...patch, moves: state.moves + 1 };
  next.won = next.foundations.every((p) => p.length === 13);
  return next;
}

/** Flip the top card(s) of the stock onto the waste, recycling the waste if empty. */
export function drawStock(state: GameState, drawMode: DrawMode): GameState {
  if (state.won) return state;
  let stock = [...state.stock];
  let waste = [...state.waste];
  if (stock.length === 0) {
    if (waste.length === 0) return state;
    stock = [...waste].reverse();
    waste = [];
  }
  const n = Math.min(drawMode, stock.length);
  const drawn = stock.splice(stock.length - n, n);
  waste = waste.concat(drawn);
  return moved(state, { stock, waste });
}

export function moveWasteToFoundation(state: GameState, foundationIndex: number): GameState {
  if (state.won || state.waste.length === 0) return state;
  const card = state.waste[state.waste.length - 1]!;
  const pile = state.foundations[foundationIndex]!;
  if (!canPlaceOnFoundation(card, pile)) return state;
  return moved(state, {
    waste: state.waste.slice(0, -1),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? [...p, card] : p)),
  });
}

export function moveWasteToTableau(state: GameState, targetIndex: number): GameState {
  if (state.won || state.waste.length === 0) return state;
  const card = state.waste[state.waste.length - 1]!;
  const target = state.tableau[targetIndex]!;
  if (!canPlaceOnTableau([card], target)) return state;
  return moved(state, {
    waste: state.waste.slice(0, -1),
    tableau: state.tableau.map((p, i) =>
      i === targetIndex ? { ...p, faceUp: [...p.faceUp, card] } : p,
    ),
  });
}

export function moveTableauToTableau(
  state: GameState,
  fromIndex: number,
  count: number,
  toIndex: number,
): GameState {
  if (state.won || fromIndex === toIndex) return state;
  const from = state.tableau[fromIndex]!;
  const to = state.tableau[toIndex]!;
  const moving = from.faceUp.slice(from.faceUp.length - count);
  if (moving.length !== count || !isRun(moving) || !canPlaceOnTableau(moving, to)) return state;
  return moved(state, {
    tableau: state.tableau.map((p, i) => {
      if (i === fromIndex) return { ...p, faceUp: p.faceUp.slice(0, p.faceUp.length - count) };
      if (i === toIndex) return { ...p, faceUp: [...p.faceUp, ...moving] };
      return p;
    }),
  });
}

export function moveTableauToFoundation(
  state: GameState,
  fromIndex: number,
  foundationIndex: number,
): GameState {
  if (state.won) return state;
  const from = state.tableau[fromIndex]!;
  if (from.faceUp.length === 0) return state;
  const card = from.faceUp[from.faceUp.length - 1]!;
  const pile = state.foundations[foundationIndex]!;
  if (!canPlaceOnFoundation(card, pile)) return state;
  return moved(state, {
    tableau: state.tableau.map((p, i) =>
      i === fromIndex ? { ...p, faceUp: p.faceUp.slice(0, -1) } : p,
    ),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? [...p, card] : p)),
  });
}

export function moveFoundationToTableau(
  state: GameState,
  foundationIndex: number,
  toIndex: number,
): GameState {
  if (state.won) return state;
  const pile = state.foundations[foundationIndex]!;
  if (pile.length === 0) return state;
  const card = pile[pile.length - 1]!;
  const to = state.tableau[toIndex]!;
  if (!canPlaceOnTableau([card], to)) return state;
  return moved(state, {
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? p.slice(0, -1) : p)),
    tableau: state.tableau.map((p, i) => (i === toIndex ? { ...p, faceUp: [...p.faceUp, card] } : p)),
  });
}

/** Turn the top face-down card of a tableau pile face up. */
export function flipTableau(state: GameState, index: number): GameState {
  if (state.won) return state;
  const pile = state.tableau[index]!;
  if (pile.faceUp.length > 0 || pile.faceDown.length === 0) return state;
  const card = pile.faceDown[pile.faceDown.length - 1]!;
  return moved(state, {
    tableau: state.tableau.map((p, i) =>
      i === index ? { faceDown: p.faceDown.slice(0, -1), faceUp: [card] } : p,
    ),
  });
}

/** True once every tableau card is face up and the stock and waste are empty. */
export function canAutoComplete(state: GameState): boolean {
  if (state.stock.length > 0 || state.waste.length > 0) return false;
  return state.tableau.every((p) => p.faceDown.length === 0);
}

/** Move every remaining tableau card home (guaranteed win when canAutoComplete). */
export function autoComplete(state: GameState): GameState {
  const foundations = state.foundations.map((p) => [...p]);
  const tableau = state.tableau.map((p) => ({ faceDown: [...p.faceDown], faceUp: [] }));
  const bySuit: Record<string, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const p of state.tableau) for (const c of p.faceUp) bySuit[c.suit]!.push(c);
  for (const suit of Object.keys(bySuit) as Card["suit"][]) {
    const cards = bySuit[suit]!.sort((a, b) => a.rank - b.rank);
    if (cards.length === 0) continue;
    const index = FOUNDATION_SUITS.indexOf(suit);
    if (index === -1) continue;
    foundations[index] = [...foundations[index]!, ...cards];
  }
  return moved(state, { foundations, tableau });
}

