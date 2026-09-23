import { medalForStreak, type MedalTier } from "@/lib/medals";

const MEDALS: Record<Exclude<MedalTier, "none">, { icon: string; label: string }> = {
  bronze: { icon: "🥉", label: "Bronze medal — 3 completed online games" },
  silver: { icon: "🥈", label: "Silver medal — 7 completed online games" },
  gold: { icon: "🥇", label: "Gold medal — 12 completed online games" },
};

/** Completed games required to earn the first (bronze) medal. */
const BRONZE_AT = 3;

/**
 * A badge pinned to the bottom-centre of a player's avatar. Shows the medal for
 * players who have earned one, otherwise a count of finished games as they
 * work toward bronze.
 */
export function MedalBadge({ streak }: { streak: number }) {
  const tier = medalForStreak(streak);

  if (tier !== "none") {
    const medal = MEDALS[tier];
    return (
      <span
        title={medal.label}
        aria-label={medal.label}
        className="absolute -bottom-7 left-1/2 grid size-14 -translate-x-1/2 place-items-center text-4xl leading-none drop-shadow scale-75"
      >
        {medal.icon}
      </span>
    );
  }

  const remaining = BRONZE_AT - streak;
  const label = `${streak} completed online game${streak === 1 ? "" : "s"} — ${remaining} more for bronze`;
  return (
    <span
      title={label}
      aria-label={label}
      className="absolute -bottom-7 left-1/2 grid size-14 -translate-x-1/2 place-items-center font-display text-3xl leading-none text-ivory drop-shadow scale-75"
    >
      {streak}
    </span>
  );
}
