const WIN = 121;

type Side = "player" | "cpu";
type Tone = "gold" | "ivory";

/** Map a score (0–121) onto a spot on the board image, expressed as fractions of width/height. */
function spot(score: number, side: Side): { x: number; y: number } {
  const s = Math.max(0, Math.min(score, WIN));
  const x = side === "player" ? 0.32 : 0.68;
  const y = 0.08 + (s / WIN) * 0.84;
  return { x, y };
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
  const fill = tone === "gold" ? "bg-gold" : "bg-ivory";
  const ring = tone === "gold" ? "ring-gold/70" : "ring-ivory/70";
  // Nudge the lag peg sideways so it stays visible alongside the front peg.
  const dx = lag ? (side === "player" ? -0.035 : 0.035) : 0;
  return (
    <span
      aria-hidden
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ${fill} ${ring} ${
        lag ? "size-2.5 opacity-60" : "size-3 shadow-md shadow-black/50"
      }`}
      style={{
        left: `${(x + dx) * 100}%`,
        top: `${y * 100}%`,
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
}: {
  graphic: string;
  playerScore: number;
  cpuScore: number;
  playerBack: number;
  cpuBack: number;
  opponentName: string;
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
            <span className="size-2.5 rounded-full bg-gold" /> You
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
