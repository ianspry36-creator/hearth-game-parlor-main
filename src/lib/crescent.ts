import { freshDeck, type Card, type Suit } from "./cribbage";

/**
 * Crescent Solitaire. Played with two full decks laid out in sixteen face-up
 * tableau piles arranged in a crescent, and eight foundations: a top row of
 * four that build down from the King, and a bottom row of four that build up
 * from the Ace. Tableau cards move one at a time onto a card of the same suit
 * one rank higher or lower (wrapping King to Ace), and a limited number of
 * shuffles move the bottom card of every tableau to the top.
 */

export type Difficulty = "easy" | "medium" | "hard";

export const SHUFFLES_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 9,
  medium: 6,
  hard: 3,
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export const DIFFICULTY_KEY = "parlor.crescent.difficulty";

/** Read the saved difficulty (safe on the server and for corrupted storage). */
export function readDifficulty(): Difficulty {
  if (typeof window === "undefined") return "medium";
  try {
    const raw = window.localStorage.getItem(DIFFICULTY_KEY);
    if (raw === "easy" || raw === "medium" || raw === "hard") return raw;
  } catch {
    // Ignore storage failures.
  }
  return "medium";
}

export function writeDifficulty(difficulty: Difficulty) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DIFFICULTY_KEY, difficulty);
  } catch {
    // Ignore storage failures.
  }
}

/** Suit for each foundation, left to right: top row (S H D C) then bottom row (S H D C). */
export const FOUNDATION_SUITS: Suit[] = ["S", "H", "D", "C", "S", "H", "D", "C"];

export const isRed = (suit: Suit) => suit === "H" || suit === "D";

/** Foundations 0..3 build down from the King; foundations 4..7 build up from the Ace. */
export const isDownFoundation = (index: number) => index < 4;

export type GameState = {
  /** Sixteen piles; index 0 is the bottom (first dealt) card, the last index is the top. */
  tableaus: Card[][];
  /** Eight piles; the first card of each is the fixed King or Ace seed. */
  foundations: Card[][];
  shufflesLeft: number;
  difficulty: Difficulty;
  moves: number;
  won: boolean;
};

export const TABLEAU_COUNT = 16;
export const TABLEAU_SIZE = 6;

/** Two shuffled decks with every card given a unique id (duplicates across decks). */
function doubleDeck(random: () => number): Card[] {
  const deck = [...freshDeck(random), ...freshDeck(random)];
  return deck.map((card, index) => ({ ...card, id: `${card.rank}${card.suit}-${index}` }));
}

/** Deal a fresh Crescent layout: eight seed cards and sixteen piles of six. */
export function freshGame(difficulty: Difficulty, random: () => number = Math.random): GameState {
  const deck = doubleDeck(random);
  const kings: Partial<Record<Suit, Card>> = {};
  const aces: Partial<Record<Suit, Card>> = {};
  const remainder: Card[] = [];
  for (const card of deck) {
    if (card.rank === 13 && !kings[card.suit]) {
      kings[card.suit] = card;
      continue;
    }
    if (card.rank === 1 && !aces[card.suit]) {
      aces[card.suit] = card;
      continue;
    }
    remainder.push(card);
  }

  const foundations: Card[][] = [];
  for (const suit of ["S", "H", "D", "C"] as Suit[]) foundations.push([kings[suit]!]);
  for (const suit of ["S", "H", "D", "C"] as Suit[]) foundations.push([aces[suit]!]);

  const tableaus: Card[][] = [];
  for (let i = 0; i < TABLEAU_COUNT; i++) tableaus.push(remainder.splice(0, TABLEAU_SIZE));

  return {
    tableaus,
    foundations,
    shufflesLeft: SHUFFLES_BY_DIFFICULTY[difficulty],
    difficulty,
    moves: 0,
    won: false,
  };
}


/** A foundation accepts the next rank of its suit in its fixed direction (no wrap). */
export function canPlaceOnFoundation(card: Card, foundation: Card[], index: number): boolean {
  if (foundation.length === 0) return false;
  const top = foundation[foundation.length - 1]!;
  if (card.suit !== top.suit) return false;
  return isDownFoundation(index) ? card.rank === top.rank - 1 : card.rank === top.rank + 1;
}

/** A tableau accepts a same-suit card one rank higher or lower, wrapping at the ends. */
export function canPlaceOnTableau(card: Card, tableau: Card[]): boolean {
  if (tableau.length === 0) return true;
  const top = tableau[tableau.length - 1]!;
  if (card.suit !== top.suit) return false;
  const higher = card.rank === top.rank + 1 || (top.rank === 13 && card.rank === 1);
  const lower = card.rank === top.rank - 1 || (top.rank === 1 && card.rank === 13);
  return higher || lower;
}

/** The foundation `card` can be placed on, if any (for double-click auto-moves). */
export function foundationTarget(card: Card, foundations: Card[][]): number | null {
  for (let i = 0; i < foundations.length; i++) {
    if (canPlaceOnFoundation(card, foundations[i]!, i)) return i;
  }
  return null;
}

type Patch = { tableaus?: Card[][]; foundations?: Card[][]; shufflesLeft?: number };

function withMove(state: GameState, patch: Patch, countMove = true): GameState {
  const next: GameState = {
    ...state,
    ...patch,
    moves: countMove ? state.moves + 1 : state.moves,
  };
  next.won = next.tableaus.every((pile) => pile.length === 0);
  return next;
}

/** Move the top card of one tableau onto another (single card, same suit, rank ±1). */
export function moveTableauToTableau(state: GameState, fromIndex: number, toIndex: number): GameState {
  if (state.won || fromIndex === toIndex) return state;
  const from = state.tableaus[fromIndex]!;
  const to = state.tableaus[toIndex]!;
  if (from.length === 0) return state;
  const card = from[from.length - 1]!;
  if (!canPlaceOnTableau(card, to)) return state;
  return withMove(state, {
    tableaus: state.tableaus.map((p, i) => {
      if (i === fromIndex) return p.slice(0, -1);
      if (i === toIndex) return [...p, card];
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
  const from = state.tableaus[fromIndex]!;
  if (from.length === 0) return state;
  const card = from[from.length - 1]!;
  if (!canPlaceOnFoundation(card, state.foundations[foundationIndex]!, foundationIndex)) return state;
  return withMove(state, {
    tableaus: state.tableaus.map((p, i) => (i === fromIndex ? p.slice(0, -1) : p)),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? [...p, card] : p)),
  });
}

/** Move a foundation's top card back to a tableau (never the fixed seed card). */
export function moveFoundationToTableau(state: GameState, foundationIndex: number, toIndex: number): GameState {
  if (state.won) return state;
  const foundation = state.foundations[foundationIndex]!;
  if (foundation.length <= 1) return state;
  const card = foundation[foundation.length - 1]!;
  const to = state.tableaus[toIndex]!;
  if (!canPlaceOnTableau(card, to)) return state;
  return withMove(state, {
    tableaus: state.tableaus.map((p, i) => (i === toIndex ? [...p, card] : p)),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? p.slice(0, -1) : p)),
  });
}

/** Move the bottom card of every tableau to the top, spending one shuffle. */
export function shuffleTableaus(state: GameState): GameState {
  if (state.won || state.shufflesLeft <= 0) return state;
  return withMove(
    state,
    {
      tableaus: state.tableaus.map((p) => (p.length > 1 ? [...p.slice(1), p[0]!] : p)),
      shufflesLeft: state.shufflesLeft - 1,
    },
    false,
  );
}
