import { freshDeck, type Card } from "./cribbage";

export const TABLEAU_COUNT = 7;
export const TAIL_COUNT = 3;
export const CARDS_PER_PILE = 7;

export type TableauPile = {
  faceDown: Card[]; // face-down cards at the bottom (only the first four piles are dealt any)
  faceUp: Card[]; // face-up cards, bottom (highest) to top (lowest); the last card is on top
};

export type GameState = {
  tail: Card[]; // three face-down cards in reserve, dealt to the first three piles
  tableau: TableauPile[]; // seven piles that make up the body
  foundations: Card[][]; // completed King-to-Ace runs removed from the table (when clearRuns)
  clearRuns: boolean; // remove completed runs and allow dealing the tail at leisure
  moves: number;
  won: boolean;
};

/**
 * Scorpion Solitaire is dealt into seven piles of seven cards. The first four
 * piles are dealt three cards face down and four face up; the last three are
 * all face up. Three cards remain face down as the tail. The object is to
 * build four descending runs, King to Ace, one per suit, anywhere on the
 * table. Face-up sequences move onto a same-suit card one rank higher, and
 * only a King may fill an empty pile.
 */
export function freshGame(random: () => number = Math.random): GameState {
  const deck = freshDeck(random);
  const tableau: TableauPile[] = [];
  for (let i = 0; i < TABLEAU_COUNT; i += 1) {
    const faceDown: Card[] = [];
    const faceUp: Card[] = [];
    const downCount = i < 4 ? 3 : 0;
    for (let d = 0; d < downCount; d += 1) faceDown.push(deck.shift()!);
    for (let u = 0; u < CARDS_PER_PILE - downCount; u += 1) faceUp.push(deck.shift()!);
    tableau.push({ faceDown, faceUp });
  }
  const tail: Card[] = [];
  for (let t = 0; t < TAIL_COUNT; t += 1) tail.push(deck.shift()!);
  return { tail, tableau, foundations: [], clearRuns: true, moves: 0, won: false };
}

/** A complete run: thirteen face-up cards of one suit running King down to Ace. */
export function isCompleteRun(pile: TableauPile): boolean {
  const cards = pile.faceUp;
  if (cards.length !== 13) return false;
  const suit = cards[0]!.suit;
  for (let i = 0; i < 13; i += 1) {
    const card = cards[i]!;
    if (card.suit !== suit || card.rank !== 13 - i) return false;
  }
  return true;
}

/**
 * Whether a sequence may sit on a destination pile. The bottom card of the
 * sequence must match the destination's top card in suit and be one rank
 * below it, or be a King when the destination is empty.
 */
export function canMove(moving: Card[], dest: TableauPile): boolean {
  if (moving.length === 0) return false;
  const bottom = moving[0]!;
  const top = dest.faceUp[dest.faceUp.length - 1];
  if (!top) return bottom.rank === 13;
  return bottom.suit === top.suit && bottom.rank === top.rank - 1;
}

/** Flip any exposed face-down card, then clear completed runs, cascading as needed. */
function settle(
  tableau: TableauPile[],
  foundations: Card[][],
  clearRuns: boolean,
): { tableau: TableauPile[]; foundations: Card[][] } {
  let t = tableau.map((p) => ({ faceDown: [...p.faceDown], faceUp: [...p.faceUp] }));
  let f = foundations.map((p) => [...p]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < t.length; i += 1) {
      const pile = t[i]!;
      if (pile.faceUp.length === 0 && pile.faceDown.length > 0) {
        const card = pile.faceDown[pile.faceDown.length - 1]!;
        t[i] = { faceDown: pile.faceDown.slice(0, -1), faceUp: [card] };
        changed = true;
      }
    }
    if (clearRuns) {
      for (let i = 0; i < t.length; i += 1) {
        const pile = t[i]!;
        if (isCompleteRun(pile)) {
          f = [...f, [...pile.faceUp]];
          t[i] = { faceDown: pile.faceDown, faceUp: [] };
          changed = true;
          break;
        }
      }
    }
  }
  return { tableau: t, foundations: f };
}

function isWonState(tableau: TableauPile[], foundations: Card[][], clearRuns: boolean): boolean {
  if (clearRuns) return foundations.reduce((sum, pile) => sum + pile.length, 0) === 52;
  return tableau.filter((pile) => isCompleteRun(pile)).length >= 4;
}

export function moveTableau(state: GameState, fromIndex: number, cardIndex: number, toIndex: number): GameState {
  if (state.won || fromIndex === toIndex) return state;
  const from = state.tableau[fromIndex]!;
  const to = state.tableau[toIndex]!;
  const moving = from.faceUp.slice(cardIndex);
  if (moving.length === 0 || !canMove(moving, to)) return state;
  const moved = state.tableau.map((p, i) => {
    if (i === fromIndex) return { faceDown: p.faceDown, faceUp: p.faceUp.slice(0, cardIndex) };
    if (i === toIndex) return { faceDown: p.faceDown, faceUp: [...p.faceUp, ...moving] };
    return p;
  });
  const result = settle(moved, state.foundations, state.clearRuns);
  return {
    ...state,
    tableau: result.tableau,
    foundations: result.foundations,
    moves: state.moves + 1,
    won: isWonState(result.tableau, result.foundations, state.clearRuns),
  };
}

/** Deal the tail, one card to each of the first three piles. */
export function dealTail(state: GameState): GameState {
  if (state.won || state.tail.length === 0) return state;
  let tail = state.tail;
  const dealt = state.tableau.map((p, i) => {
    if (i < 3 && tail.length > 0) {
      const card = tail[tail.length - 1]!;
      tail = tail.slice(0, -1);
      return { faceDown: p.faceDown, faceUp: [...p.faceUp, card] };
    }
    return p;
  });
  const result = settle(dealt, state.foundations, state.clearRuns);
  return {
    ...state,
    tail,
    tableau: result.tableau,
    foundations: result.foundations,
    moves: state.moves + 1,
    won: isWonState(result.tableau, result.foundations, state.clearRuns),
  };
}

export function setClearRuns(state: GameState, clearRuns: boolean): GameState {
  if (state.clearRuns === clearRuns) return state;
  if (clearRuns) {
    const result = settle(state.tableau, state.foundations, true);
    return {
      ...state,
      clearRuns: true,
      tableau: result.tableau,
      foundations: result.foundations,
      won: isWonState(result.tableau, result.foundations, true),
    };
  }
  return { ...state, clearRuns: false };
}

/** Whether any face-up sequence may currently be moved. */
export function hasAvailableMove(state: GameState): boolean {
  for (let from = 0; from < state.tableau.length; from += 1) {
    const pile = state.tableau[from]!;
    for (let i = 0; i < pile.faceUp.length; i += 1) {
      const moving = pile.faceUp.slice(i);
      for (let to = 0; to < state.tableau.length; to += 1) {
        if (to === from) continue;
        if (canMove(moving, state.tableau[to]!)) return true;
      }
    }
  }
  return false;
}

/** How many runs (of four) have been completed. */
export function runsComplete(state: GameState): number {
  if (state.clearRuns) return state.foundations.length;
  return state.tableau.filter((pile) => isCompleteRun(pile)).length;
}
