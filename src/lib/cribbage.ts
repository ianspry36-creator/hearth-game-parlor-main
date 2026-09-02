export type Suit = "S" | "H" | "D" | "C";

export type Card = {
  id: string;
  rank: number; // 1..13 (1 = Ace, 11 = Jack)
  suit: Suit;
};

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export const cardValue = (c: Card) => Math.min(c.rank, 10);
export const cardLabel = (c: Card) => `${RANK_LABEL[c.rank]}${SUIT_SYMBOL[c.suit]}`;

export function freshDeck(random: () => number = Math.random): Card[] {
  const deck: Card[] = [];
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: `${rank}${suit}`, rank, suit });
  }
  return shuffle(deck, random);
}

export function shuffle<T>(arr: T[], random: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const head = items[0]!;
  const rest = items.slice(1);
  return [...combinations(rest, size - 1).map((c) => [head, ...c]), ...combinations(rest, size)];
}

export type ScoreLine = { label: string; points: number };

/** Score a 4-card hand with the starter card. Cribs require a 5-card flush. */
export function scoreHand(hand: Card[], starter: Card | null, isCrib = false): ScoreLine[] {
  const lines: ScoreLine[] = [];
  const all = starter ? [...hand, starter] : [...hand];

  // Fifteens
  let fifteens = 0;
  for (let size = 2; size <= all.length; size++) {
    for (const combo of combinations(all, size)) {
      if (combo.reduce((s, c) => s + cardValue(c), 0) === 15) fifteens++;
    }
  }
  if (fifteens) lines.push({ label: `Fifteens (${fifteens})`, points: fifteens * 2 });

  // Pairs
  let pairs = 0;
  for (const combo of combinations(all, 2)) if (combo[0]!.rank === combo[1]!.rank) pairs++;
  if (pairs) lines.push({ label: `Pairs (${pairs})`, points: pairs * 2 });

  // Runs
  const byRank = new Map<number, number>();
  for (const c of all) byRank.set(c.rank, (byRank.get(c.rank) ?? 0) + 1);
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  let i = 0;
  while (i < ranks.length) {
    let j = i;
    while (j + 1 < ranks.length && ranks[j + 1] === ranks[j]! + 1) j++;
    const length = j - i + 1;
    if (length >= 3) {
      let multiplier = 1;
      for (let k = i; k <= j; k++) multiplier *= byRank.get(ranks[k]!)!;
      lines.push({
        label: `Run${multiplier > 1 ? `s (${multiplier}×${length})` : ` of ${length}`}`,
        points: length * multiplier,
      });
    }
    i = j + 1;
  }

  // Flush
  if (hand.length === 4 && hand.every((c) => c.suit === hand[0]!.suit)) {
    if (starter && starter.suit === hand[0]!.suit) lines.push({ label: "Flush (5)", points: 5 });
    else if (!isCrib) lines.push({ label: "Flush (4)", points: 4 });
  }

  // His nobs
  if (starter && hand.some((c) => c.rank === 11 && c.suit === starter.suit)) {
    lines.push({ label: "His nobs", points: 1 });
  }

  return lines;
}

export const totalPoints = (lines: ScoreLine[]) => lines.reduce((s, l) => s + l.points, 0);

/** Score for laying `card` onto the current pegging pile. */
export function scorePegging(pile: Card[], card: Card): ScoreLine[] {
  const seq = [...pile, card];
  const count = seq.reduce((s, c) => s + cardValue(c), 0);
  const lines: ScoreLine[] = [];

  if (count === 15) lines.push({ label: "Fifteen", points: 2 });
  if (count === 31) lines.push({ label: "Thirty-one", points: 2 });

  // Pairs / trips / quads at the tail
  let same = 1;
  for (let i = seq.length - 2; i >= 0 && seq[i]!.rank === card.rank; i--) same++;
  if (same === 2) lines.push({ label: "Pair", points: 2 });
  if (same === 3) lines.push({ label: "Three of a kind", points: 6 });
  if (same >= 4) lines.push({ label: "Four of a kind", points: 12 });

  // Runs at the tail
  for (let length = seq.length; length >= 3; length--) {
    const tail = seq.slice(seq.length - length);
    const ranks = tail.map((c) => c.rank).sort((a, b) => a - b);
    const consecutive = ranks.every((r, idx) => idx === 0 || r === ranks[idx - 1]! + 1);
    if (consecutive && new Set(ranks).size === ranks.length) {
      lines.push({ label: `Run of ${length}`, points: length });
      break;
    }
  }

  return lines;
}

export const peggingCount = (pile: Card[]) => pile.reduce((s, c) => s + cardValue(c), 0);
export const canPlay = (hand: Card[], pile: Card[]) =>
  hand.some((c) => peggingCount(pile) + cardValue(c) <= 31);

/** The computer keeps the best-scoring four cards and cribs the rest. */
export function chooseDiscards(hand: Card[]): Card[] {
  let best: { keep: Card[]; score: number } | null = null;
  for (const keep of combinations(hand, 4)) {
    const score = totalPoints(scoreHand(keep, null));
    if (!best || score > best.score) best = { keep, score };
  }
  const keepIds = new Set(best!.keep.map((c) => c.id));
  return hand.filter((c) => !keepIds.has(c.id));
}

/** The computer plays the highest-scoring legal card, else the lowest card. */
export function choosePeggingCard(hand: Card[], pile: Card[]): Card | null {
  const count = peggingCount(pile);
  const legal = hand.filter((c) => count + cardValue(c) <= 31);
  if (!legal.length) return null;
  let best = legal[0]!;
  let bestScore = -1;
  for (const c of legal) {
    const score = totalPoints(scorePegging(pile, c)) * 10 - cardValue(c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
