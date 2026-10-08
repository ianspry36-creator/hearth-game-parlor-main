import { freshDeck, shuffle, type Card, type Suit } from "./cribbage";

/**
 * Sultan Solitaire. Played with one or two decks. The King of Hearts — the
 * Sultan — sits in the centre of the table, ringed by foundations that are
 * each built upward in a single suit: a King, then Ace, 2, 3 and so on up to
 * the Queen. The foundation directly above the Sultan is special: it begins
 * with the Ace of Hearts (the King of Hearts is already seated in the middle)
 * and climbs to the Queen of Hearts. Six reserve cells hold one card each,
 * and the rest of the deck is turned over one card at a time from the stock.
 * When the stock runs dry it may be redealt — twice — shuffling the waste.
 */

export type PackCount = 1 | 2;

export const RESERVE_COUNT = 6;
export const REDEALS = 2;

const PACK_COUNT_KEY = "parlor.sultan.packs";

/** Read the saved pack count (safe on the server and for corrupted storage). */
export function readPackCount(): PackCount {
  if (typeof window === "undefined") return 2;
  try {
    const raw = window.localStorage.getItem(PACK_COUNT_KEY);
    if (raw === "1" || raw === "2") return Number(raw) as PackCount;
  } catch {
    // Ignore storage failures.
  }
  return 2;
}

export function writePackCount(packs: PackCount) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PACK_COUNT_KEY, String(packs));
  } catch {
    // Ignore storage failures.
  }
}

export const isRed = (suit: Suit) => suit === "H" || suit === "D";

/** The rank that follows `rank` on a foundation, wrapping King (13) to Ace (1). */
export function nextRank(rank: number): number {
  return rank === 13 ? 1 : rank + 1;
}

type FoundationSpec = { suit: Suit; seedRank: number };

/**
 * The suit and seed rank of each foundation, starting with the one directly
 * above the Sultan (the Ace of Hearts) and proceeding clockwise.
 *
 * Two packs deal eight foundations: the Ace of Hearts above, then seven Kings
 * — two spades, one heart, two clubs and two diamonds. One pack deals four
 * foundations: the Ace of Hearts above, then the spades, clubs and diamonds
 * Kings (the King of Hearts is the Sultan itself).
 */
export function foundationSpecs(packs: PackCount): FoundationSpec[] {
  if (packs === 2) {
    return [
      { suit: "H", seedRank: 1 },
      { suit: "S", seedRank: 13 },
      { suit: "S", seedRank: 13 },
      { suit: "H", seedRank: 13 },
      { suit: "C", seedRank: 13 },
      { suit: "C", seedRank: 13 },
      { suit: "D", seedRank: 13 },
      { suit: "D", seedRank: 13 },
    ];
  }
  return [
    { suit: "H", seedRank: 1 },
    { suit: "S", seedRank: 13 },
    { suit: "C", seedRank: 13 },
    { suit: "D", seedRank: 13 },
  ];
}

export type GameState = {
  packs: PackCount;
  /** Face-down cards still to be turned; the last card is the next drawn. */
  stock: Card[];
  /** Face-up cards; the last card is on top. */
  waste: Card[];
  /** Foundation piles; each begins with its seed card and climbs to the Queen. */
  foundations: Card[][];
  /** Six reserve cells; each is empty or holds a single card. */
  reserves: (Card | null)[];
  /** The King of Hearts, seated in the centre of the table. */
  sultan: Card;
  /** Redeals remaining (the stock may be turned over and shuffled twice). */
  redeals: number;
  moves: number;
  won: boolean;
};

/** A foundation is complete once it has reached its Queen. */
export function foundationComplete(pile: Card[]): boolean {
  return pile.length > 0 && pile[pile.length - 1]!.rank === 12;
}

/** Whether `card` may be placed on `pile` (same suit, next rank, not yet at the Queen). */
export function canPlaceOnFoundation(card: Card, pile: Card[]): boolean {
  if (pile.length === 0) return false;
  const top = pile[pile.length - 1]!;
  if (top.rank === 12) return false;
  return card.suit === top.suit && card.rank === nextRank(top.rank);
}

/** The first foundation `card` may be placed on, if any. */
export function foundationTarget(card: Card, foundations: Card[][]): number | null {
  for (let i = 0; i < foundations.length; i += 1) {
    if (canPlaceOnFoundation(card, foundations[i]!)) return i;
  }
  return null;
}

