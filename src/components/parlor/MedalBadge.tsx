import { medalForStreak, type MedalTier } from "@/lib/medals";

const MEDALS: Record<Exclude<MedalTier, "none">, { icon: string; label: string }> = {
  bronze: { icon: "🥉", label: "Bronze medal — 3 completed online games" },
  silver: { icon: "🥈", label: "Silver medal — 7 completed online games" },
  gold: { icon: "🥇", label: "Gold medal — 12 completed online games" },
};

/** Completed games required to earn the first (bronze) medal. */
const BRONZE_AT = 3;

/**
 * A badge pinned to the top-right of a player's avatar. Shows the medal for
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
        className="absolute -right-1.5 -top-1.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface text-sm leading-none shadow ring-1 ring-gold/40"
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
      className="absolute -right-1.5 -top-1.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface font-display text-xs leading-none text-ivory/80 shadow ring-1 ring-gold/40"
    >
      {streak}
    </span>
  );
}
