import { type Card, type Suit } from "@/lib/cribbage";

export const STARTING_LIVES = 3;

const RANK_NAME = [
  "",
  "Ace",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Jack",
  "Queen",
  "King",
];

const SUIT_NAME: Record<Suit, string> = {
  S: "Spades",
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
};

/** "the Ace of Spades" — a readable name for the table talk. */
export const cardFullName = (card: Card): string =>
  `${RANK_NAME[card.rank]} of ${SUIT_NAME[card.suit]}`;

/** Charlotte swaps away anything she deems too weak to hold on to. */
export const cpuShouldSwap = (card: Card): boolean => card.rank <= 6;
