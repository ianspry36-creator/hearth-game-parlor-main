import { freshDeck, shuffle, type Card, type Suit } from "@/lib/cribbage";

export const HAND_SIZE = 7;
export const WILD_RANK = 8;
export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const SUIT_NAME: Record<Suit, string> = {
  S: "Spades",
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
};

export const newDeck = (random: () => number = Math.random) => freshDeck(random);

/** May this card follow the current top card / nominated suit? */
export function canFollow(card: Card, top: Card, wildSuit: Suit | null): boolean {
  if (card.rank === WILD_RANK) return true;
  if (wildSuit) return card.suit === wildSuit;
  return card.suit === top.suit || card.rank === top.rank;
}

export const hasPlayable = (hand: Card[], top: Card, wildSuit: Suit | null) =>
  hand.some((card) => canFollow(card, top, wildSuit));

/** Penalty count for a hand — eights are dear, faces count ten. */
export const handPenalty = (hand: Card[]) =>
  hand.reduce((sum, card) => {
    if (card.rank === WILD_RANK) return sum + 50;
    if (card.rank > 10) return sum + 10;
    if (card.rank === 1) return sum + 1;
    return sum + card.rank;
  }, 0);

/** Charlotte's choice: follow suit or rank where she can, saving eights for last. */
export function chooseCard(hand: Card[], top: Card, wildSuit: Suit | null): Card | null {
  const legal = hand.filter((card) => canFollow(card, top, wildSuit));
  if (!legal.length) return null;
  const plain = legal.filter((card) => card.rank !== WILD_RANK);
  const pool = plain.length ? plain : legal;
  // Prefer the suit she holds most of, then the highest card.
  const counts = new Map<Suit, number>();
  for (const card of hand) counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
  return [...pool].sort(
    (a, b) => (counts.get(b.suit) ?? 0) - (counts.get(a.suit) ?? 0) || b.rank - a.rank,
  )[0]!;
}

/** After playing an eight, nominate the suit she is longest in. */
export function chooseSuit(hand: Card[]): Suit {
  const counts = new Map<Suit, number>();
  for (const card of hand) if (card.rank !== WILD_RANK) counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
  return [...SUITS].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0]!;
}

/**
 * Draw one card, recycling the discard pile beneath the top card when the stock runs dry.
 */
export function drawOne(
  deck: Card[],
  pile: Card[],
): { card: Card | null; deck: Card[]; pile: Card[] } {
  if (deck.length) {
    const [card, ...rest] = deck;
    return { card: card!, deck: rest, pile };
  }
  if (pile.length > 1) {
    const top = pile[pile.length - 1]!;
    const recycled = shuffle(pile.slice(0, -1));
    const [card, ...rest] = recycled;
    return { card: card!, deck: rest, pile: [top] };
  }
  return { card: null, deck, pile };
}
