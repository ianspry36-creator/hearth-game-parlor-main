import cribbageOriginal from "@/assets/crib-boards/cribbage-original.png";
import cribbageYelBlu from "@/assets/crib-boards/cribbage_yel_blu.png";

/** A selectable peg-board graphic for the cribbage table. */
export type CribBoardOption = {
  id: string;
  label: string;
  src: string;
};

/** The peg-board graphics the player can choose from. */
export const CRIB_BOARD_OPTIONS: CribBoardOption[] = [
  { id: "cribbage-original", label: "Original", src: cribbageOriginal },
  { id: "cribbage-yel-blu", label: "Yellow / Blue", src: cribbageYelBlu },
];

const KEY = "parlor.cribbage.board";

/** The currently chosen peg-board graphic (falls back to the first board). */
export function readCribBoardGraphic(): string {
  if (typeof window === "undefined") return CRIB_BOARD_OPTIONS[0]!.src;
  const stored = window.localStorage.getItem(KEY);
  const match = CRIB_BOARD_OPTIONS.find((option) => option.id === stored);
  return (match ?? CRIB_BOARD_OPTIONS[0]!).src;
}

export function writeCribBoardGraphic(id: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, id);
}
