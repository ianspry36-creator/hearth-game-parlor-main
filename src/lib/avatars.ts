import carAvatar from "@/assets/avatar-car.svg";
import bikeAvatar from "@/assets/avatar-bike.svg";
import robotAsmo from "@/assets/robots/Asmo.png";
import robotAstroBoy from "@/assets/robots/astro boy.png";
import robotAwesomO from "@/assets/robots/Awesom-o.png";
import robotBender from "@/assets/robots/bender.png";
import robotC3po from "@/assets/robots/c-3po.png";
import robotCybermen from "@/assets/robots/cybermen.png";
import robotCylon from "@/assets/robots/cylon.png";
import robotEve from "@/assets/robots/Eve.png";
import robotGort from "@/assets/robots/Gort.png";
import robotHal9000 from "@/assets/robots/Hal9000.png";
import robotMarvin from "@/assets/robots/Marvin.png";
import robotMaschinenmensch from "@/assets/robots/Maschinenmensch.png";
import robotR2d2 from "@/assets/robots/R2-D2.png";
import robotRobby from "@/assets/robots/robby.png";
import robotTerminator from "@/assets/robots/terminator.png";
import robotTheIronGiant from "@/assets/robots/TheIronGiant.png";

export type AvatarCategory = "people" | "animals" | "objects" | "aliens" | "robots";

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
  { seed: "patterned-headscarf", label: "Patterned headscarf" },
  { seed: "spectacles-bowtie", label: "Spectacles and bow tie" },
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

type TwemojiGlyph = { codepoint: string; label: string; scale?: number; url?: string };

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
  { codepoint: "1f697", label: "Car", scale: 0.81, url: carAvatar },
  { codepoint: "1f3e0", label: "House" },
  { codepoint: "1f333", label: "Tree" },
  { codepoint: "23f0", label: "Clock" },
  { codepoint: "1f4f1", label: "Phone" },
  { codepoint: "1f4bb", label: "Computer", scale: 0.81 },
  { codepoint: "1f37a", label: "Beer glass", scale: 0.81 },
  { codepoint: "1f6cf", label: "Bed", scale: 0.81 },
  { codepoint: "1f6b2", label: "Bike", scale: 0.81, url: bikeAvatar },
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
    scale: 0.9,
  })),
  ...OBJECTS.map(({ codepoint, label, scale, url }, index) => ({
    id: `object-${index + 1}`,
    url: url ?? twemoji(codepoint),
    label,
    category: "objects" as const,
    ...(scale !== undefined ? { scale } : {}),
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
const CUSTOM_KEY = "parlor.avatar.custom";
const LAST_BUILD_KEY = "parlor.avatar.last-build";

export function readAvatar(): string {
  if (typeof window === "undefined") return AVATAR_OPTIONS[0]!.url;
  const custom = window.localStorage.getItem(CUSTOM_KEY);
  if (custom) return custom;
  const stored = window.localStorage.getItem(KEY);
  const match = AVATAR_OPTIONS.find((option) => option.id === stored);
  return (match ?? AVATAR_OPTIONS[0]!).url;
}

export function writeAvatar(id: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, id);
    window.localStorage.removeItem(CUSTOM_KEY);
  }
}

/** Persist a player-built (Build tab) avatar URL. */
export function writeCustomAvatar(url: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CUSTOM_KEY, url);
    window.localStorage.setItem(LAST_BUILD_KEY, url);
    window.localStorage.removeItem(KEY);
  }
}

/** The most recently saved Build-tab avatar, remembered even after the player
 * switches to a People/Animals/Objects/Aliens portrait, so the Build tab can
 * reopen on that same avatar instead of the defaults. */
export function readLastBuildAvatar(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_BUILD_KEY);
}

/** The computer opponents a player can dress up with a robot portrait. */
export type BotId = "ada" | "ace" | "leo";

/**
 * Robot portraits for the computer opponents. Each option is named after its
 * source file (minus the extension), so "Asmo", "astro boy", "c-3po", etc.
 */
