const WIN = 121;

type Side = "player" | "cpu";
type Tone = "gold" | "ivory";

/** Source-image dimensions (px). Track coordinates are stored in px and
 *  divided by these so the pegs stay glued to the holes as the <img> scales. */
const IMG_W = 255;
const IMG_H = 717;

/**
 * The new 3-player board (255×717) lays out each player's track as three
 * interleaved columns. Only two players are wired up for now:
 *
 *   - player (gold)  → red track:   left 23, middle 104, right 231
 *   - cpu    (ivory) → blue track:  left 69, middle 150, right 185
 *
 * A track snakes through its three columns: up the left column (from the
 * three-hole start square at the bottom), across the top to the middle
 * column, down the middle column, around the bottom arc to the right column,
 * then up the right column to the finish hole.
 */
const COLS: Record<Side, { left: number; middle: number; right: number }> = {
  player: { left: 23, middle: 104, right: 231 },
  cpu: { left: 69, middle: 150, right: 185 },
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
    middle: { x: 151, y: 638 },
    right: { x: 185, y: 638 },
    arc: [
      { x: 157, y: 647 },
      { x: 168, y: 650 },
      { x: 178, y: 647 },
    ],
  },
};

/** The ordered list of hole positions a peg walks, start → finish. */
function track(side: Side): Pt[] {
  const { left, middle, right } = COLS[side];
  const b = BOTTOM[side];
  const pts: Pt[] = [];

  // 1. Start square, then up the left column (bottom → top).
  for (const y of b.start) pts.push({ x: left, y });
  for (const y of [...ROWS].reverse()) pts.push({ x: left, y });

  // 2. Down the middle column (top → bottom).
  for (const y of ROWS) pts.push({ x: middle, y });
  pts.push(b.middle);

  // 3. Around the bottom arc to the right column.
  for (const p of b.arc) pts.push(p);

  // 4. Up the right column (bottom → top) to the finish hole.
  pts.push(b.right);
  for (const y of [...ROWS].reverse()) pts.push({ x: right, y });

  return pts;
}

// Precompute each track once; it never changes.
const TRACK_PLAYER = track("player");
const TRACK_CPU = track("cpu");

/** Map a score (0–121) onto a hole, expressed as fractions of width/height. */
function spot(score: number, side: Side): { x: number; y: number } {
  const pts = side === "player" ? TRACK_PLAYER : TRACK_CPU;
  const s = Math.max(0, Math.min(score, WIN));
  const idx = Math.round((s / WIN) * (pts.length - 1));
  const p = pts[idx]!;
  return { x: p.x / IMG_W, y: p.y / IMG_H };
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
  const { x, y } = spot(score, side);
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
