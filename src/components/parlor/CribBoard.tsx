import { useEffect, useRef, useState } from "react";

const WIN = 121;

type Side = "player" | "cpu";
type Tone = "gold" | "ivory";

/** Source-image dimensions (px). Track coordinates are stored in px and
 *  divided by these so the pegs stay glued to the holes as the <img> scales. */
const IMG_W = 255;
const IMG_H = 717;

/**
 * The 3-player board (255×717) lays out each player's track as three
 * interleaved columns. Two players are wired up, on the left and middle
 * tracks:
 *
 *   - player (gold)  → red track (left):    left 23,  middle 104, right 231
 *   - cpu    (ivory) → green track (middle): left 46, middle 127, right 208
 *
 * (The third, blue track — left 69, middle 150, right 185 — is unused.)
 *
 * A track snakes through its three columns: up the left column (from the
 * three-hole start square at the bottom), across the top to the right column,
 * down the right column, around the bottom arc to the middle column, then up
 * the middle column to the finish hole.
 */
const COLS: Record<Side, { left: number; middle: number; right: number }> = {
  player: { left: 23, middle: 104, right: 231 },
  cpu: { left: 46, middle: 127, right: 208 },
};

/** Vertical positions (px, top → bottom) of the 35 scoring rows. */
const ROWS = [
  138, 152, 167, 181, 195, 210, 224, 238, 253, 267, 281, 296, 310, 324, 339,
  353, 367, 382, 396, 410, 425, 439, 453, 468, 482, 496, 511, 525, 539, 553,
  568, 582, 596, 611, 625,
];

type Pt = { x: number; y: number };

/** Bottom-of-track geometry: the start square and the turnaround arc. */
const BOTTOM: Record<
  Side,
  {
    /** Three holes below the left column, bottom → top — the peg start. */
    start: number[];
    /** Bottom hole of the middle column (offset inward toward the arc). */
    middle: Pt;
    /** Bottom hole of the right column (offset inward toward the arc). */
    right: Pt;
    /** Arc holes linking the middle column to the right column. */
    arc: Pt[];
  }
> = {
  player: {
    start: [681, 667, 652],
    middle: { x: 107, y: 652 },
    right: { x: 228, y: 652 },
    arc: [
      { x: 130, y: 684 },
      { x: 168, y: 696 },
      { x: 205, y: 684 },
    ],
  },
  cpu: {
    start: [681, 667, 652],
    middle: { x: 129, y: 645 },
    right: { x: 206, y: 645 },
    arc: [
      { x: 144, y: 666 },
      { x: 168, y: 674 },
      { x: 192, y: 666 },
    ],
  },
};

/**
 * Top-of-track geometry: the curved holes that carry the peg over the rounded
 * top of the board, linking the top of the left column to the top of the
 * right column. Each list is ordered left → right (the direction the peg
 * travels across the top), and is symmetric about the board centre (x ≈ 128).
 */
const TOP: Record<Side, Pt[]> = {
  player: [
    { x: 24, y: 131 },
    { x: 25, y: 115 },
    { x: 35, y: 84 },
    { x: 54, y: 58 },
    { x: 80, y: 39 },
    { x: 111, y: 29 },
    { x: 128, y: 28 },
    { x: 144, y: 29 },
    { x: 175, y: 39 },
    { x: 201, y: 58 },
    { x: 220, y: 84 },
    { x: 230, y: 115 },
    { x: 231, y: 132 },
  ],
  cpu: [
    { x: 47, y: 132 },
    { x: 47, y: 119 },
    { x: 55, y: 95 },
    { x: 70, y: 74 },
    { x: 91, y: 59 },
    { x: 115, y: 51 },
    { x: 128, y: 50 },
    { x: 140, y: 51 },
    { x: 164, y: 59 },
    { x: 185, y: 74 },
    { x: 200, y: 95 },
    { x: 208, y: 119 },
    { x: 209, y: 132 },
  ],
};

/** The ordered list of hole positions a peg walks, start → finish. */
function track(side: Side): Pt[] {
  const { left, middle, right } = COLS[side];
  const b = BOTTOM[side];
  const pts: Pt[] = [];

  // 1. Start square, then up the left column (bottom → top).
  for (const y of b.start) pts.push({ x: left, y });
  for (const y of [...ROWS].reverse()) pts.push({ x: left, y });

  // 2. Across the top curve to the right column.
  for (const p of TOP[side]) pts.push(p);

  // 3. Down the right column (top → bottom).
  for (const y of ROWS) pts.push({ x: right, y });
  pts.push(b.right);

  // 4. Around the bottom arc to the middle column.
  for (const p of [...b.arc].reverse()) pts.push(p);

  // 5. Up the middle column (bottom → top) to the finish hole.
  pts.push(b.middle);
  for (const y of [...ROWS].reverse()) pts.push({ x: middle, y });

  return pts;
}

