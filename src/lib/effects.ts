export type EffectId =
  | "none"
  | "wooden"
  | "metallic"
  | "space"
  | "check"
  | "cherry"
  | "batman"
  | "disney"
  | "inside-out"
  | "is-fine"
  | "jellyfish"
  | "minecraft"
  | "moon"
  | "shining"
  | "simpsons"
  | "star-trek"
  | "tea"
  | "toilet-paper"
  | "up"
  | "van-gogh";

export type EffectOption = {
  id: EffectId;
  label: string;
};

export const EFFECT_OPTIONS: EffectOption[] = [
  { id: "none", label: "None" },
  { id: "wooden", label: "Suits" },
  { id: "metallic", label: "Ace" },
  { id: "space", label: "Space" },
  { id: "check", label: "Check" },
  { id: "cherry", label: "Cherry" },
  { id: "batman", label: "Batman" },
  { id: "disney", label: "Disney" },
  { id: "inside-out", label: "Inside Out" },
  { id: "is-fine", label: "This Is Fine" },
  { id: "jellyfish", label: "Jellyfish" },
  { id: "minecraft", label: "Minecraft" },
  { id: "moon", label: "Moon" },
  { id: "shining", label: "Shining" },
  { id: "simpsons", label: "Simpsons" },
  { id: "star-trek", label: "Star Trek" },
  { id: "tea", label: "Tea" },
  { id: "toilet-paper", label: "Toilet Paper" },
  { id: "up", label: "Up" },
  { id: "van-gogh", label: "Van Gogh" },
];

const KEY = "parlor.effect";

export const DEFAULT_EFFECT: EffectId = "none";

function isEffectId(value: string | null | undefined): value is EffectId {
  return EFFECT_OPTIONS.some((option) => option.id === value);
}

export function readEffect(): EffectId {
  if (typeof window === "undefined") return DEFAULT_EFFECT;
  try {
    const stored = window.localStorage.getItem(KEY);
    return isEffectId(stored) ? stored : DEFAULT_EFFECT;
  } catch {
    return DEFAULT_EFFECT;
  }
}

export function writeEffect(id: EffectId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Ignore storage failures (private browsing, etc.).
  }
  applyEffect(id);
}

/** Apply a background effect to the document body via the data-effect attribute. */
export function applyEffect(id: EffectId) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset["effect"] = id;
}

/**
 * Inline script that restores the saved effect before first paint, avoiding a
 * flash of the plain background on the very first render.
 */
export const EFFECT_INIT_SCRIPT =
  `(function(){try{var e=localStorage.getItem("parlor.effect");` +
  `document.documentElement.dataset.effect=["none","wooden","metallic","space","check","cherry","batman","disney","inside-out","is-fine","jellyfish","minecraft","moon","shining","simpsons","star-trek","tea","toilet-paper","up","van-gogh"].indexOf(e)>-1?e:"none";}catch(_){}})();`;
