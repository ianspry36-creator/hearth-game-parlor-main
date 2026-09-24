import { medalForStreak, type MedalTier } from "@/lib/medals";

const MEDALS: Record<Exclude<MedalTier, "none">, { icon: string; label: string }> = {
  bronze: { icon: "🥉", label: "Bronze" },
  silver: { icon: "🥈", label: "Silver" },
  gold: { icon: "🥇", label: "Gold" },
};

/** Completed games required to earn the first (bronze) medal. */
const BRONZE_AT = 3;

/**
 * A badge pinned to the bottom-centre of a player's avatar. Shows the medal for
 * players who have earned one, otherwise a count of finished games as they work
 * toward bronze. The raw counter is only shown for the developer's own account
 * (nickname "spry123456"); everyone else sees just the medal icon.
 */
export function MedalBadge({ streak, nickname }: { streak: number; nickname?: string }) {
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

  // Hide the raw "games toward bronze" counter for everyone but the developer.
  if ((nickname ?? "").toLowerCase() !== "spry123456") return null;

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
