import { freshDeck, RANK_LABEL, type Card } from "./cribbage";

export const CLOCK_SLOTS = 13;

export type ClockPile = {
  faceDown: Card[]; // dealt face down; the last card is on top and flips next
  faceUp: Card[]; // laid cards; the last card is the most recently placed
};

/**
 * Clock Solitaire is dealt in one pass around a clock face: thirteen piles of
 * four cards, twelve set at the hours and the thirteenth — the Kings — in the
 * centre. You turn the centre card first and lay it face up beneath the pile
 * of its own number, then turn that pile's card, and so on round the clock.
 * The hand is won if every card is laid before the fourth King is turned, and
 * lost the moment the fourth King appears too soon.
 */
export type GameState = {
  piles: ClockPile[]; // slot 0 is Ace (1 o'clock) ... slot 12 is the Kings (centre)
  active: number; // the slot we turn over next (0..12), or -1 once the clock has struck
  kings: number; // Kings revealed so far (0..4)
  revealed: number; // cards laid at their own hour so far (0..52)
  won: boolean;
  lost: boolean;
  lastRevealed: number | null; // the slot that just received a card
};

export function freshGame(random: () => number = Math.random): GameState {
  const deck = freshDeck(random);
  const piles: ClockPile[] = Array.from({ length: CLOCK_SLOTS }, () => ({ faceDown: [], faceUp: [] }));
  for (let round = 0; round < 4; round += 1) {
    for (let slot = 0; slot < CLOCK_SLOTS; slot += 1) {
      piles[slot]!.faceDown.push(deck.shift()!);
    }
  }
  return {
    piles,
    active: 12, // the centre pile turns over first
    kings: 0,
    revealed: 0,
    won: false,
    lost: false,
    lastRevealed: null,
  };
}

/** Turn over the top card of the active pile and lay it at its own hour. */
export function flip(state: GameState): GameState {
  if (state.won || state.lost || state.active < 0) return state;
  const pile = state.piles[state.active]!;
  const card = pile.faceDown[pile.faceDown.length - 1]!;
  const target = card.rank - 1; // Ace -> 0 (1 o'clock) ... King -> 12 (centre)
  const kings = card.rank === 13 ? state.kings + 1 : state.kings;
  const revealed = state.revealed + 1;
  const allPlaced = revealed === CLOCK_SLOTS * 4;
  const won = allPlaced;
  const lost = kings === 4 && !allPlaced;
  return {
    piles: state.piles.map((p, i) => {
      if (i === state.active) return { ...p, faceDown: p.faceDown.slice(0, -1) };
      if (i === target) return { ...p, faceUp: [...p.faceUp, card] };
      return p;
    }),
    active: won || lost ? -1 : target,
    kings,
    revealed,
    won,
    lost,
    lastRevealed: target,
  };
}

/** The hour label for a slot: Ace at one o'clock through King at the centre. */
export function slotLabel(slot: number): string {
  return RANK_LABEL[slot + 1] ?? "";
}
