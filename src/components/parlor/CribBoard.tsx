const HOLES = 120;
const PER_ROW = 5;
const ROWS = HOLES / PER_ROW;

type LaneProps = {
  label: string;
  front: number;
  back: number;
  tone: "gold" | "ivory";
};

function Lane({ label, front, back, tone }: LaneProps) {
  const pegColor = tone === "gold" ? "bg-gold" : "bg-ivory";
  const ringColor = tone === "gold" ? "ring-gold/60" : "ring-ivory/60";
  const frontHole = Math.min(front, HOLES);
  const backHole = Math.min(back, HOLES);

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ivory/60">{label}</p>
      <div className="rounded-md bg-brand/70 p-1.5 ring-1 ring-gold/25">
        <div className="flex flex-col gap-[3px]">
          {Array.from({ length: ROWS }).map((_, row) => (
            <div key={row} className="flex gap-[3px]">
              {Array.from({ length: PER_ROW }).map((_, col) => {
                const hole = row * PER_ROW + col + 1;
                const isFront = hole === frontHole;
                const isBack = hole === backHole && backHole !== frontHole;
                return (
                  <span
                    key={col}
                    className={`size-[5px] rounded-full ${
                      isFront
                        ? `${pegColor} ring-2 ${ringColor}`
                        : isBack
                          ? `${pegColor} opacity-60`
                          : "bg-black/45"
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <span
        className={`size-2 rounded-full ${front >= 121 ? `${pegColor} ring-2 ${ringColor}` : "bg-black/45"}`}
        title="Game hole"
      />
    </div>
  );
}

export function CribBoard({
  playerScore,
  cpuScore,
  playerBack,
  cpuBack,
  opponentName,
}: {
  playerScore: number;
  cpuScore: number;
  playerBack: number;
  cpuBack: number;
  opponentName: string;
}) {
  return (
    <div className="rounded-xl border border-gold/20 bg-surface/60 p-4">
      <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-ivory/60">The board</p>
      <div className="flex justify-center gap-4">
        <Lane label="You" front={playerScore} back={playerBack} tone="gold" />
        <Lane label={opponentName} front={cpuScore} back={cpuBack} tone="ivory" />
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
