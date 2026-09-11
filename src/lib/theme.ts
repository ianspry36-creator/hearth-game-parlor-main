export type ThemeId =
  | "plum"
  | "forest"
  | "midnight"
  | "wine"
  | "teal"
  | "amber"
  | "berry"
  | "slate";

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
    id: "teal",
    label: "Teal & Aqua",
    swatch: { brand: "oklch(0.235 0.05 200)", accent: "oklch(0.72 0.13 190)" },
  },
  {
    id: "amber",
    label: "Amber & Copper",
    swatch: { brand: "oklch(0.235 0.05 70)", accent: "oklch(0.72 0.14 60)" },
  },
  {
    id: "berry",
    label: "Berry & Magenta",
    swatch: { brand: "oklch(0.235 0.055 340)", accent: "oklch(0.72 0.15 320)" },
  },
  {
    id: "slate",
    label: "Slate & Pearl",
    swatch: { brand: "oklch(0.235 0.02 250)", accent: "oklch(0.72 0.04 210)" },
  },
];

const KEY = "parlor.theme";

export const DEFAULT_THEME: ThemeId = "plum";

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
  `document.documentElement.dataset.theme=["plum","forest","midnight","wine","teal","amber","berry","slate"].indexOf(t)>-1?t:"plum";}catch(e){}})();`;
