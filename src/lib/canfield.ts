import { freshDeck, type Card, type Suit } from "./cribbage";

export type DrawMode = 1 | 3;

/**
 * Canfield is dealt from a single shuffled deck. A base card is turned onto
 * the first foundation and fixes the lead rank (and the suit of that first
 * pile); the other three foundations start empty. Thirteen cards go to the
 * reserve, one card to each of the four tableau piles, and the rest to the
 * stock. Every foundation is built upward in a single suit from the base
 * rank, wrapping from King to Ace.
 */
export type GameState = {
  stock: Card[]; // face-down cards still to be dealt to the waste
  waste: Card[]; // face-up; the last card is on top
  foundations: Card[][]; // four piles, each empty or a single-suit ascending stack
  reserve: Card[]; // thirteen cards; the last card is the face-up top
  tableau: Card[][]; // four face-up piles; the last card is on top
  baseRank: number; // 1..13, the lead rank every foundation starts from
  moves: number;
  won: boolean;
};

export const isRed = (suit: Card["suit"]) => suit === "H" || suit === "D";

/** The rank that follows `rank` on a foundation, wrapping King (13) to Ace (1). */
export function nextRank(rank: number): number {
  return (rank % 13) + 1;
}

/** Number of steps from `baseRank` up to `rank` (0..12), wrapping. */
export function rankOffset(baseRank: number, rank: number): number {
  return (rank - baseRank + 13) % 13;
}

export function freshGame(random: () => number = Math.random): GameState {
  const deck = freshDeck(random);
  const base = deck.shift()!;
  const reserve: Card[] = [];
  for (let i = 0; i < 13; i += 1) reserve.push(deck.shift()!);
  const tableau: Card[][] = [];
  for (let i = 0; i < 4; i += 1) tableau.push([deck.shift()!]);
  return {
    stock: deck, // the remaining 34 cards
    waste: [],
    foundations: [[base], [], [], []],
    reserve,
    tableau,
    baseRank: base.rank,
    moves: 0,
    won: false,
  };
}

/** A valid foundation move: the base rank on an empty pile, or the next rank in suit. */
export function canPlaceOnFoundation(card: Card, pile: Card[], baseRank: number): boolean {
  if (pile.length === 0) return card.rank === baseRank;
  const top = pile[pile.length - 1]!;
  return top.suit === card.suit && card.rank === nextRank(top.rank);
}

/** The first foundation `card` may currently be placed on, if any. */
export function foundationTarget(card: Card, foundations: Card[][], baseRank: number): number | null {
  for (let i = 0; i < foundations.length; i += 1) {
    if (canPlaceOnFoundation(card, foundations[i]!, baseRank)) return i;
  }
  return null;
}

/**
 * A face-up run: descending rank, alternating colour, wrapping from Ace down
 * to King. The first card is the bottom of the run that will touch the pile
 * it is moved onto.
 */
export function isRun(cards: Card[]): boolean {
  for (let i = 1; i < cards.length; i += 1) {
    const prev = cards[i - 1]!;
    const cur = cards[i]!;
    if (isRed(cur.suit) === isRed(prev.suit)) return false;
    if (cur.rank !== prev.rank - 1 && !(prev.rank === 1 && cur.rank === 13)) return false;
  }
  return true;
}

/** Whether `bottom` may sit directly on `top` in a tableau pile. */
export function buildsOn(bottom: Card, top: Card): boolean {
  if (isRed(bottom.suit) === isRed(top.suit)) return false;
  if (top.rank === bottom.rank + 1) return true;
  return bottom.rank === 13 && top.rank === 1;
}

/**
 * A tableau move: `cards` (bottom-first) onto `pile`. Empty piles accept any
 * card; the forced rule that the reserve fills an empty pile first is enforced
 * by `settle`, so by the time a player sees an empty pile the reserve is empty.
 */
export function canPlaceOnTableau(cards: Card[], pile: Card[]): boolean {
  if (!isRun(cards)) return false;
  if (pile.length === 0) return true;
  return buildsOn(cards[0]!, pile[pile.length - 1]!);
}

/**
 * Enforce the required move: whenever a tableau pile is empty the top reserve
 * card is played into it automatically, without counting as a move.
 */
function settle(state: GameState): GameState {
  const reserve = [...state.reserve];
  const tableau = state.tableau.map((pile) => [...pile]);
  for (let i = 0; i < 4; i += 1) {
    if (tableau[i]!.length === 0 && reserve.length > 0) tableau[i]!.push(reserve.pop()!);
  }
  return { ...state, reserve, tableau };
}

/** A move that changed nothing (illegal) returns the same state reference. */
function moved(state: GameState, patch: Partial<GameState>): GameState {
  let next = { ...state, ...patch, moves: state.moves + 1 };
  next = settle(next);
  next.won = next.foundations.every((pile) => pile.length === 13);
  return next;
}