export const ROBOT_OPTIONS: AvatarOption[] = [
  { id: "asmo", url: robotAsmo, label: "Asimo", category: "robots" },
  { id: "astro-boy", url: robotAstroBoy, label: "Astro Boy", category: "robots" },
  { id: "awesom-o", url: robotAwesomO, label: "Awesom-o", category: "robots" },
  { id: "bender", url: robotBender, label: "Bender", category: "robots" },
  { id: "c-3po", url: robotC3po, label: "C-3PO", category: "robots" },
  { id: "cybermen", url: robotCybermen, label: "Cybermen", category: "robots" },
  { id: "cylon", url: robotCylon, label: "Cylon", category: "robots" },
  { id: "eve", url: robotEve, label: "Eve", category: "robots" },
  { id: "gort", url: robotGort, label: "Gort", category: "robots" },
  { id: "hal9000", url: robotHal9000, label: "HAL 9000", category: "robots" },
  { id: "marvin", url: robotMarvin, label: "Marvin", category: "robots" },
  {
    id: "maschinenmensch",
    url: robotMaschinenmensch,
    label: "Maschinenmensch",
    category: "robots",
  },
  { id: "r2-d2", url: robotR2d2, label: "R2-D2", category: "robots" },
  { id: "robby", url: robotRobby, label: "Robby", category: "robots" },
  { id: "terminator", url: robotTerminator, label: "T 800", category: "robots" },
  { id: "the-iron-giant", url: robotTheIronGiant, label: "The Iron Giant", category: "robots" },
];

/** The three standard (human) portraits for Ada, Ace and Leo, offered alongside
 * the robots so a bot can be restored to its default face or swap faces. */
export const STANDARD_BOT_OPTIONS: AvatarOption[] = [
  { id: "ada", url: ADA_AVATAR, label: "Ada", category: "people" },
  { id: "ace", url: ACE_AVATAR, label: "Ace", category: "people" },
  { id: "leo", url: LEO_AVATAR, label: "Leo", category: "people" },
];

/** Every portrait a bot can wear: the standard people faces plus the robots. */
export const BOT_AVATAR_OPTIONS: AvatarOption[] = [...STANDARD_BOT_OPTIONS, ...ROBOT_OPTIONS];

/** Fallback portraits used before the player assigns a portrait to each bot. */
const BOT_DEFAULTS: Record<BotId, string> = {
  ada: ADA_AVATAR,
  ace: ACE_AVATAR,
  leo: LEO_AVATAR,
};

const botKey = (bot: BotId) => `parlor.bot-avatar.${bot}`;

/** The portrait currently assigned to a computer opponent (a standard face or a robot). */
export function readBotAvatar(bot: BotId): string {
  if (typeof window === "undefined") return BOT_DEFAULTS[bot];
  const stored = window.localStorage.getItem(botKey(bot));
  const match = BOT_AVATAR_OPTIONS.find((option) => option.id === stored);
  return match?.url ?? BOT_DEFAULTS[bot];
}

/** Persist the chosen robot portrait for a computer opponent. */
export function writeBotAvatar(bot: BotId, id: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(botKey(bot), id);
}

const BOT_DEFAULT_NAMES: Record<BotId, string> = {
  ada: "Ada",
  ace: "Ace",
  leo: "Leo",
};

/** The display name for a computer opponent. Choosing a robot portrait renames
 * the bot to the robot (e.g. Ada becomes "Asmo"); otherwise the default name. */
export function readBotName(bot: BotId): string {
  const avatar = readBotAvatar(bot);
  const robot = ROBOT_OPTIONS.find((option) => option.url === avatar);
  return robot ? robot.label : BOT_DEFAULT_NAMES[bot];
}

/* ------------------------------------------------------------------ */
/* Build-your-own avatar (the "Build" tab of the portrait picker).     */
/* Rendered with the same Avataaars style as the People tab so the     */
/* result matches the hand-picked portraits.                           */
/* ------------------------------------------------------------------ */

export type BuildFeature =
  | "hat"
  | "hairstyle"
  | "hairColor"
  | "facialHair"
  | "skinColor"
  | "eyes"
  | "mouth"
  | "glasses"
  | "clothes"
  | "clothesColor";

export type BuildOption = {
  /** DiceBear avataaars value, or null for "none" (feature turned off). */
  value: string | null;
  label: string;
  /** Hex colour (with `#`) rendered as a swatch for colour-type features. */
  swatch?: string;
};

export type BuildSelection = Record<BuildFeature, string | null>;

/** Ordered list of the slider widgets shown in the Build tab. */
export const BUILD_FEATURES: { feature: BuildFeature; label: string }[] = [
  { feature: "hat", label: "Hat" },
  { feature: "hairstyle", label: "Hairstyle" },
  { feature: "hairColor", label: "Hair colour" },
  { feature: "facialHair", label: "Facial hair" },
  { feature: "skinColor", label: "Skin colour" },
  { feature: "eyes", label: "Eyes" },
  { feature: "mouth", label: "Mouth" },
  { feature: "glasses", label: "Glasses" },
  { feature: "clothes", label: "Top style" },
  { feature: "clothesColor", label: "Clothes colour" },
];

