import { freshDeck, cardLabel, type Card, type Suit } from "@/lib/cribbage";

export type Seat = "you" | "ace" | "ada" | "leo";
export type PassDirection = "left" | "right" | "across" | "hold";
export type Phase = "passing" | "playing" | "dealing" | "over" | "ready";

export const SEATS: Seat[] = ["you", "ace", "ada", "leo"];

export const SEAT_NAMES: Record<Seat, string> = {
  you: "You",
  ace: "Ace",
  ada: "Ada",
  leo: "Leo",
};

export type LogEntry = { side: Seat | null; text: string };

export type PlayedCard = { seat: Seat; card: Card };

export type State = {
  phase: Phase;
  turn: Seat;
  order: Seat[];
  hands: Record<Seat, Card[]>;
  trick: PlayedCard[];
  tricks: Record<Seat, Card[][]>;
  points: Record<Seat, number>;
  handPoints: Record<Seat, number>;
  passDirection: PassDirection;
  handNumber: number;
  heartsBroken: boolean;
  winner: Seat | null;
  shooters: Seat[];
  passSelections: Record<Seat, string[] | null>;
  log: LogEntry[];
  dealId: number;
};

export const isHeart = (c: Card): boolean => c.suit === "H";
export const isQueenOfSpades = (c: Card): boolean => c.rank === 12 && c.suit === "S";

export function penaltyOf(card: Card): number {
  if (isQueenOfSpades(card)) return 13;
  if (isHeart(card)) return 1;
  return 0;
}

export function trickPenalty(trick: PlayedCard[]): number {
  return trick.reduce((sum, p) => sum + penaltyOf(p.card), 0);
}

export const PASS_DIRECTIONS: PassDirection[] = ["left", "right", "across", "hold"];

export const passDirectionForHand = (handNumber: number): PassDirection =>
  PASS_DIRECTIONS[(handNumber - 1) % PASS_DIRECTIONS.length]!;

export const PASS_LABEL: Record<PassDirection, string> = {
  left: "pass three cards to the left",
  right: "pass three cards to the right",
  across: "pass three cards across the table",
  hold: "hold — no cards are passed",
};

export function emptyPoints(): Record<Seat, number> {
  return { you: 0, ace: 0, ada: 0, leo: 0 };
}

const SUIT_ORDER: Record<Suit, number> = { C: 0, D: 1, S: 2, H: 3 };

function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || a.rank - b.rank);
}

let dealCounter = 0;

export function dealHand(random: () => number): { hands: Record<Seat, Card[]>; holder: Seat } {
  const deck = freshDeck(random);
  const hands: Record<Seat, Card[]> = { you: [], ace: [], ada: [], leo: [] };
  SEATS.forEach((seat, i) => {
    const cards = deck.slice(i * 13, i * 13 + 13);
    // Only the player's hand is sorted for readability. Computer hands stay in
    // dealt (shuffled) order so their chosen pass cards aren't clustered at the
    // tail of the fan.
    hands[seat] = seat === "you" ? sortHand(cards) : cards;
  });
  let holder: Seat = "you";
  for (const seat of SEATS) {
    if (hands[seat].some((c) => c.rank === 2 && c.suit === "C")) holder = seat;
  }
  return { hands, holder };
}

export function initGame(
  random: () => number,
  handNumber = 1,
  points: Record<Seat, number> = emptyPoints(),
): State {
  const direction = passDirectionForHand(handNumber);
  const { hands, holder } = dealHand(random);
  return {
    phase: direction === "hold" ? "playing" : "passing",
    turn: holder,
    order: SEATS,
    hands,
    trick: [],
    tricks: { you: [], ace: [], ada: [], leo: [] },
    points,
    handPoints: emptyPoints(),
    passDirection: direction,
    handNumber,
    heartsBroken: false,
    winner: null,
    shooters: [],
    passSelections: { you: null, ace: null, ada: null, leo: null },
    log: [
      {
        side: null,
        text:
          direction === "hold"
            ? "New hand dealt — hold, no cards to pass."
            : `New hand dealt — ${PASS_LABEL[direction]}. Choose three cards.`,
      },
    ],
    dealId: ++dealCounter,
  };
}

