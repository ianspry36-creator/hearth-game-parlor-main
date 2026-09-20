export type CardFrontId = string;
export type CardBackId = string;

export type CardFrontDesign = "classic" | "flourish" | "geometric" | "royal";

export type CardFrontOption = {
  id: CardFrontId;
  label: string;
  /** Colours used to render a built-in card-face preview swatch. */
  face?: { background: string; ink: string; red: string; border: string };
  /** Which built-in artwork layout to render (ignored when `image` is set). */
  design?: CardFrontDesign;
  /** Data-URL image for a custom (uploaded) card face. */
  image?: string;
};

export type CardBackOption = {
  id: CardBackId;
  label: string;
  /** CSS filter applied to the shared card-back artwork for built-in previews. */
  filter?: string;
  /** Data-URL image for a custom (uploaded) card back. */
  image?: string;
};

export const CARD_FRONT_OPTIONS: CardFrontOption[] = [
  {
    id: "classic",
    label: "Classic",
    face: {
      background: "#ffffff",
      ink: "#1c1b22",
      red: "#c0392b",
      border: "rgba(0,0,0,0.15)",
    },
  },
  {
    id: "ivory",
    label: "Ivory",
    face: {
      background: "#f3e8cf",
      ink: "#4a3b28",
      red: "#9c3d2b",
      border: "rgba(74,59,40,0.25)",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    face: {
      background: "#1a2340",
      ink: "#e6d9a8",
      red: "#d98a6a",
      border: "rgba(230,217,168,0.35)",
    },
  },
  {
    id: "flourish",
    label: "Flourish",
    design: "flourish",
    face: {
      background: "#fdf6e3",
      ink: "#3c2a1e",
      red: "#b03052",
      border: "rgba(60,42,30,0.25)",
    },
  },
  {
    id: "geometric",
    label: "Geometric",
    design: "geometric",
    face: {
      background: "#eef2f5",
      ink: "#22303c",
      red: "#d1495b",
      border: "rgba(34,48,60,0.2)",
    },
  },
  {
    id: "royal",
    label: "Royal",
    design: "royal",
    face: {
      background: "#f8f0e3",
      ink: "#33204b",
      red: "#c1121f",
      border: "rgba(51,32,75,0.3)",
    },
  },
];

export const CARD_BACK_OPTIONS: CardBackOption[] = [
  { id: "classic", label: "Classic", filter: "none" },
  { id: "cobalt", label: "Cobalt", filter: "hue-rotate(200deg) saturate(1.35) brightness(0.95)" },
  { id: "scarab", label: "Scarab", filter: "sepia(0.55) hue-rotate(55deg) saturate(1.4) brightness(0.92)" },
];

/**
 * Card designs committed to the repository as static assets. Dropping a PNG into
 * `src/assets/card-backs/` (or `card-fronts/`) makes it a permanent, built-in option
 * for every player once the site is rebuilt — no code change required.
 */
const PERMANENT_BACK_ASSETS = import.meta.glob("../assets/card-backs/*.png", {
  eager: true,
  as: "url",
}) as Record<string, string>;

const PERMANENT_FRONT_ASSETS = import.meta.glob("../assets/card-fronts/*.png", {
  eager: true,
  as: "url",
}) as Record<string, string>;

function assetOptions(assets: Record<string, string>): CardBackOption[] {
  return Object.entries(assets)
    .map(([path, url]) => {
      const file = path.split("/").pop() ?? path;
      const stem = file.replace(/\.png$/i, "");
      const label = stem
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      return { id: `asset-${stem}`, label, image: url };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

const FRONT_KEY = "parlor.cardFront";
const BACK_KEY = "parlor.cardBack";
const CUSTOM_FRONT_KEY = "parlor.customCardFronts";
const CUSTOM_BACK_KEY = "parlor.customCardBacks";

export const DEFAULT_CARD_FRONT: CardFrontId = "classic";
export const DEFAULT_CARD_BACK: CardBackId = "classic";

/** A user-uploaded custom card design stored as a data URL. */
export type CustomCard = {
  id: string;
  label: string;
  dataUrl: string;
};

function readCustomList(key: string): CustomCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CustomCard => {
      if (typeof item !== "object" || item === null) return false;
      const record = item as Record<string, unknown>;
      return (
        typeof record.id === "string" &&
        typeof record.label === "string" &&
        typeof record.dataUrl === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeCustomList(key: string, items: CustomCard[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Ignore storage failures (private browsing, etc.).
  }
}

export function readCustomFronts(): CustomCard[] {
  return readCustomList(CUSTOM_FRONT_KEY);
}

export function writeCustomFronts(items: CustomCard[]) {
  writeCustomList(CUSTOM_FRONT_KEY, items);
}

export function readCustomBacks(): CustomCard[] {
  return readCustomList(CUSTOM_BACK_KEY);
}

export function writeCustomBacks(items: CustomCard[]) {
  writeCustomList(CUSTOM_BACK_KEY, items);
}

/** The four suits of a standard 52-card deck, in suit order. */
export const CARD_SUITS = [
  { id: "spades", label: "Spades", symbol: "♠" },
  { id: "clubs", label: "Clubs", symbol: "♣" },
  { id: "diamonds", label: "Diamonds", symbol: "♦" },
  { id: "hearts", label: "Hearts", symbol: "♥" },
] as const;

/** The thirteen card ranks, in order, for a full custom card-front deck. */
export const CARD_RANKS = [
  { id: "ace", label: "Ace", short: "A" },
  { id: "2", label: "2", short: "2" },
  { id: "3", label: "3", short: "3" },
  { id: "4", label: "4", short: "4" },
  { id: "5", label: "5", short: "5" },
  { id: "6", label: "6", short: "6" },
  { id: "7", label: "7", short: "7" },
  { id: "8", label: "8", short: "8" },
  { id: "9", label: "9", short: "9" },
  { id: "10", label: "10", short: "10" },
  { id: "jack", label: "Jack", short: "J" },
  { id: "queen", label: "Queen", short: "Q" },
  { id: "king", label: "King", short: "K" },
] as const;

export type CardRankId = (typeof CARD_RANKS)[number]["id"];
export type CardSuitId = (typeof CARD_SUITS)[number]["id"];

/** A single card in the deck, keyed as `<rank>-<suit>` (e.g. "ace-spades"). */
export type CardId = `${CardRankId}-${CardSuitId}`;

/** All 52 cards, ordered suit by suit (Spades → Clubs → Diamonds → Hearts). */
export const CARD_DECK = CARD_SUITS.flatMap((suit) =>
  CARD_RANKS.map((rank) => ({
    id: `${rank.id}-${suit.id}` as CardId,
    rankId: rank.id,
    suitId: suit.id,
    label: `${rank.label} of ${suit.label}`,
    short: `${rank.short}${suit.symbol}`,
  })),
);

/** A full custom deck: one uploaded card face per card, keyed by card id. */
export type CustomDeck = Partial<Record<CardId, string>>;

const CUSTOM_DECK_KEY = "parlor.customDeck";

export function readCustomDeck(): CustomDeck {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CUSTOM_DECK_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const deck: CustomDeck = {};
    for (const card of CARD_DECK) {
      const value = (parsed as Record<string, unknown>)[card.id];
      if (typeof value === "string") deck[card.id] = value;
    }
    return deck;
  } catch {
    return {};
  }
}

export function writeCustomDeck(deck: CustomDeck) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_DECK_KEY, JSON.stringify(deck));
  } catch {
    // Ignore storage failures (private browsing, etc.).
  }
}

/** Built-in fronts followed by any committed assets and custom uploads, for the Cards tab. */
export function allCardFronts(custom: CustomCard[] = readCustomFronts()): CardFrontOption[] {
  return [
    ...CARD_FRONT_OPTIONS,
    ...assetOptions(PERMANENT_FRONT_ASSETS),
    ...custom.map(({ id, label, dataUrl }) => ({ id, label, image: dataUrl })),
  ];
}

/** Built-in backs followed by any committed assets and custom uploads, for the Cards tab. */
export function allCardBacks(custom: CustomCard[] = readCustomBacks()): CardBackOption[] {
  return [
    ...CARD_BACK_OPTIONS,
    ...assetOptions(PERMANENT_BACK_ASSETS),
    ...custom.map(({ id, label, dataUrl }) => ({ id, label, image: dataUrl })),
  ];
}

export function readCardFront(): CardFrontId {
  if (typeof window === "undefined") return DEFAULT_CARD_FRONT;
  try {
    const stored = window.localStorage.getItem(FRONT_KEY);
    return stored && allCardFronts().some((option) => option.id === stored)
      ? stored
      : DEFAULT_CARD_FRONT;
  } catch {
    return DEFAULT_CARD_FRONT;
  }
}

export function writeCardFront(id: CardFrontId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FRONT_KEY, id);
  } catch {
    // Ignore storage failures (private browsing, etc.).
  }
}

export function readCardBack(): CardBackId {
  if (typeof window === "undefined") return DEFAULT_CARD_BACK;
  try {
    const stored = window.localStorage.getItem(BACK_KEY);
    return stored && allCardBacks().some((option) => option.id === stored)
      ? stored
      : DEFAULT_CARD_BACK;
  } catch {
    return DEFAULT_CARD_BACK;
  }
}

export function writeCardBack(id: CardBackId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BACK_KEY, id);
  } catch {
    // Ignore storage failures (private browsing, etc.).
  }
}
