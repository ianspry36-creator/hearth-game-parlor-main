import { shuffle, type Card, type Suit } from "./cribbage";

export const TABLEAU_COUNT = 10;
export const RUN_LENGTH = 13; // King (13) down to Ace (1)
export const STARTING_SCORE = 500;
export const RUN_BONUS = 100;
export const TOTAL_RUNS = 8; // 104 cards / 13 = 8 complete runs

export type SpiderDifficulty = 1 | 2 | 4;

export const DIFFICULTY_LABEL: Record<SpiderDifficulty, string> = {
  1: "1 suit",
  2: "2 suits",
  4: "4 suits",
};

/** Friendly label shown on the difficulty toggle. */
export const DIFFICULTY_NAME: Record<SpiderDifficulty, string> = {
  1: "Easy",
  2: "Medium",
  4: "Hard",
};

/**
 * The suit expected in each of the eight foundations, by difficulty. The deck
 * is reduced to match: one suit is all spades, two suits are spades and
 * diamonds, and four suits run spade/diamond/club/heart twice.
 */
export const FOUNDATION_SUITS: Record<SpiderDifficulty, Suit[]> = {
  1: ["S", "S", "S", "S", "S", "S", "S", "S"],
  2: ["S", "D", "S", "D", "S", "D", "S", "D"],
  4: ["S", "D", "C", "H", "S", "D", "C", "H"],
};

export type TableauPile = {
  faceDown: Card[]; // face-down cards at the bottom of the column
  faceUp: Card[]; // face-up cards, bottom (highest) to top (lowest); the last card is on top
};

export type GameState = {
  stock: Card[]; // 50 undealt cards; the last card is the top of the stock
  tableau: TableauPile[]; // ten columns
  foundations: Card[][]; // completed King-to-Ace runs removed from the table
  moves: number;
  won: boolean;
  difficulty: SpiderDifficulty;
};

/** Reduce a card's suit according to the difficulty (1 suit = spades, 2 = spades/diamonds). */
function remapSuit(suit: Suit, difficulty: SpiderDifficulty): Suit {
  if (difficulty === 1) return "S";
  if (difficulty === 2) return suit === "S" || suit === "C" ? "S" : "D";
  return suit;
}

/** Two full decks (104 cards) with unique ids, reduced to the difficulty's suit count. */
function freshSpiderDeck(difficulty: SpiderDifficulty): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < 2; copy += 1) {
    for (const suit of ["S", "H", "D", "C"] as Suit[]) {
      for (let rank = 1; rank <= 13; rank += 1) {
        deck.push({ id: `${copy}-${rank}${suit}`, rank, suit: remapSuit(suit, difficulty) });
      }
    }
  }
  return deck;
}

/**
 * Spider Solitaire deals 54 cards into ten columns — the first four get six
 * cards, the rest get five — with only the top card of each column face up.
 * The remaining 50 cards form the stock. The object is to build eight
 * complete descending runs from King to Ace, all in one suit.
 */
export function freshGame(
  difficulty: SpiderDifficulty,
  random: () => number = Math.random,
): GameState {
  const deck = shuffle(freshSpiderDeck(difficulty), random);
  const tableau: TableauPile[] = [];
  let cursor = 0;
  for (let i = 0; i < TABLEAU_COUNT; i += 1) {
    const size = i < 4 ? 6 : 5;
    const pileCards = deck.slice(cursor, cursor + size);
    cursor += size;
    tableau.push({
      faceDown: pileCards.slice(0, -1),
      faceUp: [pileCards[pileCards.length - 1]!],
    });
  }
  const stock = deck.slice(cursor); // 50 cards
  return { stock, tableau, foundations: [], moves: 0, won: false, difficulty };
}

/** The lowest index of the same-suit descending run that ends at the top card. */
export function topRunStart(faceUp: Card[]): number {
  if (faceUp.length === 0) return 0;
  let start = faceUp.length - 1;
  while (
    start > 0 &&
    faceUp[start - 1]!.suit === faceUp[start]!.suit &&
    faceUp[start - 1]!.rank === faceUp[start]!.rank + 1
  ) {
    start -= 1;
  }
  return start;
}

/**
 * The cards lifted when the card at `cardIndex` is chosen. Only cards that
 * form a single same-suit descending run ending at the top may move together;
 * a card buried below a broken run cannot be lifted at all.
 */
export function liftableRun(faceUp: Card[], cardIndex: number): Card[] | null {
  if (cardIndex < 0 || cardIndex >= faceUp.length) return null;
  const start = topRunStart(faceUp);
  if (cardIndex < start) return null;
  return faceUp.slice(cardIndex);
}

/** A sequence may sit on a destination whose top card is one rank higher (any suit), or on an empty column. */
function canMove(moving: Card[], dest: TableauPile): boolean {
  const top = dest.faceUp[dest.faceUp.length - 1];
  if (!top) return true;
  return moving[0]!.rank === top.rank - 1;
}

/** A complete run is the top thirteen cards of one suit running King down to Ace. */
function completeRunAtTop(faceUp: Card[]): Card[] | null {
  if (faceUp.length < RUN_LENGTH) return null;
  const start = faceUp.length - RUN_LENGTH;
  const run = faceUp.slice(start);
  const suit = run[0]!.suit;
  for (let i = 0; i < RUN_LENGTH; i += 1) {
    const card = run[i]!;
    if (card.suit !== suit || card.rank !== 13 - i) return null;
  }
  return run;
}