/** The pre-deal table: an empty board with the pack waiting in the middle. */
export function idleState(
  points: Record<Seat, number> = emptyPoints(),
  handNumber = 1,
): State {
  return {
    phase: "ready",
    turn: "you",
    order: SEATS,
    hands: { you: [], ace: [], ada: [], leo: [] },
    trick: [],
    tricks: { you: [], ace: [], ada: [], leo: [] },
    points,
    handPoints: emptyPoints(),
    passDirection: passDirectionForHand(handNumber),
    handNumber,
    heartsBroken: false,
    winner: null,
    shooters: [],
    passSelections: { you: null, ace: null, ada: null, leo: null },
    log: [],
    dealId: 0,
  };
}

export const nextSeat = (seat: Seat, order: Seat[]): Seat =>
  order[(order.indexOf(seat) + 1) % order.length]!;

const note = (log: LogEntry[], entry: LogEntry): LogEntry[] => [entry, ...log].slice(0, 40);

export function isFirstTrick(state: State): boolean {
  return Object.values(state.tricks).every((t) => t.length === 0);
}

export function legalPlays(state: State, seat: Seat): Card[] {
  const hand = state.hands[seat] ?? [];
  if (!hand.length) return [];
  const first = isFirstTrick(state);

  if (state.trick.length === 0) {
    if (first) {
      const two = hand.find((c) => c.rank === 2 && c.suit === "C");
      if (two) return [two];
    }
    if (!state.heartsBroken) {
      const nonHearts = hand.filter((c) => !isHeart(c));
      return nonHearts.length ? nonHearts : hand;
    }
    return hand;
  }

  const leadSuit = state.trick[0]!.card.suit;
  const inSuit = hand.filter((c) => c.suit === leadSuit);
  if (inSuit.length) {
    if (first) {
      const safe = inSuit.filter((c) => penaltyOf(c) === 0);
      return safe.length ? safe : inSuit;
    }
    return inSuit;
  }
  if (first) {
    const safe = hand.filter((c) => penaltyOf(c) === 0);
    return safe.length ? safe : hand;
  }
  return hand;
}

export function trickWinner(trick: PlayedCard[]): Seat {
  const leadSuit = trick[0]!.card.suit;
  let best = trick[0]!;
  for (const p of trick.slice(1)) {
    if (p.card.suit === leadSuit && p.card.rank > best.card.rank) best = p;
  }
  return best.seat;
}

function passTarget(order: Seat[], from: Seat, direction: PassDirection): Seat {
  const i = order.indexOf(from);
  const n = order.length;
  const shift = direction === "left" ? 1 : direction === "right" ? -1 : direction === "across" ? 2 : 0;
  return order[(i + shift + n) % n]!;
}

export function setPass(state: State, seat: Seat, cardIds: string[]): State {
  if (state.phase !== "passing") return state;
  const selections = { ...state.passSelections, [seat]: cardIds };
  const next = { ...state, passSelections: selections };
  if (!SEATS.every((s) => selections[s] !== null)) return next;
  return applyPass(next);
}

function applyPass(state: State): State {
  const hands = { ...state.hands };
  const receiving: Record<Seat, Card[]> = { you: [], ace: [], ada: [], leo: [] };
  for (const from of SEATS) {
    const target = passTarget(state.order, from, state.passDirection);
    const ids = new Set(state.passSelections[from] ?? []);
    const toPass = (state.hands[from] ?? []).filter((c) => ids.has(c.id));
    hands[from] = (state.hands[from] ?? []).filter((c) => !ids.has(c.id));
    receiving[target] = [...(receiving[target] ?? []), ...toPass];
  }
  for (const s of SEATS) {
    hands[s] = [...(hands[s] ?? []), ...(receiving[s] ?? [])];
  }
  hands.you = sortHand(hands.you ?? []);

  const holder =
    SEATS.find((s) => (hands[s] ?? []).some((c) => c.rank === 2 && c.suit === "C")) ?? "you";
  return {
    ...state,
    phase: "playing",
    hands,
    turn: holder,
    passSelections: { you: null, ace: null, ada: null, leo: null },
    log: note(state.log, { side: null, text: "Cards passed." }),
  };
}

