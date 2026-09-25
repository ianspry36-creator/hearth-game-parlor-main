import { medalForStreak, type MedalTier } from "@/lib/medals";

const MEDALS: Record<Exclude<MedalTier, "none">, { icon: string; label: string }> = {
  bronze: { icon: "🥉", label: "Bronze" },
  silver: { icon: "🥈", label: "Silver" },
  gold: { icon: "🥇", label: "Gold" },
};

/**
 * A badge pinned to the bottom-centre of a player's avatar showing the medal
 * they've earned. Players still working toward bronze get no badge at all.
 */
export function MedalBadge({ streak }: { streak: number }) {
  const tier = medalForStreak(streak);

  if (tier === "none") return null;

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
