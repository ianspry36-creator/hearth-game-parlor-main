import { freshDeck, type Card, type Suit } from "./cribbage";

export const TABLEAU_COUNT = 7;

export type TableauPile = {
  faceDown: Card[]; // face-down cards at the bottom
  faceUp: Card[]; // face-up cards, bottom to top; the last card is on top
};

/**
 * Yukon is dealt from a single shuffled deck into seven tableau piles with no
 * stock or reserve. The first pile holds one face-up card; each of piles two
 * through seven holds one fewer face-down card than its number, with five
 * face-up cards on top. Foundations are built upward in a single suit from
 * the Ace. The signature move is lifting any face-up card — and everything
 * above it, ordered or not — onto an opposite-coloured card one rank higher.
 */
export type GameState = {
  tableau: TableauPile[]; // seven piles that make up the body
  foundations: Card[][]; // four piles, each empty or a single-suit ascending stack
  moves: number;
  won: boolean;
};

export const isRed = (suit: Suit) => suit === "H" || suit === "D";

export function freshGame(random: () => number = Math.random): GameState {
  const deck = freshDeck(random);
  const tableau: TableauPile[] = [];
  for (let i = 0; i < TABLEAU_COUNT; i += 1) {
    const n = i + 1; // tableau number 1..7
    const faceDownCount = n - 1; // pile 1 has none, pile 7 has six
    const faceUpCount = n === 1 ? 1 : 5;
    const faceDown: Card[] = [];
    const faceUp: Card[] = [];
    for (let d = 0; d < faceDownCount; d += 1) faceDown.push(deck.shift()!);
    for (let u = 0; u < faceUpCount; u += 1) faceUp.push(deck.shift()!);
    tableau.push({ faceDown, faceUp });
  }
  return { tableau, foundations: [[], [], [], []], moves: 0, won: false };
}

/** A valid foundation move: an Ace on an empty pile, or the next rank in suit. */
export function canPlaceOnFoundation(card: Card, pile: Card[]): boolean {
  if (pile.length === 0) return card.rank === 1;
  const top = pile[pile.length - 1]!;
  return top.suit === card.suit && card.rank === top.rank + 1;
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

/**
 * A tableau move. The bottom card of the moving group must sit on a card of
 * the opposite colour one rank higher, or be a King on an empty pile. The
 * group itself need not be ordered — the defining freedom of Yukon.
 */
export function canPlaceOnTableau(moving: Card[], dest: TableauPile): boolean {
  if (moving.length === 0) return false;
  const bottom = moving[0]!;
  const top = dest.faceUp[dest.faceUp.length - 1];
  if (!top) return bottom.rank === 13;
  return isRed(bottom.suit) !== isRed(top.suit) && top.rank === bottom.rank + 1;
}

/** A move that changed nothing (illegal) returns the same state reference. */
function moved(state: GameState, patch: Partial<GameState>): GameState {
  const next = { ...state, ...patch, moves: state.moves + 1 };
  next.won = next.foundations.every((pile) => pile.length === 13);
  return next;
}

export function moveTableauToTableau(
  state: GameState,
  fromIndex: number,
  fromCardIndex: number,
  toIndex: number,
): GameState {
  if (state.won || fromIndex === toIndex) return state;
  const from = state.tableau[fromIndex]!;
  const to = state.tableau[toIndex]!;
  const moving = from.faceUp.slice(fromCardIndex);
  if (moving.length === 0 || !canPlaceOnTableau(moving, to)) return state;
  return moved(state, {
    tableau: state.tableau.map((p, i) => {
      if (i === fromIndex) return { ...p, faceUp: p.faceUp.slice(0, fromCardIndex) };
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
  const pile = state.tableau[fromIndex]!;
  if (pile.faceUp.length === 0) return state;
  const card = pile.faceUp[pile.faceUp.length - 1]!;
  const target = state.foundations[foundationIndex]!;
  if (!canPlaceOnFoundation(card, target)) return state;
  return moved(state, {
    tableau: state.tableau.map((p, i) =>
      i === fromIndex ? { ...p, faceUp: p.faceUp.slice(0, -1) } : p,
    ),
    foundations: state.foundations.map((f, i) => (i === foundationIndex ? [...f, card] : f)),
  });
}

/** Move the top card of a foundation back onto the tableau. */
export function moveFoundationToTableau(
  state: GameState,
  foundationIndex: number,
  toIndex: number,
): GameState {
  if (state.won) return state;
  const pile = state.foundations[foundationIndex]!;
  if (pile.length === 0) return state;
  const card = pile[pile.length - 1]!;
  const target = state.tableau[toIndex]!;
  if (!canPlaceOnTableau([card], target)) return state;
  return moved(state, {
    foundations: state.foundations.map((f, i) => (i === foundationIndex ? f.slice(0, -1) : f)),
    tableau: state.tableau.map((p, i) =>
      i === toIndex ? { ...p, faceUp: [...p.faceUp, card] } : p,
    ),
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

/**
 * Once every tableau card is face up the hand is guaranteed to finish, so the
 * remaining cards are swept onto the foundations automatically.
 */
export function canAutoComplete(state: GameState): boolean {
  return state.tableau.every((p) => p.faceDown.length === 0);
}

/** Rebuild each foundation as a complete sorted suit from every card in play. */
export function autoComplete(state: GameState): GameState {
  const bySuit: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const pile of state.foundations) for (const card of pile) bySuit[card.suit]!.push(card);
  for (const pile of state.tableau) for (const card of pile.faceUp) bySuit[card.suit]!.push(card);
  const suits: Suit[] = ["S", "H", "D", "C"];
  const foundations = suits.map((suit) => bySuit[suit]!.sort((a, b) => a.rank - b.rank));
  return {
    ...state,
    tableau: state.tableau.map((p) => ({ faceDown: p.faceDown, faceUp: [] })),
    foundations,
    won: true,
  };
}

/** How many cards have made it home across all four foundations. */
export function cardsHome(state: GameState): number {
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0);
}
