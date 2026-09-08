/** The colour scheme applied to the board. */
export type TablePalette = {
  surface: string;
  border: string;
  pointLight: string;
  pointDark: string;
  bar: string;
  barText: string;
  divider: string;
  /** Fill colour of the opponent (dark) checkers. Defaults to a dark grey. */
  opponentPiece?: string;
  /** Border colour of the opponent (dark) checkers. Defaults to near-black. */
  opponentPieceBorder?: string;
};

export type TableOption = {
  id: string;
  label: string;
  palette: TablePalette | null;
};

/** The default wooden board (used for the "Classic" option). */
export const CLASSIC_PALETTE: TablePalette = {
  surface: "#f6f2e8",
  border: "#c49c6b",
  pointLight: "#c49c6b",
  pointDark: "#ad773b",
  bar: "#4d3c28",
  barText: "#e7d9c0",
  divider: "#2c2012",
};

/** The selectable backgammon board colour schemes. `palette: null` is the plain classic board. */
export const TABLE_OPTIONS: TableOption[] = [
  { id: "classic", label: "Classic", palette: null },
  {
    id: "table-1",
    label: "Amber",
    palette: {
      surface: "#f8efd8",
      border: "#d4a017",
      pointLight: "#d4a017",
      pointDark: "#a97410",
      bar: "#4a3406",
      barText: "#f0e2b8",
      divider: "#2a1d03",
    },
  },
  {
    id: "table-2",
    label: "Meadow",
    palette: {
      surface: "#f0f6e8",
      border: "#a9c46b",
      pointLight: "#a9c46b",
      pointDark: "#8ead3b",
      bar: "#424d28",
      barText: "#d8e7c0",
      divider: "#242c12",
    },
  },
  {
    id: "table-3",
    label: "Emerald",
    palette: {
      surface: "#e8f6eb",
      border: "#6bc470",
      pointLight: "#6bc470",
      pointDark: "#3bad3e",
      bar: "#284d2a",
      barText: "#c0e7c5",
      divider: "#122c13",
    },
  },
  {
    id: "table-4",
    label: "Teal",
    palette: {
      surface: "#e8f6f6",
      border: "#6bc4b2",
      pointLight: "#6bc4b2",
      pointDark: "#3bad93",
      bar: "#284d45",
      barText: "#c0e7e3",
      divider: "#122c27",
    },
  },
  {
    id: "table-5",
    label: "Sapphire",
    palette: {
      surface: "#e8ecf6",
      border: "#6b93c4",
      pointLight: "#6b93c4",
      pointDark: "#3b71ad",
      bar: "#28394d",
      barText: "#c0cee7",
      divider: "#121e2c",
      opponentPiece: "#dc2626",
      opponentPieceBorder: "#7f1d1d",
    },
  },
  {
    id: "table-6",
    label: "Violet",
    palette: {
      surface: "#eee8f6",
      border: "#866bc4",
      pointLight: "#866bc4",
      pointDark: "#5a3bad",
      bar: "#33284d",
      barText: "#cfc0e7",
      divider: "#1a122c",
      opponentPiece: "#dc2626",
      opponentPieceBorder: "#7f1d1d",
    },
  },
  {
    id: "table-7",
    label: "Orchid",
    palette: {
      surface: "#f6e8f3",
      border: "#c46bc0",
      pointLight: "#c46bc0",
      pointDark: "#ad3baa",
      bar: "#4d284b",
      barText: "#e7c0e2",
      divider: "#2c122b",
    },
  },
  {
    id: "table-8",
    label: "Crimson",
    palette: {
      surface: "#f6e8e8",
      border: "#c46b7d",
      pointLight: "#c46b7d",
      pointDark: "#ad3b55",
      bar: "#4d2830",
      barText: "#e7c0c4",
      divider: "#2c1217",
    },
  },
];

const KEY = "parlor.backgammon.table";

/** The currently chosen board colour scheme, or null for the classic board. */
export function readTableGraphic(): TablePalette | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(KEY);
  const match = TABLE_OPTIONS.find((option) => option.id === stored);
  return (match ?? TABLE_OPTIONS[0]!).palette;
}

export function writeTableGraphic(id: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, id);
}
