import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GAMES } from "@/lib/games";
import { getNickname } from "@/lib/multiplayer";

// A compact, site-wide footer shown on every game table. It lists the other
// tables left-to-right so a player can hop straight to a different game.
export function GameNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [isOwner, setIsOwner] = useState(false);

  // Resolve owner-only access on the client so SSR and hydration stay in sync.
  useEffect(() => {
    setIsOwner((getNickname() ?? "").toLowerCase() === "spry123456");
  }, []);

  // Only render on a recognised game route.
  const current = GAMES.find((game) => game.path === pathname);
  if (!current) return null;

  const others = GAMES.filter(
    (game) => game.id !== current.id && !game.comingSoon && (!game.ownerOnly || isOwner),
  );
  if (others.length === 0) return null;

  return (
    <footer className="border-t border-gold/15 px-6 py-6">
      <div className="mx-auto max-w-6xl">
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="text-sm font-semibold text-gold transition-colors hover:text-ivory"
          >
            Home
          </button>
          {others.map((game) => (
            <button
              key={game.id}
              type="button"
              onClick={() =>
                navigate({ to: game.path, search: { opponent: undefined, match: undefined } })
              }
              className="text-sm text-cream transition-colors hover:text-gold"
            >
              {game.name}
            </button>
          ))}
        </nav>
      </div>
    </footer>
  );
}