export const BUILD_OPTIONS: Record<BuildFeature, BuildOption[]> = {
  hat: [
    { value: null, label: "None" },
    { value: "hat", label: "Flat cap" },
    { value: "winterHat1", label: "Beanie" },
    { value: "winterHat02", label: "Winter hat" },
    { value: "winterHat03", label: "Pompom hat" },
    { value: "winterHat04", label: "Trapper hat" },
    { value: "hijab", label: "Hijab" },
    { value: "turban", label: "Turban" },
  ],
  hairstyle: [
    { value: "shortFlat", label: "Short flat" },
    { value: "bigHair", label: "Big hair" },
    { value: "bob", label: "Bob" },
    { value: "bun", label: "Bun" },
    { value: "curly", label: "Curly" },
    { value: "curvy", label: "Curvy" },
    { value: "dreads", label: "Dreads" },
    { value: "frida", label: "Frida braids" },
    { value: "frizzle", label: "Frizzle" },
    { value: "fro", label: "Fro" },
    { value: "froBand", label: "Fro band" },
    { value: "longButNotTooLong", label: "Long" },
    { value: "miaWallace", label: "Mia Wallace" },
    { value: "shaggy", label: "Shaggy" },
    { value: "shaggyMullet", label: "Shaggy mullet" },
    { value: "shavedSides", label: "Shaved sides" },
    { value: "shortCurly", label: "Short curly" },
    { value: "shortRound", label: "Short round" },
    { value: "shortWaved", label: "Short waved" },
    { value: "sides", label: "Sides" },
    { value: "straight01", label: "Straight" },
    { value: "straight02", label: "Straight 2" },
    { value: "straightAndStrand", label: "Straight & strand" },
    { value: "theCaesar", label: "The Caesar" },
    { value: "theCaesarAndSidePart", label: "Caesar side part" },
  ],
  hairColor: [
    { value: "2C1B18", label: "Black", swatch: "#2C1B18" },
    { value: "4A312C", label: "Dark brown", swatch: "#4A312C" },
    { value: "724133", label: "Brown", swatch: "#724133" },
    { value: "A55728", label: "Auburn", swatch: "#A55728" },
    { value: "C93305", label: "Red", swatch: "#C93305" },
    { value: "B58143", label: "Blonde", swatch: "#B58143" },
    { value: "D6B370", label: "Golden blonde", swatch: "#D6B370" },
    { value: "ECDCBF", label: "Platinum", swatch: "#ECDCBF" },
    { value: "E8E1E1", label: "Silver", swatch: "#E8E1E1" },
    { value: "F59797", label: "Pink", swatch: "#F59797" },
  ],
  facialHair: [
    { value: null, label: "None" },
    { value: "beardLight", label: "Light beard" },
    { value: "beardMedium", label: "Medium beard" },
    { value: "beardMajestic", label: "Full beard" },
    { value: "moustacheFancy", label: "Handlebar moustache" },
    { value: "moustacheMagnum", label: "Magnum moustache" },
  ],
  skinColor: [
    { value: "614335", label: "Deep", swatch: "#614335" },
    { value: "AE5D29", label: "Brown", swatch: "#AE5D29" },
    { value: "D08B5B", label: "Tan", swatch: "#D08B5B" },
    { value: "EDB98A", label: "Light", swatch: "#EDB98A" },
    { value: "FFDBB4", label: "Pale", swatch: "#FFDBB4" },
    { value: "FD9841", label: "Orange", swatch: "#FD9841" },
    { value: "F8D25C", label: "Yellow", swatch: "#F8D25C" },
  ],
  eyes: [
    { value: "default", label: "Default" },
    { value: "happy", label: "Happy" },
    { value: "surprised", label: "Surprised" },
    { value: "wink", label: "Wink" },
    { value: "squint", label: "Squint" },
  ],
  mouth: [
    { value: "smile", label: "Smile" },
    { value: "default", label: "Default" },
    { value: "concerned", label: "Concerned" },
    { value: "disbelief", label: "Disbelief" },
    { value: "eating", label: "Eating" },
    { value: "grimace", label: "Grimace" },
    { value: "sad", label: "Sad" },
    { value: "screamOpen", label: "Scream" },
    { value: "serious", label: "Serious" },
    { value: "tongue", label: "Tongue" },
    { value: "twinkle", label: "Twinkle" },
    { value: "vomit", label: "Vomit" },
  ],
  glasses: [
    { value: null, label: "None" },
    { value: "round", label: "Round" },
    { value: "prescription01", label: "Square" },
    { value: "prescription02", label: "Rectangular" },
    { value: "sunglasses", label: "Sunglasses" },
    { value: "wayfarers", label: "Wayfarers" },
    { value: "eyepatch", label: "Eyepatch" },
  ],
  clothes: [
    { value: "shirtCrewNeck", label: "Crew neck" },
    { value: "shirtScoopNeck", label: "Scoop neck" },
    { value: "shirtVNeck", label: "V-neck" },
    { value: "hoodie", label: "Hoodie" },
    { value: "overall", label: "Overalls" },
    { value: "blazerAndShirt", label: "Blazer & shirt" },
    { value: "blazerAndSweater", label: "Blazer & sweater" },
    { value: "collarAndSweater", label: "Collar & sweater" },
  ],
  clothesColor: [
    { value: "FFFFFF", label: "White", swatch: "#FFFFFF" },
    { value: "E6E6E6", label: "Grey", swatch: "#E6E6E6" },
    { value: "262E33", label: "Black", swatch: "#262E33" },
    { value: "3C4F5C", label: "Heather", swatch: "#3C4F5C" },
    { value: "929598", label: "Slate", swatch: "#929598" },
    { value: "65C9FF", label: "Blue", swatch: "#65C9FF" },
    { value: "5199E4", label: "Denim", swatch: "#5199E4" },
    { value: "25557C", label: "Navy", swatch: "#25557C" },
    { value: "B1E2FF", label: "Pastel blue", swatch: "#B1E2FF" },
    { value: "A7FFC4", label: "Pastel green", swatch: "#A7FFC4" },
    { value: "FFDEB5", label: "Pastel orange", swatch: "#FFDEB5" },
    { value: "FFAFB9", label: "Pastel red", swatch: "#FFAFB9" },
    { value: "FFFFB1", label: "Pastel yellow", swatch: "#FFFFB1" },
    { value: "FF488E", label: "Pink", swatch: "#FF488E" },
    { value: "FF5C5C", label: "Red", swatch: "#FF5C5C" },
  ],
};

