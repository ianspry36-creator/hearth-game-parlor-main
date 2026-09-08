import { Switch } from "@/components/ui/switch";
import { useFavourites } from "@/lib/favourites";
import type { GameId } from "@/lib/games";

/** Slider toggle for marking a single game as a favourite. */
export function FavouriteSwitch({ gameId }: { gameId: GameId }) {
  const { isFavourite, toggleFavourite } = useFavourites();
  const id = `favourite-${gameId}`;

  return (
    <label htmlFor={id} className="flex cursor-pointer select-none items-center gap-2.5">
      <span className="text-xs uppercase tracking-[0.2em] text-ivory/50">Favourite</span>
      <Switch id={id} checked={isFavourite(gameId)} onCheckedChange={() => toggleFavourite(gameId)} />
    </label>
  );
}
