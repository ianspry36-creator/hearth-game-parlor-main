export type AvatarCategory = "people" | "animals" | "objects" | "aliens";

export type AvatarOption = {
  id: string;
  url: string;
  label: string;
  category: AvatarCategory;
  scale?: number;
};

/** Build a deterministic DiceBear avatar URL for a given style, seed, and extra params. */
function dicebear(style: string, seed: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams({ seed, ...params });
  return `https://api.dicebear.com/10.x/${style}/svg?${query.toString()}`;
}

/** A recognizable animal glyph from Twemoji (CC-BY 4.0). */
function twemoji(codepoint: string): string {
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoint}.svg`;
}

type AvatarSeed = { seed: string; label: string; top?: string };

/** Human portraits (Avataaars by Pablo Stanley — free for personal & commercial use). */
const PEOPLE: AvatarSeed[] = [
  { seed: "sunny-curls", label: "Sunny curls", top: "curly" },
  { seed: "silver-hair-glasses", label: "Silver hair and round glasses" },
  { seed: "long-dark-hair", label: "Long dark hair, nose ring" },
  { seed: "beard-flat-cap", label: "Short crop", top: "shortFlat" },
  { seed: "red-curls-freckles", label: "Red curls and freckles" },
  { seed: "buzz-cut-turtleneck", label: "Buzz cut and turtleneck" },
  { seed: "silver-curls-hoops", label: "Silver curls and hoops" },
  { seed: "dark-hair-beard", label: "Dark hair and beard" },
  { seed: "sleek-bob", label: "Sleek bob", top: "bob" },
  { seed: "patterned-headscarf", label: "Patterned headscarf" },
  { seed: "spectacles-bowtie", label: "Spectacles and bow tie" },
  { seed: "short-locs", label: "Short locs" },
  { seed: "top-knot", label: "Top knot and earrings" },
  { seed: "long-waves", label: "Long waves" },
  { seed: "side-part-stubble", label: "Side part and stubble" },
  { seed: "curly-afro", label: "Curly afro" },
  { seed: "high-ponytail", label: "High ponytail" },
  { seed: "low-bun-glasses", label: "Low bun and glasses" },
  { seed: "mohawk", label: "Mohawk" },
  { seed: "pixie-cut", label: "Pixie cut" },
  { seed: "handlebar-mustache", label: "Handlebar mustache" },
  { seed: "silver-bun", label: "Silver bun", top: "bun" },
  { seed: "bald-full-beard", label: "Bald with full beard" },
  { seed: "shaggy-hair", label: "Shaggy hair" },
];

type TwemojiGlyph = { codepoint: string; label: string; scale?: number };

/** Recognizable animal faces (Twemoji, CC-BY 4.0). */
const ANIMALS: TwemojiGlyph[] = [
  { codepoint: "1f98a", label: "Fox" },
  { codepoint: "1f431", label: "Cat" },
  { codepoint: "1f436", label: "Dog" },
  { codepoint: "1f43b", label: "Bear" },
  { codepoint: "1f430", label: "Rabbit" },
  { codepoint: "1f438", label: "Frog" },
  { codepoint: "1f43c", label: "Panda" },
  { codepoint: "1f989", label: "Owl" },
  { codepoint: "1f42d", label: "Mouse" },
  { codepoint: "1f981", label: "Lion" },
  { codepoint: "1f437", label: "Pig" },
  { codepoint: "1f435", label: "Monkey" },
];

/** Recognizable inanimate objects (Twemoji, CC-BY 4.0). */
const OBJECTS: TwemojiGlyph[] = [
  { codepoint: "1f697", label: "Car", scale: 0.81 },
  { codepoint: "1f3e0", label: "House" },
  { codepoint: "1f333", label: "Tree" },
  { codepoint: "23f0", label: "Clock" },
  { codepoint: "1f4f1", label: "Phone" },
  { codepoint: "1f4bb", label: "Computer", scale: 0.81 },
  { codepoint: "1f37a", label: "Beer glass", scale: 0.81 },
  { codepoint: "1f6cf", label: "Bed", scale: 0.81 },
  { codepoint: "1f6b2", label: "Bike", scale: 0.81 },
  { codepoint: "26f0", label: "Mountain" },
  { codepoint: "1f4d6", label: "Book" },
  { codepoint: "26bd", label: "Ball" },
];

/** Abstract critter blobs (Critters, CC0) — kept under the "Aliens" tab. */
const ALIENS: AvatarSeed[] = [
  { seed: "alien-1", label: "Alien 1" },
  { seed: "alien-2", label: "Alien 2" },
  { seed: "alien-3", label: "Alien 3" },
  { seed: "alien-4", label: "Alien 4" },
  { seed: "alien-5", label: "Alien 5" },
  { seed: "alien-6", label: "Alien 6" },
  { seed: "alien-7", label: "Alien 7" },
  { seed: "alien-8", label: "Alien 8" },
  { seed: "alien-9", label: "Alien 9" },
  { seed: "alien-10", label: "Alien 10" },
  { seed: "alien-11", label: "Alien 11" },
  { seed: "alien-12", label: "Alien 12" },
];

export const AVATAR_OPTIONS: AvatarOption[] = [
  ...PEOPLE.map(({ seed, label, top }, index) => ({
    id: `people-${index + 1}`,
    url: dicebear("avataaars", seed, {
      mouthVariant: "smile",
      mouthProbability: "100",
      eyesVariant: "default",
      eyesProbability: "100",
      eyebrowsVariant: "default",
      eyebrowsProbability: "100",
      ...(top ? { topVariant: top, topProbability: "100" } : {}),
    }),
    label,
    category: "people" as const,
  })),
  ...ANIMALS.map(({ codepoint, label }, index) => ({
    id: `animal-${index + 1}`,
    url: twemoji(codepoint),
    label,
    category: "animals" as const,
  })),
  ...OBJECTS.map(({ codepoint, label, scale }, index) => ({
    id: `object-${index + 1}`,
    url: twemoji(codepoint),
    label,
    category: "objects" as const,
    scale,
  })),
  ...ALIENS.map(({ seed, label }, index) => ({
    id: `alien-${index + 1}`,
    url: dicebear("critters", seed),
    label,
    category: "aliens" as const,
  })),
];

/** Fixed computer-opponent portraits used for Ace and Leo. */
export const ACE_AVATAR = AVATAR_OPTIONS[3]!.url;
export const LEO_AVATAR = AVATAR_OPTIONS[7]!.url;

/**
 * Ada's portraits — the "Buzz cut and turtleneck" people avatar (people-6,
 * second row, third column of the People tab). The sad face is the same glyph
 * with a sad mouth so the cribbage win/lose dialog still shows a reaction.
 */
export const ADA_AVATAR = AVATAR_OPTIONS[5]!.url;
export const ADA_HAPPY = ADA_AVATAR;
export const ADA_SAD = dicebear("avataaars", "buzz-cut-turtleneck", {
  mouthVariant: "sad",
  mouthProbability: "100",
  eyesVariant: "default",
  eyesProbability: "100",
  eyebrowsVariant: "default",
  eyebrowsProbability: "100",
});

const KEY = "parlor.avatar";

export function readAvatar(): string {
  if (typeof window === "undefined") return AVATAR_OPTIONS[0]!.url;
  const stored = window.localStorage.getItem(KEY);
  const match = AVATAR_OPTIONS.find((option) => option.id === stored);
  return (match ?? AVATAR_OPTIONS[0]!).url;
}

export function writeAvatar(id: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, id);
}
