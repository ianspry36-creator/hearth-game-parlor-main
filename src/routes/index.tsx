import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GAMES } from "@/lib/games";
import { useFavourites } from "@/lib/favourites";
import { GameIcon } from "@/components/parlor/GameIcon";
import { CardMark } from "@/components/parlor/CardMark";
import { VisitorCounter } from "@/components/parlor/VisitorCounter";
import { Switch } from "@/components/ui/switch";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cards and Games — Play Cribbage, Backgammon & More" },
      {
        name: "description",
        content:
          "Cards and Games is a warm little parlour of classics. Play cribbage, backgammon, crazy eights, yahtzee, farkle, warship, triangles, solitaire, freecell, addiction, reversi, checkers, kings in the corner, canfield, clock, scorpion, tri peaks or yukon solitaire against Ada, a human opponent, or the deck.",
      },
      { property: "og:title", content: "Cards and Games — Play Cribbage, Backgammon & More" },
      {
        property: "og:description",
        content:
          "Eighteen classic games, played against Ada, a real human from the waiting room, or the deck.",
      },
    ],
  }),
  component: Lobby,
});

function Lobby() {
  const navigate = useNavigate();
  const { favourites, hydrated, isFavourite, toggleFavourite } = useFavourites();
  const [showFavourites, setShowFavourites] = useState(false);
  const hasFavourites = favourites.size > 0;
  const visibleGames = showFavourites ? GAMES.filter((game) => isFavourite(game.id)) : GAMES;

  useEffect(() => {
    if (hydrated && !hasFavourites) setShowFavourites(false);
  }, [hydrated, hasFavourites]);

  return (
    <div className="min-h-screen bg-brand text-cream">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70"
        style={{
          background:
            "radial-gradient(60% 70% at 50% 0%, color-mix(in oklab, var(--gold) 26%, transparent), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-8">
        <header className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-full bg-gold text-brand">
              <CardMark className="size-6" />
            </div>
            <div>
              <p className="font-display text-2xl font-bold leading-none tracking-tight">
                Cards and Games
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.32em] text-gold/80">
                Play the classics
              </p>
            </div>
          </div>
        </header>

        <section className="mt-14 text-center">
          <p className="text-[11px] uppercase tracking-[0.36em] text-gold">
            Eighteen tables, always open
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-5xl font-bold leading-[1.02] tracking-tight md:text-7xl">
            The games you love,
            <br />
            <span className="text-gold">completely free.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ivory/70">
            Pick a table and play straight away — against Ada, or against a real person
            in the multiplayer waiting room. No fuss and totally free.
          </p>
        </section>

        <section id="tables" className="mt-20">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b border-gold/15 pb-4">
            <h2 className="font-display text-3xl font-bold">Choose your table</h2>
            <div className="flex flex-wrap items-center gap-4">
              <label
                htmlFor="favourites-filter"
                className="flex cursor-pointer select-none items-center gap-2.5"
              >
                <Switch
                  id="favourites-filter"
                  checked={showFavourites}
                  onCheckedChange={(checked) => setShowFavourites(checked)}
                  disabled={hydrated && !hasFavourites}
                />
                <span className="text-xs uppercase tracking-[0.16em] text-ivory/60">Favourites</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {visibleGames.map((game) => {
              const fav = isFavourite(game.id);
              return (
                <div
                  key={game.id}
                  className="group relative flex flex-col items-center rounded-2xl border border-gold/20 bg-surface/45 p-5 text-center transition-all hover:-translate-y-0.5 hover:border-gold/55 hover:bg-surface/65"
                >
                  <button
                    type="button"
                    onClick={() => toggleFavourite(game.id)}
                    aria-pressed={fav}
                    aria-label={
                      fav
                        ? `Remove ${game.name} from favourites`
                        : `Add ${game.name} to favourites`
                    }
                    title={fav ? "Remove from favourites" : "Add to favourites"}
                    className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full transition-colors hover:bg-gold/15"
                  >
                    <Heart
                      className={fav ? "size-4 text-gold" : "size-4 text-ivory/40"}
                      fill={fav ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        to: game.path,
                        search: { opponent: undefined, match: undefined },
                      })
                    }
                    className="flex w-full flex-col items-center"
                  >
                    <div className="grid size-14 place-items-center rounded-2xl border border-gold/25 bg-gold/12 text-gold transition-colors group-hover:bg-gold/20">
                      <GameIcon id={game.id} className="size-9" />
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <h3 className="font-display text-xl font-bold">{game.name}</h3>
                      {game.beta && (
                        <span className="rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
                          Beta
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}

            <div className="grid place-items-center rounded-2xl border border-dashed border-gold/20 bg-surface/20 p-6 text-center">
              <div>
                <CardMark className="mx-auto mb-3 size-6 text-gold/40" />
                <p className="text-[11px] uppercase tracking-[0.3em] text-gold/55">Coming soon</p>
                <p className="mt-1 font-display text-xl text-ivory/40">More tables in the works</p>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-16 border-t border-gold/12 pt-6 text-center text-[11px] uppercase tracking-[0.28em] text-ivory/30">
          <p>Cards and Games 3.3</p>
          <VisitorCounter />
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link
              to="/about"
              className="text-ivory/50 transition-colors hover:text-gold"
            >
              About
            </Link>
            <span className="text-ivory/25">·</span>
            <Link
              to="/privacy"
              className="text-ivory/50 transition-colors hover:text-gold"
            >
              Privacy
            </Link>
            <span className="text-ivory/25">·</span>
            <Link
              to="/contact"
              className="text-ivory/50 transition-colors hover:text-gold"
            >
              Contact
            </Link>
            <span className="hidden text-ivory/25 sm:inline">·</span>
            <Link
              to="/future-improvements"
              className="w-full text-center text-ivory/50 transition-colors hover:text-gold sm:w-auto"
            >
              Future improvements
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