/**
 * Flip the top card(s) of the stock onto the waste. When the stock is empty
 * the waste is turned over and redealt, so the hand never runs dry.
 */
export function drawStock(state: GameState, drawMode: DrawMode): GameState {
  if (state.won) return state;
  let stock = [...state.stock];
  let waste = [...state.waste];
  if (stock.length === 0) {
    if (waste.length === 0) return state;
    stock = waste.reverse();
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
  if (!canPlaceOnFoundation(card, pile, state.baseRank)) return state;
  return moved(state, {
    waste: state.waste.slice(0, -1),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? [...p, card] : p)),
  });
}

export function moveWasteToTableau(state: GameState, toIndex: number): GameState {
  if (state.won || state.waste.length === 0) return state;
  const card = state.waste[state.waste.length - 1]!;
  const target = state.tableau[toIndex]!;
  if (!canPlaceOnTableau([card], target)) return state;
  return moved(state, {
    waste: state.waste.slice(0, -1),
    tableau: state.tableau.map((p, i) => (i === toIndex ? [...p, card] : p)),
  });
}

export function moveFoundationToTableau(state: GameState, foundationIndex: number, toIndex: number): GameState {
  if (state.won) return state;
  const pile = state.foundations[foundationIndex]!;
  if (pile.length === 0) return state;
  const card = pile[pile.length - 1]!;
  const target = state.tableau[toIndex]!;
  if (!canPlaceOnTableau([card], target)) return state;
  return moved(state, {
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? p.slice(0, -1) : p)),
    tableau: state.tableau.map((p, i) => (i === toIndex ? [...p, card] : p)),
  });
}

export function moveReserveToFoundation(state: GameState, foundationIndex: number): GameState {
  if (state.won || state.reserve.length === 0) return state;
  const card = state.reserve[state.reserve.length - 1]!;
  const pile = state.foundations[foundationIndex]!;
  if (!canPlaceOnFoundation(card, pile, state.baseRank)) return state;
  return moved(state, {
    reserve: state.reserve.slice(0, -1),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? [...p, card] : p)),
  });
}

export function moveReserveToTableau(state: GameState, toIndex: number): GameState {
  if (state.won || state.reserve.length === 0) return state;
  const card = state.reserve[state.reserve.length - 1]!;
  const target = state.tableau[toIndex]!;
  if (!canPlaceOnTableau([card], target)) return state;
  return moved(state, {
    reserve: state.reserve.slice(0, -1),
    tableau: state.tableau.map((p, i) => (i === toIndex ? [...p, card] : p)),
  });
}

export function moveTableauToFoundation(state: GameState, fromIndex: number, foundationIndex: number): GameState {
  if (state.won) return state;
  const pile = state.tableau[fromIndex]!;
  if (pile.length === 0) return state;
  const card = pile[pile.length - 1]!;
  const target = state.foundations[foundationIndex]!;
  if (!canPlaceOnFoundation(card, target, state.baseRank)) return state;
  return moved(state, {
    tableau: state.tableau.map((p, i) => (i === fromIndex ? p.slice(0, -1) : p)),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? [...p, card] : p)),
  });
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
  const moving = from.slice(fromCardIndex);
  if (moving.length === 0 || !canPlaceOnTableau(moving, to)) return state;
  return moved(state, {
    tableau: state.tableau.map((p, i) => {
      if (i === fromIndex) return p.slice(0, fromCardIndex);
      if (i === toIndex) return [...p, ...moving];
      return p;
    }),
  });
}

/**
 * Once the stock and reserve are exhausted, every remaining card is face up on
 * the tableau and the foundations can be rearranged freely, so the hand is
 * guaranteed to finish. Everything still out of the foundations is moved home.
 */
export function canAutoComplete(state: GameState): boolean {
  return state.stock.length === 0 && state.reserve.length === 0;
}

export function autoComplete(state: GameState): GameState {
  const bySuit: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const pile of state.foundations) for (const card of pile) bySuit[card.suit]!.push(card);
  for (const card of state.waste) bySuit[card.suit]!.push(card);
  for (const pile of state.tableau) for (const card of pile) bySuit[card.suit]!.push(card);

  const suits: Suit[] = ["S", "H", "D", "C"];
  const foundations = suits.map((suit) =>
    bySuit[suit]!.sort((a, b) => rankOffset(state.baseRank, a.rank) - rankOffset(state.baseRank, b.rank)),
  );
  return { ...state, waste: [], tableau: [[], [], [], []], foundations, won: true };
}

/** How many cards have made it home across all four foundations. */
export function cardsHome(state: GameState): number {
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0);
}