/** The starting point when the player opens the Build tab. */
export const BUILD_DEFAULTS: BuildSelection = {
  hat: null,
  hairstyle: "shortFlat",
  hairColor: "4A312C",
  facialHair: null,
  skinColor: "EDB98A",
  eyes: "default",
  mouth: "smile",
  glasses: null,
  clothes: "shirtCrewNeck",
  clothesColor: "5199E4",
};

/** Fixed seed so the un-slidered features (skin, eyes, mouth) stay stable. */
const BUILD_SEED = "parlor-build";

/** True when a URL was produced by the Build tab (uses the fixed build seed). */
export function isBuildAvatar(url: string): boolean {
  try {
    return new URL(url).searchParams.get("seed") === BUILD_SEED;
  } catch {
    return false;
  }
}

/** Build a deterministic Avataaars URL from the player's slider selections. */
export function buildAvatarUrl(selection: BuildSelection): string {
  // Hats and hair both live in `top`; a hat covers the head, so it wins.
  const top = selection.hat ?? selection.hairstyle ?? "shortFlat";
  const params: Record<string, string> = {
    eyesVariant: selection.eyes ?? "default",
    eyesProbability: "100",
    eyebrowsVariant: "default",
    eyebrowsProbability: "100",
    noseVariant: "default",
    noseProbability: "100",
    topVariant: top,
    topProbability: "100",
  };
  if (selection.mouth) {
    params["mouthVariant"] = selection.mouth;
    params["mouthProbability"] = "100";
  } else {
    params["mouthProbability"] = "0";
  }
  if (selection.clothes) {
    params["clothesVariant"] = selection.clothes;
    params["clothesProbability"] = "100";
  }
  if (selection.hairColor) params["hairColor"] = selection.hairColor;
  if (selection.facialHair) {
    params["facialHairVariant"] = selection.facialHair;
    params["facialHairProbability"] = "100";
    // Keep the beard the same colour as the hair for a coherent look.
    if (selection.hairColor) params["facialHairColor"] = selection.hairColor;
  } else {
    params["facialHairProbability"] = "0";
  }
  if (selection.glasses) {
    params["accessoriesVariant"] = selection.glasses;
    params["accessoriesProbability"] = "100";
  } else {
    params["accessoriesProbability"] = "0";
  }
  if (selection.skinColor) params["skinColor"] = selection.skinColor;
  if (selection.clothesColor) params["clothesColor"] = selection.clothesColor;
  return dicebear("avataaars", BUILD_SEED, params);
}

