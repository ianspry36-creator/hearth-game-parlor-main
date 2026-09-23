import { earthUrl, flagName, flagUrl } from "@/lib/flags";

/**
 * A player's flag badge. When no flag has been chosen an earth/globe icon is
 * shown in its place, so every seat always renders a consistent badge. When an
 * `onClick` handler is supplied the badge becomes a button that opens the flag
 * picker (used for the local player's own flag in game).
 */
export function PlayerFlag({
  flag,
  className = "size-5",
  onClick,
  hide = false,
}: {
  flag: string | null;
  className?: string;
  onClick?: () => void;
  /** When true, render nothing (e.g. a bot with no country, rather than the globe placeholder). */
  hide?: boolean;
}) {
  if (hide) return null;
  const src = flag ? flagUrl(flag) : earthUrl();
  const alt = flag ? (flagName(flag) ?? "") : "No flag chosen";
  const img = (
    <img
      src={src}
      alt={alt}
      title={alt}
      className={`${className} shrink-0 rounded-sm border border-black/20 object-cover align-middle shadow-sm shadow-black/30`}
    />
  );
  if (!onClick) return img;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Choose your flag"
      title="Choose your flag"
      className="shrink-0 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      {img}
    </button>
  );
}
