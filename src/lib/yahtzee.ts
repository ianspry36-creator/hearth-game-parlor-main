export const DICE_COUNT = 5;
export const MAX_ROLLS = 3;
export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 35;

export type YDie = { face: number; held: boolean };

export type Category =
  | "ones"
  | "twos"
  | "threes"
  | "fours"
  | "fives"
  | "sixes"
  | "threeKind"
  | "fourKind"
  | "fullHouse"
  | "smallStraight"
  | "largeStraight"
  | "yahtzee"
  | "chance";

export type Card = Partial<Record<Category, number>>;

export const UPPER: Category[] = ["ones", "twos", "threes", "fours", "fives", "sixes"];
export const LOWER: Category[] = [
  "threeKind",
  "fourKind",
  "fullHouse",
  "smallStraight",
  "largeStraight",
  "yahtzee",
  "chance",
];
export const CATEGORIES: Category[] = [...UPPER, ...LOWER];

export const CATEGORY_LABELS: Record<Category, string> = {
  ones: "Ones",
  twos: "Twos",
  threes: "Threes",
  fours: "Fours",
  fives: "Fives",
  sixes: "Sixes",
  threeKind: "Three of a kind",
  fourKind: "Four of a kind",
  fullHouse: "Full house",
  smallStraight: "Small straight",
  largeStraight: "Large straight",
  yahtzee: "Yahtzee",
  chance: "Chance",
};

export const rollFace = () => 1 + Math.floor(Math.random() * 6);

const tally = (faces: number[]) => {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const f of faces) c[f] = (c[f] ?? 0) + 1;
  return c;
};

const sum = (faces: number[]) => faces.reduce((s, n) => s + n, 0);

const hasRun = (c: number[], length: number) => {
  let run = 0;
  for (let face = 1; face <= 6; face += 1) {
    if ((c[face] ?? 0) > 0) {
      run += 1;
      if (run >= length) return true;
    } else {
      run = 0;
    }
  }
  return false;
};

/** Score a roll in a category. Always legal — a bad fit simply scores zero. */
export function scoreCategory(category: Category, faces: number[]): number {
  const c = tally(faces);
  const upperIndex = UPPER.indexOf(category);
  if (upperIndex >= 0) {
    const face = upperIndex + 1;
    return (c[face] ?? 0) * face;
  }
  switch (category) {
    case "threeKind":
      return c.slice(1).some((n) => n >= 3) ? sum(faces) : 0;
    case "fourKind":
      return c.slice(1).some((n) => n >= 4) ? sum(faces) : 0;
    case "fullHouse": {
      const counts = c.slice(1).filter((n) => n > 0);
      const isHouse =
        (counts.includes(3) && counts.includes(2)) || counts.some((n) => n === 5);
      return isHouse ? 25 : 0;
    }
    case "smallStraight":
      return hasRun(c, 4) ? 30 : 0;
    case "largeStraight":
      return hasRun(c, 5) ? 40 : 0;
    case "yahtzee":
      return c.slice(1).some((n) => n === 5) ? 50 : 0;
    case "chance":
      return sum(faces);
    default:
      return 0;
  }
}

export const upperTotal = (card: Card) =>
  UPPER.reduce((s, cat) => s + (card[cat] ?? 0), 0);

export const bonusFor = (card: Card) =>
  upperTotal(card) >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;

export const lowerTotal = (card: Card) =>
  LOWER.reduce((s, cat) => s + (card[cat] ?? 0), 0);

export const grandTotal = (card: Card) =>
  upperTotal(card) + bonusFor(card) + lowerTotal(card);

export const cardComplete = (card: Card) =>
  CATEGORIES.every((cat) => card[cat] !== undefined);

/** Which dice Charlotte should hold, as indexes into `faces`. */
export function bestHold(faces: number[], card: Card): number[] {
  const c = tally(faces);

  // Chase a straight when four of a run are already showing and the slot is open.
  const straightOpen =
    card["largeStraight"] === undefined || card["smallStraight"] === undefined;
  const distinct = c.slice(1).filter((n) => n > 0).length;
  if (straightOpen && distinct >= 4 && (hasRun(c, 4) || hasRun(c, 5))) {
    const seen = new Set<number>();
    const keep: number[] = [];
    faces.forEach((face, index) => {
      if (!seen.has(face)) {
        seen.add(face);
        keep.push(index);
      }
    });
    return keep;
  }

  // Otherwise hold the largest group, breaking ties on the higher face.
  let bestFace = 0;
  let bestCount = 0;
  for (let face = 6; face >= 1; face -= 1) {
    const n = c[face] ?? 0;
    if (n > bestCount) {
      bestCount = n;
      bestFace = face;
    }
  }
  if (bestCount >= 2) {
    return faces
      .map((face, index) => (face === bestFace ? index : -1))
      .filter((i) => i >= 0);
  }

  // Nothing paired: keep the useful high singles.
  return faces
    .map((face, index) => (face >= 5 ? index : -1))
    .filter((i) => i >= 0);
}

/** The category Charlotte should take, weighted a little to keep options open. */
export function bestCategory(faces: number[], card: Card): Category {
  let choice: Category | null = null;
  let bestValue = -Infinity;
  for (const cat of CATEGORIES) {
    if (card[cat] !== undefined) continue;
    const score = scoreCategory(cat, faces);
    let value = score;
    if (cat === "chance") value -= 8; // keep chance in reserve
    if (UPPER.includes(cat) && score === 0) value -= 6;
    if (cat === "yahtzee" && score === 0) value -= 20;
    if (value > bestValue) {
      bestValue = value;
      choice = cat;
    }
  }
  return choice ?? "chance";
}