/** Solid tile colour used behind feature previews. The skin is drawn in this
 * same colour so the face and body silhouette disappear, leaving only the
 * isolated feature (hat, hair, beard, eyes, glasses, mouth, …) floating on a
 * blank tile. */
const FEATURE_PREVIEW_BG = "241f2f";

/** A light hair/clothing tone used in feature previews so dark hairstyles,
 * beards and tops stay visible against the dark preview tile. */
const FEATURE_PREVIEW_FILL = "D6B370";

export function buildFeaturePreviewUrl(feature: BuildFeature, value: string | null): string {
  const params: Record<string, string> = {
    backgroundColor: FEATURE_PREVIEW_BG,
    skinColor: FEATURE_PREVIEW_BG,
    topProbability: "0",
    facialHairProbability: "0",
    eyesProbability: "0",
    eyebrowsProbability: "0",
    mouthProbability: "0",
    noseProbability: "0",
    accessoriesProbability: "0",
    clothesProbability: "0",
    clothesGraphicProbability: "0",
  };
  if (feature === "hat" || feature === "hairstyle") {
    if (value) {
      params["topVariant"] = value;
      params["topProbability"] = "100";
      params["hairColor"] = FEATURE_PREVIEW_FILL;
    }
  } else if (feature === "facialHair") {
    if (value) {
      params["facialHairVariant"] = value;
      params["facialHairProbability"] = "100";
      params["facialHairColor"] = FEATURE_PREVIEW_FILL;
    }
  } else if (feature === "eyes") {
    if (value) {
      params["eyesVariant"] = value;
      params["eyesProbability"] = "100";
    }
  } else if (feature === "mouth") {
    if (value) {
      params["mouthVariant"] = value;
      params["mouthProbability"] = "100";
    }
  } else if (feature === "glasses") {
    if (value) {
      params["accessoriesVariant"] = value;
      params["accessoriesProbability"] = "100";
    }
  } else if (feature === "clothes") {
    if (value) {
      params["clothesVariant"] = value;
      params["clothesProbability"] = "100";
      params["clothesColor"] = FEATURE_PREVIEW_FILL;
    }
  }
  return dicebear("avataaars", BUILD_SEED, params);
}

/** Top variants that are hats (drawn over the head) rather than hairstyles.
 * Used to reconstruct a `BuildSelection` from a generated avatar URL. */
const HAT_VARIANTS = new Set([
  "hat",
  "hijab",
  "turban",
  "winterHat1",
  "winterHat02",
  "winterHat03",
  "winterHat04",
]);

/** Rebuild a `BuildSelection` from an already-generated Avataaars URL so the
 * Build tab opens showing the avatar that is currently selected. Unknown or
 * missing params fall back to `BUILD_DEFAULTS`. */
export function buildSelectionFromUrl(url: string): BuildSelection {
  const selection: BuildSelection = { ...BUILD_DEFAULTS };

  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return selection;
  }

  const top = params.get("topVariant");
  if (top) {
    if (HAT_VARIANTS.has(top)) {
      selection.hat = top;
      selection.hairstyle = BUILD_DEFAULTS.hairstyle;
    } else {
      selection.hat = null;
      selection.hairstyle = top;
    }
  }

  const hairColor = params.get("hairColor");
  if (hairColor) selection.hairColor = hairColor;

  const facialHair = params.get("facialHairVariant");
  selection.facialHair = params.get("facialHairProbability") === "0" ? null : (facialHair ?? null);

  const skinColor = params.get("skinColor");
  if (skinColor) selection.skinColor = skinColor;

  const eyes = params.get("eyesVariant");
  if (eyes) selection.eyes = eyes;

  const mouth = params.get("mouthVariant");
  if (mouth) selection.mouth = mouth;

  const accessories = params.get("accessoriesVariant");
  selection.glasses =
    params.get("accessoriesProbability") === "0" ? null : (accessories ?? null);

  const clothes = params.get("clothesVariant");
  if (clothes) selection.clothes = clothes;

  const clothesColor = params.get("clothesColor");
  if (clothesColor) selection.clothesColor = clothesColor;

  return selection;
}