/** Flip any exposed face-down card, then clear completed runs, cascading as needed. */
function settle(
  tableau: TableauPile[],
  foundations: Card[][],
): { tableau: TableauPile[]; foundations: Card[][] } {
  let t = tableau.map((p) => ({ faceDown: [...p.faceDown], faceUp: [...p.faceUp] }));
  let f = foundations.map((run) => [...run]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < t.length; i += 1) {
      const pile = t[i]!;
      if (pile.faceUp.length === 0 && pile.faceDown.length > 0) {
        const card = pile.faceDown[pile.faceDown.length - 1]!;
        t[i] = { faceDown: pile.faceDown.slice(0, -1), faceUp: [card] };
        changed = true;
        break;
      }
      const run = completeRunAtTop(pile.faceUp);
      if (run) {
        f = [...f, run];
        t[i] = { faceDown: pile.faceDown, faceUp: pile.faceUp.slice(0, -RUN_LENGTH) };
        changed = true;
        break;
      }
    }
  }
  return { tableau: t, foundations: f };
}

function isWonState(foundations: Card[][]): boolean {
  return foundations.length >= TOTAL_RUNS;
}

export function moveTableau(
  state: GameState,
  fromIndex: number,
  cardIndex: number,
  toIndex: number,
  settleNow = true,
): GameState {
  if (state.won || fromIndex === toIndex) return state;
  const from = state.tableau[fromIndex]!;
  const to = state.tableau[toIndex]!;
  const moving = liftableRun(from.faceUp, cardIndex);
  if (!moving || !canMove(moving, to)) return state;
  const start = from.faceUp.length - moving.length;
  const moved = state.tableau.map((p, i) => {
    if (i === fromIndex) return { faceDown: p.faceDown, faceUp: p.faceUp.slice(0, start) };
    if (i === toIndex) return { faceDown: p.faceDown, faceUp: [...p.faceUp, ...moving] };
    return p;
  });
  if (!settleNow) {
    return { ...state, tableau: moved, moves: state.moves + 1, won: false };
  }
  const result = settle(moved, state.foundations);
  return {
    ...state,
    tableau: result.tableau,
    foundations: result.foundations,
    moves: state.moves + 1,
    won: isWonState(result.foundations),
  };
}

/**
 * Double-click helper: move a column's top run to its best resting spot — the
 * first empty column, or else the first column that can accept the run.
 */
export function autoMove(
  state: GameState,
  fromIndex: number,
  settleNow = true,
): GameState {
  if (state.won) return state;
  const from = state.tableau[fromIndex];
  if (!from || from.faceUp.length === 0) return state;
  const start = topRunStart(from.faceUp);
  const run = liftableRun(from.faceUp, start);
  if (!run || run.length === 0) return state;

  let target = -1;
  for (let i = 0; i < state.tableau.length; i += 1) {
    if (i === fromIndex) continue;
    const pile = state.tableau[i]!;
    if (pile.faceDown.length === 0 && pile.faceUp.length === 0) {
      target = i;
      break;
    }
  }
  if (target === -1) {
    for (let i = 0; i < state.tableau.length; i += 1) {
      if (i === fromIndex) continue;
      if (canMove(run, state.tableau[i]!)) {
        target = i;
        break;
      }
    }
  }
  if (target === -1) return state;
  return moveTableau(state, fromIndex, start, target, settleNow);
}

/**
 * Flip the top face-down card of a tableau pile, then settle (clear any
 * completed run) and recompute the win state. Used to reveal a card after a
 * double-click move's flight animation has finished.
 */
export function revealTopCard(state: GameState, index: number): GameState {
  const pile = state.tableau[index];
  if (!pile || pile.faceUp.length > 0 || pile.faceDown.length === 0) return state;
  const card = pile.faceDown[pile.faceDown.length - 1]!;
  const tableau = state.tableau.map((p, i) =>
    i === index ? { faceDown: p.faceDown.slice(0, -1), faceUp: [card] } : p,
  );
  const result = settle(tableau, state.foundations);
  return {
    ...state,
    tableau: result.tableau,
    foundations: result.foundations,
    won: isWonState(result.foundations),
  };
}

/** Whether the stock may be dealt (requires every column to hold at least one card). */
export function canDeal(state: GameState): boolean {
  if (state.won || state.stock.length === 0) return false;
  return state.tableau.every((p) => p.faceDown.length + p.faceUp.length > 0);
}

/** Deal ten cards (one to each column) from the top of the stock, face up. */
export function dealStock(state: GameState): GameState {
  if (!canDeal(state)) return state;
  const count = Math.min(10, state.stock.length);
  let stock = state.stock;
  const dealt = state.tableau.map((p, i) => {
    if (i >= count) return p;
    const card = stock[stock.length - 1]!;
    stock = stock.slice(0, -1);
    return { faceDown: p.faceDown, faceUp: [...p.faceUp, card] };
  });
  const result = settle(dealt, state.foundations);
  return {
    ...state,
    stock,
    tableau: result.tableau,
    foundations: result.foundations,
    moves: state.moves + 1,
    won: isWonState(result.foundations),
  };
}

/** Spider's running score: 500 to start, minus one per move, plus 100 per completed run. */
export function score(state: GameState): number {
  return STARTING_SCORE - state.moves + RUN_BONUS * state.foundations.length;
}

/** How many complete runs (of eight) have been removed from the table. */
export function completedRuns(state: GameState): number {
  return state.foundations.length;
}
