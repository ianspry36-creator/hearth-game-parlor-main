export type EffectId = "none" | "wooden" | "metallic" | "space" | "check";

export type EffectOption = {
  id: EffectId;
  label: string;
};

export const EFFECT_OPTIONS: EffectOption[] = [
  { id: "none", label: "None" },
  { id: "wooden", label: "Wooden" },
  { id: "metallic", label: "Metallic" },
  { id: "space", label: "Space" },
  { id: "check", label: "Check" },
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
  `document.documentElement.dataset.effect=["none","wooden","metallic","space","check"].indexOf(e)>-1?e:"none";}catch(_){}})();`;