// Precompute each track once; it never changes.
const TRACK_PLAYER = track("player");
const TRACK_CPU = track("cpu");

/**
 * Map a score (0–121) onto a hole, expressed as fractions of width/height.
 *
 * The first three holes of each track form the start square. Spot 1 stays
 * empty, the back peg (lag) starts on spot 2 and the front peg on spot 3, so
 * scoring begins on spot 4 — a score of N lands on spot N + 3.
 */
function spotIndex(score: number, side: Side, lag: boolean): number {
  const pts = side === "player" ? TRACK_PLAYER : TRACK_CPU;
  const s = Math.max(0, Math.min(score, WIN));
  const FRONT_START = 2; // front peg's starting hole index (spot 3)
  const front = FRONT_START + Math.round((s / WIN) * (pts.length - 1 - FRONT_START));
  return lag ? front - 1 : front;
}

/** Fractional (0-1) coordinates of a given track hole. */
function pointAt(side: Side, index: number): { x: number; y: number } {
  const pts = side === "player" ? TRACK_PLAYER : TRACK_CPU;
  const i = Math.max(0, Math.min(index, pts.length - 1));
  const p = pts[i]!;
  return { x: p.x / IMG_W, y: p.y / IMG_H };
}

/** Animate a peg hole-by-hole along its track so it never cuts corners. */
function useAnimatedIndex(side: Side, score: number, lag: boolean): number {
  const target = spotIndex(score, side, lag);
  const [index, setIndex] = useState(target);
  const targetRef = useRef(target);

  useEffect(() => {
    const from = targetRef.current;
    targetRef.current = target;
    if (from === target) return;

    const distance = Math.abs(target - from);
    // A full reset (a new game) jumps straight back to the start; a normal
    // score change crawls along the track one hole at a time.
    if (distance > 60) {
      setIndex(target);
      return;
    }

    const stepMs = Math.max(25, Math.min(90, 1400 / distance));
    const dir = Math.sign(target - from);

    let current = from;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (cancelled) return;
      current += dir;
      setIndex(current);
      if (current !== target) timer = setTimeout(tick, stepMs);
    };
    timer = setTimeout(tick, stepMs);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [target, side, lag]);

  return index;
}

/** A single peg drawn over the board image. */
function Peg({
  side,
  score,
  tone,
  lag = false,
}: {
  side: Side;
  score: number;
  tone: Tone;
  lag?: boolean;
}) {
  const index = useAnimatedIndex(side, score, lag);
  const { x, y } = pointAt(side, index);
  // Solid colours with a crisp dark outline — no translucent ring or blur.
  const fill = tone === "gold" ? "bg-gold" : "bg-ivory";
  const border = tone === "gold" ? "border-amber-950/70" : "border-stone-700/70";
  return (
    <span
      aria-hidden
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border ${fill} ${border} ${
        lag ? "size-2.5" : "size-3.5"
      }`}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        zIndex: lag ? 1 : 2,
      }}
    />
  );
}

export function CribBoard({
  graphic,
  playerScore,
  cpuScore,
  playerBack,
  cpuBack,
  opponentName,
  playerName,
}: {
  graphic: string;
  playerScore: number;
  cpuScore: number;
  playerBack: number;
  cpuBack: number;
  opponentName: string;
  playerName: string;
}) {
  return (
    <div className="rounded-xl border border-gold/20 bg-surface/60 p-4">
      <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-ivory/60">The board</p>
      <div className="relative mx-auto w-full max-w-[210px]">
        <img
          src={graphic}
          alt="Cribbage peg board"
          className="block w-full rounded-lg shadow-lg shadow-black/30"
        />
        <Peg side="player" score={playerScore} tone="gold" />
        <Peg side="player" score={playerBack} tone="gold" lag />
        <Peg side="cpu" score={cpuScore} tone="ivory" />
        <Peg side="cpu" score={cpuBack} tone="ivory" lag />
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-gold/20">
        <div className="flex items-center justify-between border-b border-gold/15 bg-brand/60 px-3 py-2">
          <span className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full bg-gold" /> {playerName}
          </span>
          <span className="font-display text-lg text-gold">{playerScore}</span>
        </div>
        <div className="flex items-center justify-between bg-brand/40 px-3 py-2">
          <span className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full bg-ivory" /> {opponentName}
          </span>
          <span className="font-display text-lg">{cpuScore}</span>
        </div>
      </div>
    </div>
  );
}
