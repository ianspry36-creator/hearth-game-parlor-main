import type { GameId } from "@/lib/games";

/**
 * Flat vector icons, one per game, drawn in the parlour palette
 * (gold and ivory/cream, with coral and teal player accents on the
 * plum surface).
 */
export function GameIcon({ id, className = "" }: { id: GameId; className?: string }) {
  const common = { viewBox: "0 0 48 48", className, "aria-hidden": true } as const;

  switch (id) {
    case "cribbage":
      return (
        <svg {...common}>
          <rect x="4" y="14" width="40" height="20" rx="3" fill="currentColor" opacity="0.15" />
          <rect x="4" y="14" width="40" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          {[10, 17, 24, 31, 38].map((x) => (
            <g key={x}>
              <circle cx={x} cy="20" r="1.7" fill="currentColor" />
              <circle cx={x} cy="28" r="1.7" fill="currentColor" />
            </g>
          ))}
          <circle cx="17" cy="20" r="3" className="fill-player-coral" />
          <circle cx="31" cy="28" r="3" className="fill-player-teal" />
        </svg>
      );
    case "backgammon":
      return (
        <svg {...common}>
          <rect x="5" y="7" width="38" height="34" rx="3" fill="currentColor" opacity="0.12" />
          <rect x="5" y="7" width="38" height="34" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          {[9, 16, 23, 30, 37].map((x, i) => (
            <g key={x}>
              <path d={`M${x - 3} 7 L${x + 3} 7 L${x} 22 Z`} className={i % 2 ? "fill-player-coral/55" : "fill-player-teal/55"} />
              <path d={`M${x - 3} 41 L${x + 3} 41 L${x} 26 Z`} className={i % 2 ? "fill-player-teal/55" : "fill-player-coral/55"} />
            </g>
          ))}
        </svg>
      );
    case "warship":
      return (
        <svg {...common}>
          <path d="M6 28h36l-5 9H11z" className="fill-ivory/90" />
          <rect x="20" y="18" width="9" height="8" rx="1.5" className="fill-player-coral" />
          <path d="M24 18V8l10 4-10 3" className="fill-gold" />
          <path d="M4 40c4-2 7 2 11 0s7 2 11 0 7 2 11 0" fill="none" className="stroke-player-teal/80" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "farkle":
      return (
        <svg {...common}>
          <rect x="4" y="20" width="20" height="20" rx="4" className="fill-cream/90 stroke-gold" strokeWidth="2" />
          <rect x="24" y="8" width="20" height="20" rx="4" className="fill-cream/90 stroke-gold" strokeWidth="2" />
          <circle cx="14" cy="30" r="2.4" className="fill-player-coral" />
          <circle cx="30" cy="14" r="2.2" className="fill-player-teal" />
          <circle cx="38" cy="22" r="2.2" className="fill-player-teal" />
        </svg>
      );
    case "yahtzee":
      return (
        <svg {...common}>
          <rect x="7" y="7" width="34" height="34" rx="5" className="fill-cream/90 stroke-gold" strokeWidth="2" />
          {[16, 24, 32].map((x) =>
            [16, 24, 32].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" className="fill-player-coral" />),
          )}
        </svg>
      );
    case "crazy-eights":
      return (
        <svg {...common}>
          <rect x="6" y="12" width="20" height="27" rx="3" className="fill-player-coral/25 stroke-player-coral" strokeWidth="2" transform="rotate(-12 16 26)" />
          <rect x="22" y="9" width="20" height="27" rx="3" className="fill-player-teal/25 stroke-player-teal" strokeWidth="2" transform="rotate(10 32 23)" />
          <text x="31" y="28" textAnchor="middle" fontSize="15" fontWeight="700" className="fill-cream">
            8
          </text>
        </svg>
      );
    case "triangles":
      return (
        <svg {...common}>
          <path d="M24 8 40 38H8z" className="fill-gold/15 stroke-gold" strokeWidth="2" strokeLinejoin="round" />
          <path d="M16 23h16M24 8l8 15M24 8l-8 15" fill="none" className="stroke-gold/60" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="24" cy="8" r="2.2" className="fill-player-coral" />
          <circle cx="8" cy="38" r="2.2" className="fill-player-teal" />
          <circle cx="40" cy="38" r="2.2" className="fill-gold" />
        </svg>
      );
    case "solitaire":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="18" height="26" rx="3" className="fill-ivory/20 stroke-gold" strokeWidth="2" transform="rotate(-8 14 24)" />
          <rect x="17" y="7" width="21" height="27" rx="3" className="fill-cream/95" strokeWidth="2" />
          <text x="27.5" y="19" textAnchor="middle" fontSize="12" fontWeight="700" className="fill-red-500">
            ♥
          </text>
          <text x="27.5" y="31" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-brand">
            K
          </text>
          <rect x="32" y="34" width="6" height="8" rx="1" fill="none" className="stroke-gold" strokeWidth="1.5" opacity="0.5" />
          <rect x="39" y="34" width="6" height="8" rx="1" fill="none" className="stroke-gold" strokeWidth="1.5" opacity="0.5" />
        </svg>
      );
    case "freecell":
      return (
        <svg {...common}>
          <rect x="6" y="15" width="20" height="27" rx="3" className="fill-cream/95 stroke-gold" strokeWidth="2" />
          <text x="16" y="34" textAnchor="middle" fontSize="14" fontWeight="700" className="fill-brand">
            ♠
          </text>
          <rect x="22" y="7" width="14" height="14" rx="2" fill="none" className="stroke-player-teal" strokeWidth="2" strokeDasharray="3 2" opacity="0.9" />
          <rect x="33" y="30" width="14" height="14" rx="2" fill="none" className="stroke-player-teal" strokeWidth="2" strokeDasharray="3 2" opacity="0.6" />
        </svg>
      );
    case "reversi":
      return (
        <svg {...common}>
          <rect x="6" y="6" width="36" height="36" rx="3" className="fill-gold/15 stroke-gold" strokeWidth="2" />
          <circle cx="18" cy="18" r="6" className="fill-player-coral" />
          <circle cx="30" cy="30" r="6" className="fill-player-teal" />
          <circle cx="30" cy="18" r="6" fill="none" className="stroke-player-teal" strokeWidth="3" />
          <circle cx="18" cy="30" r="6" fill="none" className="stroke-player-coral" strokeWidth="3" />
        </svg>
      );
    default:
      return null;
  }
}
