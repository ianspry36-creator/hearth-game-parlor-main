/** The seconds left on a player's turn clock, shown centred over their avatar. */
export function CountdownBadge({ seconds }: { seconds: number }) {
  return (
    <div
      aria-label={`${seconds} seconds remaining`}
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-full bg-black/60 text-xl font-bold text-white"
    >
      {seconds}
    </div>
  );
}
