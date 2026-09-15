import { freshDeck, RANK_LABEL, type Card } from "./cribbage";

export const CLOCK_SLOTS = 13;

export type ClockPile = {
  faceDown: Card[]; // dealt face down; the last card is on top and flips next
  faceUp: Card[]; // laid and turned cards; the last card is the current (top) card.
};

/**
 * One of the four centre positions. It holds a face-down card until the player
 * turns it over, or a face-up King once the clock has struck; `null` is an
 * empty position left by a card already laid at its own hour.
 */
export type CenterSlot = { card: Card; faceUp: boolean } | null;

/**
 * Clock Solitaire is dealt in one pass around a clock face: thirteen piles of
 * four cards, twelve set at the hours and the thirteenth — the Kings — in the
 * centre. You turn a card of the centre pile first (your choice of the four
 * there) and lay it face up at the bottom of the pile of its own number, then
 * turn that pile's top card face up, and so on round the clock. The hand is
 * won if every card is laid before the fourth King is turned, and lost the
 * moment the fourth King appears too soon.
 */
export type GameState = {
  piles: ClockPile[]; // slot 0 is Ace (1 o'clock) ... slot 12 is the Kings (centre)
  active: number; // the slot whose top face-up card is current (0..12), or -1 once the clock has struck
  activeCenter: number; // index of the centre position holding the current card, or -1 when none
  kings: number; // Kings revealed so far (0..4)
  revealed: number; // cards laid at their own hour so far (0..52)
  won: boolean;
  lost: boolean;
  lastRevealed: number | null; // the slot that just received a card
  center: CenterSlot[]; // the four centre positions, dealt face down in a fixed 2x2 layout
};

export function freshGame(random: () => number = Math.random): GameState {
  const deck = freshDeck(random);
  const piles: ClockPile[] = Array.from({ length: CLOCK_SLOTS }, () => ({
    faceDown: [],
    faceUp: [],
  }));
  const center: CenterSlot[] = [];
  for (let round = 0; round < 4; round += 1) {
    for (let slot = 0; slot < CLOCK_SLOTS; slot += 1) {
      const card = deck.shift()!;
      if (slot === 12) center.push({ card, faceUp: false });
      else piles[slot]!.faceDown.push(card);
    }
  }
  return {
    piles,
    center,
    active: 12, // the centre pile turns over first
    activeCenter: -1,
    kings: 0,
    revealed: 0,
    won: false,
    lost: false,
    lastRevealed: null,
  };
}

/**
 * Turn a face-down card of the active pile face up. On the hour piles the top
 * card is turned (or `index` selects one, 0 = bottom). At the centre, `index`
 * selects one of the four centre positions to turn over.
 */
export function reveal(state: GameState, index?: number): GameState {
  if (state.won || state.lost || state.active < 0) return state;

  // At the centre the player turns over a chosen card from the four positions.
  if (state.active === 12) {
    if (index === undefined) return state;
    const slot = state.center[index];
    if (!slot || slot.faceUp) return state;
    return {
      ...state,
      center: state.center.map((c, k) => (k === index ? { card: slot.card, faceUp: true } : c)),
      activeCenter: index,
    };
  }

  const pile = state.piles[state.active]!;
  if (pile.faceDown.length === 0) return state;
  const i = index ?? pile.faceDown.length - 1;
  if (i < 0 || i >= pile.faceDown.length) return state;
  const card = pile.faceDown[i]!;
  return {
    ...state,
    piles: state.piles.map((p, j) =>
      j === state.active
        ? {
            ...p,
            faceDown: p.faceDown.filter((_, k) => k !== i),
            faceUp: [...p.faceUp, card],
          }
        : p,
    ),
  };
}

/** Lay the current card at the bottom of its own hour, advancing the clock there. */
export function place(state: GameState): GameState {
  if (state.won || state.lost || state.active < 0) return state;
  const from = state.active;
  const fromCenter = from === 12;

  // Find the card awaiting its move: at the centre it is the card turned over
  // in the active position, otherwise the top face-up card of the active pile.
  let card: Card;
  if (fromCenter) {
    const slot = state.center[state.activeCenter];
    if (!slot || !slot.faceUp) return state;
    card = slot.card;
  } else {
    const pile = state.piles[from]!;
    const c = pile.faceUp[pile.faceUp.length - 1];
    if (!c) return state;
    card = c;
  }

  const target = card.rank - 1; // Ace -> 0 (1 o'clock) ... King -> 12 (centre)
  const isKing = card.rank === 13;
  const kings = isKing ? state.kings + 1 : state.kings;
  const revealed = state.revealed + 1;
  const allPlaced = revealed === CLOCK_SLOTS * 4;
  const won = allPlaced;
  const lost = kings === 4 && !allPlaced;

  const piles = fromCenter
    ? state.piles.map((p, i) =>
        i === target && !isKing ? { ...p, faceUp: [card, ...p.faceUp] } : p,
      )
    : state.piles.map((p, i) => {
        if (i === from && i === target) {
          // A card laid back onto its own pile: drop it from the top.
          return isKing
            ? { ...p, faceUp: p.faceUp.slice(0, -1) }
            : { ...p, faceUp: [card, ...p.faceUp.slice(0, -1)] };
        }
        if (i === from) return { ...p, faceUp: p.faceUp.slice(0, -1) };
        if (i === target && !isKing) return { ...p, faceUp: [card, ...p.faceUp] };
        return p;
      });

  let center = state.center;
  if (fromCenter) {
    if (isKing) {
      // A King turned at the centre stays face up in its own position.
      center = state.center.map((c, k) =>
        k === state.activeCenter ? { card, faceUp: true } : c,
      );
    } else {
      // A card laid at its own hour leaves an empty position behind.
      center = state.center.map((c, k) => (k === state.activeCenter ? null : c));
    }
  } else if (isKing) {
    // A King turned at an hour is struck and laid face up in the centre.
    center = strikeKing(state.center, card);
  }

  return {
    piles,
    center,
    active: won || lost ? -1 : target,
    activeCenter: -1,
    kings,
    revealed,
    won,
    lost,
    lastRevealed: target,
  };
}

/** Lay a struck King face up into the first empty centre position. */
function strikeKing(center: CenterSlot[], card: Card): CenterSlot[] {
  const empty = center.findIndex((c) => c === null);
  if (empty < 0) return center;
  return center.map((c, k) => (k === empty ? { card, faceUp: true } : c));
}

/** The card currently awaiting a move: the top face-up card of the active pile. */
export function currentCard(state: GameState): Card | null {
  if (state.won || state.lost || state.active < 0) return null;
  if (state.active === 12) {
    const slot = state.center[state.activeCenter];
    return slot && slot.faceUp ? slot.card : null;
  }
  const pile = state.piles[state.active];
  return pile ? (pile.faceUp[pile.faceUp.length - 1] ?? null) : null;
}

/** The hour label for a slot: Ace at one o'clock through King at the centre. */
export function slotLabel(slot: number): string {
  return RANK_LABEL[slot + 1] ?? "";
}
