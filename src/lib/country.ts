export type CountryId = "none" | "uk" | "usa";

export type CountryOption = {
  id: CountryId;
  label: string;
};

export const COUNTRY_OPTIONS: CountryOption[] = [
  { id: "none", label: "None" },
  { id: "uk", label: "UK" },
  { id: "usa", label: "USA" },
];

const KEY = "parlor.country";

export const DEFAULT_COUNTRY: CountryId = "none";

function isCountryId(value: string | null | undefined): value is CountryId {
  return COUNTRY_OPTIONS.some((option) => option.id === value);
}

export function readCountry(): CountryId {
  if (typeof window === "undefined") return DEFAULT_COUNTRY;
  try {
    const stored = window.localStorage.getItem(KEY);
    return isCountryId(stored) ? stored : DEFAULT_COUNTRY;
  } catch {
    return DEFAULT_COUNTRY;
  }
}

export function writeCountry(id: CountryId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Ignore storage failures (private browsing, etc.).
  }
  applyCountry(id);
}

/** Apply a country background to the document body via the data-country attribute. */
export function applyCountry(id: CountryId) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset["country"] = id;
}

/**
 * Inline script that restores the saved country before first paint, avoiding a
 * flash of the plain background on the very first render.
 */
export const COUNTRY_INIT_SCRIPT =
  `(function(){try{var c=localStorage.getItem("parlor.country");` +
  `document.documentElement.dataset.country=["none","uk","usa"].indexOf(c)>-1?c:"none";}catch(_){}})();`;