/** One or two shuffled decks, every card given a unique id. */
function buildDeck(packs: PackCount, random: () => number): Card[] {
  const deck: Card[] = [];
  for (let p = 0; p < packs; p += 1) deck.push(...freshDeck(random));
  return deck.map((card, index) => ({ ...card, id: `${card.rank}${card.suit}-${index}` }));
}

/** Deal a fresh Sultan layout: the Sultan, the foundation seeds and six reserves. */
export function freshGame(packs: PackCount, random: () => number = Math.random): GameState {
  const deck = buildDeck(packs, random);
  const specs = foundationSpecs(packs);

  // Pull the seeds: the Sultan (King of Hearts) and one seed per foundation.
  const needed: { suit: Suit; rank: number }[] = [
    { suit: "H", rank: 13 },
    ...specs.map((s) => ({ suit: s.suit, rank: s.seedRank })),
  ];
  const used = new Set<number>();
  const seeds: Card[] = [];
  for (const n of needed) {
    const idx = deck.findIndex((c, i) => !used.has(i) && c.suit === n.suit && c.rank === n.rank);
    if (idx === -1) throw new Error("Deck is missing a required seed card");
    used.add(idx);
    seeds.push(deck[idx]!);
  }
  const sultan = seeds[0]!;
  const foundationSeeds = seeds.slice(1);

  const remainder = deck.filter((_, i) => !used.has(i));

  const reserves: (Card | null)[] = [];
  for (let i = 0; i < RESERVE_COUNT; i += 1) reserves.push(remainder.shift() ?? null);

  return {
    packs,
    stock: remainder,
    waste: [],
    foundations: foundationSeeds.map((seed) => [seed]),
    reserves,
    sultan,
    redeals: REDEALS,
    moves: 0,
    won: false,
  };
}

/** A move that changed nothing returns the same state reference. */
function moved(state: GameState, patch: Partial<GameState>): GameState {
  const next: GameState = { ...state, ...patch, moves: state.moves + 1 };
  next.won = next.foundations.every(foundationComplete);
  return next;
}

/** Turn one card over from the stock onto the waste. */
export function drawStock(state: GameState): GameState {
  if (state.won || state.stock.length === 0) return state;
  const card = state.stock[state.stock.length - 1]!;
  return moved(state, {
    stock: state.stock.slice(0, -1),
    waste: [...state.waste, card],
  });
}

/**
 * Turn the waste over and shuffle it into a fresh stock, spending one redeal.
 * This does not count as a move.
 */
export function redeal(state: GameState): GameState {
  if (state.won || state.redeals <= 0 || state.waste.length === 0) return state;
  return {
    ...state,
    stock: shuffle(state.waste),
    waste: [],
    redeals: state.redeals - 1,
  };
}

/** Move the top waste card onto a foundation. */
export function moveWasteToFoundation(state: GameState, foundationIndex: number): GameState {
  if (state.won || state.waste.length === 0) return state;
  const card = state.waste[state.waste.length - 1]!;
  if (!canPlaceOnFoundation(card, state.foundations[foundationIndex]!)) return state;
  return moved(state, {
    waste: state.waste.slice(0, -1),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? [...p, card] : p)),
  });
}

/** Move the top waste card into an empty reserve cell. */
export function moveWasteToReserve(state: GameState, reserveIndex: number): GameState {
  if (state.won || state.waste.length === 0) return state;
  if (state.reserves[reserveIndex] != null) return state;
  const card = state.waste[state.waste.length - 1]!;
  return moved(state, {
    waste: state.waste.slice(0, -1),
    reserves: state.reserves.map((r, i) => (i === reserveIndex ? card : r)),
  });
}

/** Move a reserve card onto a foundation. */
export function moveReserveToFoundation(state: GameState, reserveIndex: number, foundationIndex: number): GameState {
  if (state.won) return state;
  const card = state.reserves[reserveIndex];
  if (card == null) return state;
  if (!canPlaceOnFoundation(card, state.foundations[foundationIndex]!)) return state;
  return moved(state, {
    reserves: state.reserves.map((r, i) => (i === reserveIndex ? null : r)),
    foundations: state.foundations.map((p, i) => (i === foundationIndex ? [...p, card] : p)),
  });
}

/** How many cards have made it home across all foundations. */
export function cardsHome(state: GameState): number {
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0);
}
