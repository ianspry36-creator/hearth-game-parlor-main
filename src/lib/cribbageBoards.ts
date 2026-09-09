import board1 from "@/assets/crib-boards/board1.png";
import board2 from "@/assets/crib-boards/board2.png";
import board3 from "@/assets/crib-boards/board3.png";
import board4 from "@/assets/crib-boards/board4.png";
import board5 from "@/assets/crib-boards/board5.png";
import board6 from "@/assets/crib-boards/board6.png";

/** A selectable peg-board graphic for the cribbage table. */
export type CribBoardOption = {
  id: string;
  label: string;
  src: string;
};

/** The peg-board graphics the player can choose from. */
export const CRIB_BOARD_OPTIONS: CribBoardOption[] = [
  { id: "board-1", label: "Board 1", src: board1 },
  { id: "board-2", label: "Board 2", src: board2 },
  { id: "board-3", label: "Board 3", src: board3 },
  { id: "board-4", label: "Board 4", src: board4 },
  { id: "board-5", label: "Board 5", src: board5 },
  { id: "board-6", label: "Board 6", src: board6 },
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
