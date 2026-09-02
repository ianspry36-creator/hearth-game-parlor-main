import { freshDeck, cardValue, type Card, type Suit } from "@/lib/cribbage";

/** Ten cards each, first to one hundred points wins the table. */
export const HAND_SIZE = 10;
export const WIN_SCORE = 100;
/** You may knock once your deadwood is this many points or fewer. */
export const KNOCK_LIMIT = 10;
export const GIN_BONUS = 25;
export const UNDERCUT_BONUS = 25;

export const newDeck = (random: () => number = Math.random) => freshDeck(random);

export const cardPoints = (card: Card) => cardValue(card);

/* ----------------------------- meld detection ----------------------------- */

/** A run is three or more consecutive cards of the same suit. */
export function isRun(meld: Card[]): boolean {
  if (meld.length < 3) return false;
  const suit = meld[0]!.suit;
  if (!meld.every((card) => card.suit === suit)) return false;
  const ranks = meld.map((card) => card.rank).sort((a, b) => a - b);
  return ranks.every((rank, index) => index === 0 || rank === ranks[index - 1]! + 1);
}

function combos<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const result: T[][] = [];
  const build = (start: number, acc: T[]) => {
    if (acc.length === size) {
      result.push([...acc]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]!);
      build(i + 1, acc);
      acc.pop();
    }
  };
  build(0, []);
  return result;
}

/** Every candidate meld — three/four of a kind and every straight run of three or more. */
function atomicMelds(cards: Card[]): Card[][] {
  const result: Card[][] = [];

  const byRank = new Map<number, Card[]>();
  for (const card of cards) {
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }
  for (const group of byRank.values()) {
    for (const size of [3, 4]) {
      if (group.length >= size) for (const combo of combos(group, size)) result.push(combo);
    }
  }

  const bySuit = new Map<Suit, Card[]>();
  for (const card of cards) {
    const group = bySuit.get(card.suit) ?? [];
    group.push(card);
    bySuit.set(card.suit, group);
  }
  for (const suitCards of bySuit.values()) {
    const unique = [...new Map(suitCards.map((card) => [card.rank, card] as const)).values()];
    unique.sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 2; j < unique.length; j++) {
        if (unique[j]!.rank - unique[i]!.rank === j - i) result.push(unique.slice(i, j + 1));
      }
    }
  }

  return result;
}

export type MeldResult = { melds: Card[][]; deadwood: Card[] };

/** Partition a hand into the melds that leave the least deadwood (by pip value). */
export function bestMelds(cards: Card[]): MeldResult {
  const candidates = atomicMelds(cards);
  let best: Card[][] = [];
  let bestDeadwood = Infinity;
  let bestMelded = -Infinity;

  const used = new Set<string>();
  const current: Card[][] = [];

  const evaluate = () => {
    const melded = new Set<string>();
    let meldedPoints = 0;
    for (const meld of current)
      for (const card of meld) {
        melded.add(card.id);
        meldedPoints += cardPoints(card);
      }
    const deadwood = cards.filter((card) => !melded.has(card.id)).reduce((sum, card) => sum + cardPoints(card), 0);
    return { deadwood, meldedPoints };
  };

  const search = (start: number) => {
    const { deadwood, meldedPoints } = evaluate();
    if (deadwood < bestDeadwood || (deadwood === bestDeadwood && meldedPoints > bestMelded)) {
      bestDeadwood = deadwood;
      bestMelded = meldedPoints;
      best = current.map((meld) => [...meld]);
    }
    for (let i = start; i < candidates.length; i++) {
      const meld = candidates[i]!;
      if (meld.some((card) => used.has(card.id))) continue;
      for (const card of meld) used.add(card.id);
      current.push(meld);
      search(i + 1);
      current.pop();
      for (const card of meld) used.delete(card.id);
    }
  };
  search(0);

  const meldedIds = new Set(best.flat().map((card) => card.id));
  const deadwood = cards.filter((card) => !meldedIds.has(card.id));
  return { melds: best, deadwood };
}

export const deadwoodPoints = (cards: Card[]) =>
  bestMelds(cards).deadwood.reduce((sum, card) => sum + cardPoints(card), 0);

export const isGin = (cards: Card[]) => deadwoodPoints(cards) === 0;

/** After setting `discard` aside, may the hand knock? */
export const canKnock = (hand: Card[], discard: Card) =>
  deadwoodPoints(hand.filter((card) => card.id !== discard.id)) <= KNOCK_LIMIT;

/** Lay a defender's cards onto the knocker's melds; returns what was laid off and what remains. */
export function layOffResult(
  hand: Card[],
  melds: Card[][],
): { laidOff: Card[]; remaining: Card[] } {
  const remaining = [...hand];
  const laidOff: Card[] = [];

  for (const meld of melds) {
    const growing = [...meld];
    if (isRun(growing)) {
      let changed = true;
      while (changed) {
        changed = false;
        const suit = growing[0]!.suit;
        const low = Math.min(...growing.map((card) => card.rank));
        const high = Math.max(...growing.map((card) => card.rank));
        for (let i = remaining.length - 1; i >= 0; i--) {
          const card = remaining[i]!;
          if (card.suit === suit && (card.rank === low - 1 || card.rank === high + 1)) {
            laidOff.push(card);
            growing.push(card);
            remaining.splice(i, 1);
            changed = true;
          }
        }
      }
    } else {
      const rank = growing[0]!.rank;
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (remaining[i]!.rank === rank) {
          laidOff.push(remaining[i]!);
          remaining.splice(i, 1);
        }
      }
    }
  }

  return { laidOff, remaining };
}

/* ------------------------------- Charlotte AI ------------------------------ */

/** Discard the card whose removal leaves the least deadwood, preferring high deadwood. */
export function chooseDiscard(hand: Card[]): Card {
  let best = hand[0]!;
  let bestDeadwood = Infinity;
  let bestPoints = -Infinity;
  for (const card of hand) {
    const rest = hand.filter((other) => other.id !== card.id);
    const deadwood = deadwoodPoints(rest);
    const points = cardPoints(card);
    if (deadwood < bestDeadwood || (deadwood === bestDeadwood && points > bestPoints)) {
      bestDeadwood = deadwood;
      bestPoints = points;
      best = card;
    }
  }
  return best;
}

/** Take the top discard only when it actually lowers the deadwood. */
export function shouldTakeDiscard(hand: Card[], top: Card | null): boolean {
  if (!top) return false;
  return deadwoodPoints([...hand, top]) < deadwoodPoints(hand);
}

/** The card to lay aside for a knock, if one leaves the hand knocks-worthy (else null). */
export function chooseKnockCard(hand: Card[]): Card | null {
  let best: Card | null = null;
  let bestDeadwood = Infinity;
  for (const card of hand) {
    const rest = hand.filter((other) => other.id !== card.id);
    const deadwood = deadwoodPoints(rest);
    if (deadwood <= KNOCK_LIMIT && deadwood < bestDeadwood) {
      bestDeadwood = deadwood;
      best = card;
    }
  }
  return best;
}

