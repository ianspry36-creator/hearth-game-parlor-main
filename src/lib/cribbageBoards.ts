import crib1 from "@/assets/crib-boards/crib1.png";
import crib2 from "@/assets/crib-boards/crib2.png";
import crib3 from "@/assets/crib-boards/crib3.png";

/** A selectable peg-board graphic for the cribbage table. */
export type CribBoardOption = {
  id: string;
  label: string;
  src: string;
};

/** The peg-board graphics the player can choose from. */
export const CRIB_BOARD_OPTIONS: CribBoardOption[] = [
  { id: "crib-1", label: "Crib 1", src: crib1 },
  { id: "crib-2", label: "Crib 2", src: crib2 },
  { id: "crib-3", label: "Crib 3", src: crib3 },
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
