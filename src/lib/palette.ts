export type PaletteChannel = "brand" | "surface" | "muted";

/**
 * Custom background overrides. Each key maps a background channel to a hex
 * colour chosen from the native colour picker. When a channel is absent, the
 * active theme's colour is used instead.
 */
export type CustomPalette = Partial<Record<PaletteChannel, string>>;

export const PALETTE_CHANNELS: {
  id: PaletteChannel;
  label: string;
  hint: string;
  cssVar: string;
}[] = [
  { id: "brand", label: "Background", hint: "The main page backdrop", cssVar: "--brand" },
  { id: "surface", label: "Surface", hint: "Panels, cards and dialogs", cssVar: "--surface" },
  { id: "muted", label: "Muted", hint: "Subtle, dimmed areas", cssVar: "--muted" },
];

/** Approximate hex values for the default "Plum" theme, used to seed the colour
 *  pickers before the user has chosen a custom colour. */
const FALLBACK_HEX: Record<PaletteChannel, string> = {
  brand: "#331f3f",
  surface: "#432a52",
  muted: "#4e315f",
};

/** Hex to show in a colour input, falling back to the default theme's tint. */
export function channelHex(palette: CustomPalette, channel: PaletteChannel): string {
  return palette[channel] ?? FALLBACK_HEX[channel];
}

const KEY = "parlor.palette";

const CHANNEL_VARS: Record<PaletteChannel, string> = {
  brand: "--brand",
  surface: "--surface",
  muted: "--muted",
};

export function readPalette(): CustomPalette {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const result: CustomPalette = {};
    for (const { id } of PALETTE_CHANNELS) {
      const value = parsed[id];
      if (typeof value === "string" && value.trim()) result[id] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function writePalette(palette: CustomPalette) {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(palette).length === 0) {
      window.localStorage.removeItem(KEY);
    } else {
      window.localStorage.setItem(KEY, JSON.stringify(palette));
    }
  } catch {
    // Ignore storage failures (private browsing, etc.).
  }
  applyPalette(palette);
}

/**
 * Apply custom background colours as inline CSS variables on the document root.
 * Inline styles outrank the `:root[data-theme="…"]` rules in styles.css, so a
 * chosen colour wins over the theme; removing a channel reverts it to the theme.
 */
export function applyPalette(palette: CustomPalette) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  (Object.entries(CHANNEL_VARS) as [PaletteChannel, string][]).forEach(([channel, variable]) => {
    const value = palette[channel];
    if (value) root.style.setProperty(variable, value);
    else root.style.removeProperty(variable);
  });
}

/**
 * Inline script that restores saved custom colours before first paint, avoiding
 * a flash of the theme's default palette on the very first render.
 */
export const PALETTE_INIT_SCRIPT =
  `(function(){try{var p=localStorage.getItem("parlor.palette");if(p){var o=JSON.parse(p);` +
  `var m={brand:"--brand",surface:"--surface",muted:"--muted"};` +
  `for(var k in m){if(typeof o[k]==="string"&&o[k])document.documentElement.style.setProperty(m[k],o[k]);}` +
  `}}catch(_){}})();`;
