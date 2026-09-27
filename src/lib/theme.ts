export type ThemeId =
  | "plum"
  | "forest"
  | "midnight"
  | "wine"
  | "amber"
  | "lilac"
  | "violet"
  | "navy"
  | "blush"
  | "seafoam"
  | "butter"
  | "peach"
  | "sky"
  | "leaf"
  | "wisteria"
  | "sand";

export type ThemeOption = {
  id: ThemeId;
  label: string;
  /** Preview colours used in the settings dialog swatch (oklch, mirrors styles.css). */
  swatch: { brand: string; accent: string };
};

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "plum",
    label: "Plum & Coral",
    swatch: { brand: "oklch(0.235 0.055 300)", accent: "oklch(0.72 0.168 22)" },
  },
  {
    id: "forest",
    label: "Forest & Emerald",
    swatch: { brand: "oklch(0.235 0.05 160)", accent: "oklch(0.72 0.15 145)" },
  },
  {
    id: "midnight",
    label: "Midnight & Sapphire",
    swatch: { brand: "oklch(0.235 0.055 265)", accent: "oklch(0.72 0.14 230)" },
  },
  {
    id: "wine",
    label: "Wine & Rose",
    swatch: { brand: "oklch(0.235 0.06 15)", accent: "oklch(0.72 0.16 10)" },
  },
  {
    id: "amber",
    label: "Amber & Copper",
    swatch: { brand: "oklch(0.235 0.05 70)", accent: "oklch(0.72 0.14 60)" },
  },
  {
    id: "lilac",
    label: "Lilac & Lavender",
    swatch: { brand: "oklch(0.235 0.055 285)", accent: "oklch(0.72 0.13 300)" },
  },
  {
    id: "violet",
    label: "Violet & Citron",
    swatch: { brand: "oklch(0.235 0.06 295)", accent: "oklch(0.72 0.17 105)" },
  },
  {
    id: "navy",
    label: "Navy & Apricot",
    swatch: { brand: "oklch(0.235 0.055 245)", accent: "oklch(0.72 0.15 60)" },
  },
  {
    id: "blush",
    label: "Blush & Rose",
    swatch: { brand: "oklch(0.93 0.035 15)", accent: "oklch(0.58 0.16 20)" },
  },
  {
    id: "seafoam",
    label: "Seafoam & Mint",
    swatch: { brand: "oklch(0.93 0.04 185)", accent: "oklch(0.55 0.13 185)" },
  },
  {
    id: "butter",
    label: "Butter & Honey",
    swatch: { brand: "oklch(0.93 0.035 85)", accent: "oklch(0.58 0.16 80)" },
  },
  {
    id: "peach",
    label: "Peach & Melon",
    swatch: { brand: "oklch(0.93 0.035 50)", accent: "oklch(0.58 0.16 40)" },
  },
  {
    id: "sky",
    label: "Sky & Periwinkle",
    swatch: { brand: "oklch(0.93 0.035 245)", accent: "oklch(0.58 0.16 235)" },
  },
  {
    id: "leaf",
    label: "Leaf & Jade",
    swatch: { brand: "oklch(0.93 0.035 145)", accent: "oklch(0.58 0.16 135)" },
  },
  {
    id: "wisteria",
    label: "Wisteria & Orchid",
    swatch: { brand: "oklch(0.93 0.035 300)", accent: "oklch(0.58 0.16 295)" },
  },
  {
    id: "sand",
    label: "Sand & Clay",
    swatch: { brand: "oklch(0.93 0.035 70)", accent: "oklch(0.58 0.16 60)" },
  },
];

const KEY = "parlor.theme";

export const DEFAULT_THEME: ThemeId = "peach";

function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_OPTIONS.some((option) => option.id === value);
}

export function readTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function writeTheme(id: ThemeId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Ignore storage failures (private browsing, etc.).
  }
  applyTheme(id);
}

/** Apply a theme to the document so every route reflects it immediately. */
export function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset["theme"] = id;
}

/**
 * Inline script that restores the saved theme before first paint, avoiding a
 * flash of the default palette on the very first render.
 */
export const THEME_INIT_SCRIPT =
  `(function(){try{var t=localStorage.getItem("parlor.theme");` +
  `document.documentElement.dataset.theme=["plum","forest","midnight","wine","amber","lilac","violet","navy","blush","seafoam","butter","peach","sky","leaf","wisteria","sand"].indexOf(t)>-1?t:"peach";}catch(e){}})();`;
