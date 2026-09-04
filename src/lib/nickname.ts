export const INAPPROPRIATE_NAME_MESSAGE =
  "This username cannot be used. Usernames must not include profanity, hate speech, or inappropriate content.";

/** Maximum number of characters allowed in a nickname. */
export const MAX_NICKNAME_LENGTH = 10;

export const NICKNAME_TOO_LONG_MESSAGE = `Nicknames must be ${MAX_NICKNAME_LENGTH} characters or fewer.`;

/**
 * Character substitutions commonly used to disguise words ("leetspeak").
 * Applied after lowercasing so "F0CK" and "sh1t" still match their targets.
 */
const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  "$": "s",
  "!": "i",
  "+": "t",
  "#": "h",
};

/**
 * Terms that disqualify a nickname. Matched as whole words after
 * normalization, so short words never false-positive inside longer ones
 * (e.g. "class", "assassin", "title", "damnation" are all fine).
 */
const BLOCKED_TERMS: string[] = [
  // Profanity
  "fuck",
  "fucked",
  "fucker",
  "fucking",
  "motherfucker",
  "shit",
  "shitty",
  "bullshit",
  "bitch",
  "bitching",
  "cunt",
  "cock",
  "dick",
  "pussy",
  "twat",
  "asshole",
  "arsehole",
  "bastard",
  "whore",
  "slut",
  "prick",
  "douche",
  "douchebag",
  "wanker",
  "bollocks",
  "damn",
  // Common letter-substitution / vowel-drop forms the leetspeak map and the
  // vowel-optional matcher cannot recover on their own ("f0ck" -> "fock",
  // "fvck", "fuk").
  "fock",
  "fvck",
  "fuk",
  "shyt",
  "bich",
  "dik",
  "cawk",
  // Hate speech (racial)
  "nigger",
  "nigga",
  "chink",
  "kike",
  "spic",
  "gook",
  "wetback",
  "coon",
  "beaner",
  // Hate speech (sexual orientation / gender)
  "faggot",
  "fag",
  "dyke",
  "homo",
  "tranny",
  "shemale",
  // Ableist slurs
  "retard",
  "retarded",
  "spastic",
  "spaz",
  // Sexual / predatory content
  "rape",
  "rapist",
  "pedo",
  "pedophile",
  "molest",
  "incest",
  // Extremist content
  "nazi",
  "hitler",
];

const VOWELS = "aeiou";

/**
 * Terms where making a vowel optional would reduce the word to a common,
 * inoffensive word (e.g. "rape" -> "rap"). These are matched with vowels
 * required so legitimate words are not flagged.
 */
const STRICT_TERMS = new Set(["rape"]);

/**
 * Normalize a nickname into lowercase with leetspeak applied, while keeping
 * non-letter characters (asterisks, dots, spaces, …) in place so the matcher
 * below can treat them as separators/masks. camelCase boundaries are turned
 * into spaces so "FuckYou" still resolves to "fuck you".
 */
function normalize(value: string): string {
  const split = value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

  let out = "";
  for (const ch of split) out += LEET[ch] ?? ch;

  return out;
}

/** Collapse runs of the same letter so "fuuuck" still reads as "fuck". */
function squeeze(value: string): string {
  return value.replace(/([a-z])\1+/g, "$1");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a regex for one blocked term that tolerates common obfuscations:
 *
 *  - vowels are optional ("twt", "fck", "btch" → "twat", "fuck", "bitch")
 *  - any run of non-letters may appear between letters ("tw*t", "f ck", "sh*t")
 *  - `\b` boundaries keep short terms from matching inside longer words
 *    ("class", "assassin", "title", "damnation" stay allowed)
 *
 * Consonants must still appear in order, so substituting a different vowel
 * ("tweet" vs "twat") is not treated as a match.
 */
function buildMatcher(term: string): RegExp {
  const SEP = "[^a-z]*";
  const strict = STRICT_TERMS.has(term);
  let src = "\\b";
  for (const ch of term) {
    const optional = !strict && VOWELS.includes(ch);
    src += optional
      ? `(?:${SEP}${escapeRegExp(ch)})?`
      : `${SEP}${escapeRegExp(ch)}`;
  }
  src += "\\b";
  return new RegExp(src);
}

const MATCHERS = BLOCKED_TERMS.map(buildMatcher);

/** True when a nickname contains profanity, hate speech, or other blocked content. */
export function isInappropriateNickname(value: string): boolean {
  const normalized = normalize(value);
  const squeezed = squeeze(normalized);
  return MATCHERS.some((re) => re.test(normalized) || re.test(squeezed));
}