export type PassTransfer = { from: Seat; to: Seat; card: Card };

function passTransfers(state: State): PassTransfer[] {
  const transfers: PassTransfer[] = [];
  for (const from of SEATS) {
    const to = passTarget(state.order, from, state.passDirection);
    const ids = new Set(state.passSelections[from] ?? []);
    for (const card of state.hands[from] ?? []) {
      if (ids.has(card.id)) transfers.push({ from, to, card });
    }
  }
  return transfers;
}

export function resolvePass(state: State): { next: State; transfers: PassTransfer[] } | null {
  if (state.phase !== "passing") return null;
  if (!SEATS.every((seat) => state.passSelections[seat] !== null)) return null;
  return { next: applyPass(state), transfers: passTransfers(state) };
}

export function play(state: State, seat: Seat, cardId: string): State {
  if (state.phase !== "playing" || state.turn !== seat) return state;
  const hand = state.hands[seat] ?? [];
  const card = hand.find((c) => c.id === cardId);
  if (!card) return state;
  if (!legalPlays(state, seat).some((c) => c.id === cardId)) return state;

  const hands = { ...state.hands, [seat]: hand.filter((c) => c.id !== cardId) };
  const trick = [...state.trick, { seat, card }];
  const next: State = {
    ...state,
    hands,
    trick,
    heartsBroken: state.heartsBroken || isHeart(card),
    log: note(state.log, { side: seat, text: `played ${cardLabel(card)}.` }),
  };

  if (trick.length === 4) return resolveTrick(next);
  return { ...next, turn: nextSeat(seat, state.order) };
}

function resolveTrick(state: State): State {
  const winner = trickWinner(state.trick);
  const cards = state.trick.map((p) => p.card);
  const tricks = { ...state.tricks, [winner]: [...(state.tricks[winner] ?? []), cards] };
  const pen = trickPenalty(state.trick);
  const handPoints = { ...state.handPoints, [winner]: (state.handPoints[winner] ?? 0) + pen };
  const done = Object.values(tricks).every((t) => t.length === 13);
  const next: State = {
    ...state,
    tricks,
    handPoints,
    trick: [],
    turn: winner,
    log: note(state.log, {
      side: winner,
      text: `${SEAT_NAMES[winner]} took the trick${pen ? ` (+${pen} point${pen === 1 ? "" : "s"})` : ""}.`,
    }),
  };
  if (!done) return next;
  return finishHand(next);
}

function finishHand(state: State): State {
  const hp = state.handPoints;
  const shooters = SEATS.filter((s) => (hp[s] ?? 0) === 26);
  const points = { ...state.points };
  if (shooters.length) {
    for (const s of SEATS) points[s] = (points[s] ?? 0) + (shooters.includes(s) ? 0 : 26);
  } else {
    for (const s of SEATS) points[s] = (points[s] ?? 0) + (hp[s] ?? 0);
  }
  const max = Math.max(...SEATS.map((s) => points[s] ?? 0));
  if (max >= 100) {
    const min = Math.min(...SEATS.map((s) => points[s] ?? 0));
    const leaders = SEATS.filter((s) => (points[s] ?? 0) === min);
    if (leaders.length === 1) {
      return {
        ...state,
        points,
        shooters,
        phase: "over",
        winner: leaders[0]!,
        log: note(state.log, {
          side: null,
          text: `${SEAT_NAMES[leaders[0]!]} wins with ${min} points!`,
        }),
      };
    }
  }
  const summary = shooters.length
    ? `${shooters.map((s) => SEAT_NAMES[s]).join(" and ")} shot the moon — everyone else +26.`
    : "Hand scored.";
  return {
    ...state,
    points,
    shooters,
    phase: "dealing",
    log: note(state.log, { side: null, text: `${summary} Dealing the next hand…` }),
  };
}

