/** A small red badge showing seconds left on a player's turn clock. */
export function CountdownBadge({ seconds }: { seconds: number }) {
  return (
    <div
      aria-label={`${seconds} seconds remaining`}
      className="pointer-events-none absolute -top-1 -right-1 grid size-7 place-items-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md ring-2 ring-brand"
    >
      {seconds}
    </div>
  );
}