export function redeal(state: State, random: () => number): State {
  if (state.phase !== "dealing") return state;
  return initGame(random, state.handNumber + 1, state.points);
}

// === AI helpers ===

function danger(card: Card): number {
  if (isQueenOfSpades(card)) return 100;
  if (isHeart(card)) return 20 + card.rank;
  if (card.suit === "S") return 10 + card.rank;
  return card.rank;
}

export function choosePassCards(hand: Card[]): string[] {
  return [...hand]
    .sort((a, b) => danger(b) - danger(a))
    .slice(0, 3)
    .map((c) => c.id);
}

export function choosePlay(state: State, seat: Seat): string | null {
  const legal = legalPlays(state, seat);
  if (!legal.length) return null;

  if (state.trick.length === 0) {
    const nonHearts = legal.filter((c) => !isHeart(c) && !isQueenOfSpades(c));
    const pool = nonHearts.length ? nonHearts : legal;
    return [...pool].sort((a, b) => a.rank - b.rank)[0]!.id;
  }

  const leadSuit = state.trick[0]!.card.suit;
  const inSuit = legal.filter((c) => c.suit === leadSuit);
  if (inSuit.length) {
    const low = [...inSuit].sort((a, b) => a.rank - b.rank);
    const safe = low.filter((c) => trickWinner([...state.trick, { seat, card: c }]) !== seat);
    return (safe.length ? safe : low)[0]!.id;
  }

  const qs = legal.find((c) => isQueenOfSpades(c));
  if (qs) return qs.id;
  const hearts = legal.filter((c) => isHeart(c));
  if (hearts.length) return [...hearts].sort((a, b) => b.rank - a.rank)[0]!.id;
  return [...legal].sort((a, b) => b.rank - a.rank)[0]!.id;
}

// === Multiplayer remapping ===

export function remapState(state: State, shift: number): State {
  const order = SEATS;
  const map = (seat: Seat): Seat => order[((order.indexOf(seat) + shift) % 4 + 4) % 4]!;
  const hands: Record<Seat, Card[]> = { you: [], ace: [], ada: [], leo: [] };
  const tricks: Record<Seat, Card[][]> = { you: [], ace: [], ada: [], leo: [] };
  for (const seat of order) hands[map(seat)] = state.hands[seat] ?? [];
  for (const seat of order) tricks[map(seat)] = state.tricks[seat] ?? [];
  const points: Record<Seat, number> = { you: 0, ace: 0, ada: 0, leo: 0 };
  const handPoints: Record<Seat, number> = { you: 0, ace: 0, ada: 0, leo: 0 };
  const passSelections: Record<Seat, string[] | null> = { you: null, ace: null, ada: null, leo: null };
  for (const seat of order) points[map(seat)] = state.points[seat] ?? 0;
  for (const seat of order) handPoints[map(seat)] = state.handPoints[seat] ?? 0;
  for (const seat of order) passSelections[map(seat)] = state.passSelections[seat] ?? null;
  return {
    ...state,
    order: order.map((seat) => map(seat)),
    hands,
    tricks,
    points,
    handPoints,
    passSelections,
    turn: map(state.turn),
    winner: state.winner ? map(state.winner) : null,
    shooters: (state.shooters ?? []).map(map),
    log: (state.log ?? []).map((e) => ({ ...e, side: e.side ? map(e.side) : null })),
  };
}

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<Card>;
  return typeof c.id === "string" && typeof c.rank === "number" && typeof c.suit === "string";
}

export function isValidState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<State>;
  if (!Array.isArray(s.order) || s.order.length !== 4) return false;
  if (!s.hands || typeof s.hands !== "object") return false;
  if (!Array.isArray(s.trick) || !s.trick.every((p) => p && isCard((p as PlayedCard).card)))
    return false;
  if (!s.points || !s.handPoints || !s.tricks) return false;
  if (!SEATS.every((seat) => Array.isArray((s.hands as Record<Seat, Card[]>)[seat])))
    return false;
  return typeof s.phase === "string" && typeof s.turn === "string";
}


