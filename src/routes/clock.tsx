import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RulesDialog } from "@/components/parlor/RulesDialog";
import { getGame } from "@/lib/games";
import { FavouriteSwitch } from "@/components/parlor/FavouriteSwitch";
import { StatisticsDialog } from "@/components/parlor/StatisticsDialog";
import { useSolitaireStats } from "@/lib/solitaireStats";
import { CardMark } from "@/components/parlor/CardMark";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import { flip, freshGame, slotLabel, type GameState, type ClockPile } from "@/lib/clock";
import { mulberry32 } from "@/lib/random";
import cardBackAsset from "@/assets/card-back.png";

export const Route = createFileRoute("/clock")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Clock Solitaire — Cards and Games" },
      {
        name: "description",
        content:
          "Clock solitaire in the parlour: deal the deck around the clock and lay every card at its own hour before the fourth King tolls.",
      },
      { property: "og:title", content: "Play Clock Solitaire — Cards and Games" },
      {
        property: "og:description",
        content: "A game of chance dealt fresh around the clock — win about one hand in thirteen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClockTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20260906;

const WINS_KEY = "clock-wins";
const BEST_TIME_KEY = "clock-best-time";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

// The twelve hour positions, laid out as percentages around the clock face
// (1 o'clock at top-right through 12 o'clock at the top). Slot 12 — the Kings —
// sits in the centre and is positioned separately.
const SLOT_POSITIONS = Array.from({ length: 12 }, (_, i) => {
  const angle = ((i + 1) * Math.PI) / 6;
  const x = 50 + 39 * Math.sin(angle);
  const y = 50 - 39 * Math.cos(angle);
  return { left: `${x}%`, top: `${y}%` } as const;
});

function ClockTable() {
  const navigate = useNavigate();
  const game = getGame("clock");
  const [state, setState] = useState<GameState>(() => freshGame(mulberry32(SSR_SEED)));
  const [auto, setAuto] = useState(false);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const { recordResult } = useSolitaireStats(game.id);
  const prevWonRef = useRef(false);
  useEffect(() => {
    if (state.won && !prevWonRef.current) recordResult("win");
    prevWonRef.current = state.won;
  }, [state.won, recordResult]);
  const prevLostRef = useRef(false);
  useEffect(() => {
    if (state.lost && !prevLostRef.current) recordResult("loss");
    prevLostRef.current = state.lost;
  }, [state.lost, recordResult]);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Timer bookkeeping.
  const [elapsed, setElapsed] = useState(0);
  const [finishedElapsed, setFinishedElapsed] = useState<number | null>(null);
  const startRef = useRef(0);
  const endedRef = useRef(false);

  // Lifetime wins and best winning time, loaded from local storage once.
  const [wins, setWins] = useState(0);
  const [bestTime, setBestTime] = useState(0);

  useEffect(() => {
    setState(freshGame());
    setAuto(false);
    setElapsed(0);
    setFinishedElapsed(null);
    startRef.current = Date.now();
    endedRef.current = false;

    const id = window.setInterval(() => {
      if (!endedRef.current) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);

    try {
      setWins(Number(localStorage.getItem(WINS_KEY) || 0));
      setBestTime(Number(localStorage.getItem(BEST_TIME_KEY) || 0));
    } catch {
      // local storage unavailable; ignore
    }

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const over = state.won || state.lost;
    endedRef.current = over;
    if (over && finishedElapsed === null) {
      setFinishedElapsed(elapsed);
      setAuto(false);
      if (state.won) {
        try {
          const nextWins = Number(localStorage.getItem(WINS_KEY) || 0) + 1;
          localStorage.setItem(WINS_KEY, String(nextWins));
          const priorBest = Number(localStorage.getItem(BEST_TIME_KEY) || 0);
          const nextBest = priorBest === 0 || elapsed < priorBest ? elapsed : priorBest;
          localStorage.setItem(BEST_TIME_KEY, String(nextBest));
          setWins(nextWins);
          setBestTime(nextBest);
        } catch {
          // ignore
        }
      }
    }
  }, [state.won, state.lost, finishedElapsed, elapsed]);

  // Auto-play: flip a card every tick until the clock has struck.
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      const current = stateRef.current;
      if (current.won || current.lost || current.active < 0) {
        setAuto(false);
        return;
      }
      setState(flip(current));
    }, 350);
    return () => window.clearInterval(id);
  }, [auto]);

  const shownElapsed = finishedElapsed ?? elapsed;

  const doFlip = () => {
    const current = stateRef.current;
    if (current.won || current.lost || current.active < 0) return;
    setState(flip(current));
  };

  const reset = () => {
    setState(freshGame());
    setAuto(false);
    setFinishedElapsed(null);
    setElapsed(0);
    startRef.current = Date.now();
    endedRef.current = false;
  };

  const gameInProgress = state.revealed > 0 && !state.won && !state.lost;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : reset());
  const confirmHome = () => (gameInProgress ? setConfirming("home") : void navigate({ to: "/" }));

  return (
    <div className="min-h-screen bg-brand text-cream">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              aria-label="Cards and Games home"
              className="grid size-10 place-items-center rounded-full bg-gold text-brand transition-colors hover:bg-gold-bright"
            >
              <CardMark className="size-5" />
            </Link>
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-gold">Now on the table</p>
              <h1 className="font-display text-2xl font-bold leading-tight">Clock Solitaire</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={confirmHome}
              className="cursor-pointer bg-transparent text-xs uppercase tracking-[0.2em] text-ivory/50 transition-colors hover:text-gold"
            >
              ← BACK TO THE GAME ROOM
            </button>
            <FavouriteSwitch gameId="clock" />
            <StatisticsDialog
              game={game}
              trigger={
                <button
                  type="button"
                  className="cursor-pointer bg-transparent text-xs uppercase tracking-[0.2em] text-ivory/50 transition-colors hover:text-gold"
                >
                  Statistics
                </button>
              }
            />
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-center gap-6 border-y border-gold/15 py-4 text-center">
          <Stat label="Cards laid" value={`${state.revealed} / 52`} />
          <Stat label="Time" value={formatElapsed(shownElapsed)} />
          <Stat label="Wins" value={String(wins)} />
          <Stat label="Best time" value={bestTime > 0 ? formatElapsed(bestTime) : "—"} />
        </div>

        <div className="relative mt-8 rounded-2xl border border-gold/15 bg-surface/40 p-4 sm:p-6">
          <ClockFace state={state} onFlip={doFlip} />

          <p className="mt-6 text-center text-xs text-ivory/50">
            Turn the {slotLabel(state.active >= 0 ? state.active : 12)} pile next — lay each card at
            its own hour. The fourth King ends the hand.
          </p>

          {state.won && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
              <div className="space-y-4 text-center">
                <div className="text-5xl">🎉</div>
                <h2 className="font-display text-3xl font-bold text-gold">The clock is set!</h2>
                <p className="mx-auto max-w-sm text-ivory/70">
                  All fifty-two cards found their hour before the fourth King struck.
                </p>
                <Button variant="parlor" onClick={reset}>
                  Deal again
                </Button>
              </div>
            </div>
          )}

          {state.lost && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
              <div className="space-y-4 text-center">
                <div className="text-5xl">⏰</div>
                <h2 className="font-display text-3xl font-bold text-gold">The fourth King struck!</h2>
                <p className="mx-auto max-w-sm text-ivory/70">
                  You laid {state.revealed} cards before the clock tolled. Only about one hand in
                  thirteen is won.
                </p>
                <Button variant="parlor" onClick={reset}>
                  Deal again
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 border-t border-gold/15 pt-4 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="parlor" onClick={confirmReset} className="scale-75 sm:scale-100">
              New game
            </Button>
            <RulesDialog
              game={game}
              trigger={
                <Button variant="parlorOutline" className="scale-75 sm:scale-100">
                  How to Play
                </Button>
              }
            />
            <Button
              variant="parlor"
              onClick={doFlip}
              disabled={state.won || state.lost}
              className="scale-75 sm:scale-100"
            >
              Flip next
            </Button>
            <button
              type="button"
              onClick={() => setAuto((a) => !a)}
              disabled={state.won || state.lost}
              className="cursor-pointer rounded-full border border-gold/30 px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-ivory/70 transition-colors hover:text-gold disabled:cursor-default disabled:opacity-40"
            >
              Auto {auto ? "on" : "off"}
            </button>
          </div>
          <p className="text-xs text-ivory/40">
            Click the glowing pile — or Flip next — to turn one card at a time.
          </p>
        </div>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(next) => !next && setConfirming(null)}>
        <AlertDialogContent className="border-gold/25 bg-brand text-cream">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">
              Game in progress. Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/65">
              {confirming === "home"
                ? "Leaving for the game room will abandon the hand you're playing."
                : "Starting a new game will abandon the hand you're playing."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming === "home") void navigate({ to: "/" });
                else if (confirming === "new") reset();
                setConfirming(null);
              }}
            >
              Yes, leave the game
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-[0.2em] text-ivory/45">{label}</span>
      <span className="font-display text-xl font-bold leading-tight">{value}</span>
    </div>
  );
}

function ClockFace({ state, onFlip }: { state: GameState; onFlip: () => void }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[560px]">
      <div className="absolute inset-4 rounded-full border border-gold/15" />
      {state.piles.slice(0, 12).map((pile, slot) => (
        <div
          key={slot}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={SLOT_POSITIONS[slot]}
        >
          <ClockSlot
            slot={slot}
            pile={pile}
            isActive={state.active === slot}
            onFlip={onFlip}
          />
        </div>
      ))}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <ClockSlot
          slot={12}
          pile={state.piles[12]!}
          isActive={state.active === 12}
          onFlip={onFlip}
        />
      </div>
    </div>
  );
}

function ClockSlot({
  slot,
  pile,
  isActive,
  onFlip,
}: {
  slot: number;
  pile: ClockPile;
  isActive: boolean;
  onFlip: () => void;
}) {
  const faceDown = pile.faceDown.length;
  const top = pile.faceUp[pile.faceUp.length - 1];
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onFlip}
        disabled={!isActive}
        aria-label={`${slotLabel(slot)} pile`}
        className={`relative block transition-transform ${
          isActive ? "scale-110 cursor-pointer" : "cursor-default"
        }`}
      >
        {faceDown > 0 && (
          <div className="absolute -left-1 -top-1 z-0 opacity-60">
            <ClockCardBack />
          </div>
        )}
        <div className="relative z-10">
          {top ? <ClockCardFace card={top} /> : <EmptySlot />}
        </div>
        {isActive && (
          <span className="absolute -inset-1 z-20 rounded-md ring-2 ring-gold animate-gentle-flash" />
        )}
        {faceDown > 0 && (
          <span className="absolute -bottom-1 -right-1 z-20 grid size-4 place-items-center rounded-full bg-brand text-[9px] font-bold text-cream ring-1 ring-gold/50">
            {faceDown}
          </span>
        )}
      </button>
      <span
        className={`text-[10px] font-bold uppercase tracking-wider ${
          isActive ? "text-gold" : "text-ivory/50"
        }`}
      >
        {slotLabel(slot)}
      </span>
    </div>
  );
}

function ClockCardFace({ card }: { card: Card }) {
  const red = card.suit === "H" || card.suit === "D";
  return (
    <div
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--clock-card-h)] w-[var(--clock-card-w)] select-none rounded-md border border-black/10 bg-white text-left shadow-md shadow-black/30 ${
        red ? "text-[#c0392b]" : "text-brand"
      }`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-[8px] font-bold leading-none">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[7px]">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-sm">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  );
}

function ClockCardBack() {
  return (
    <div
      aria-label="Face-down card"
      className="block h-[var(--clock-card-h)] w-[var(--clock-card-w)] overflow-hidden rounded-md shadow-md shadow-black/30"
    >
      <img src={cardBackAsset} alt="" aria-hidden className="h-full w-full object-cover" />
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="grid h-[var(--clock-card-h)] w-[var(--clock-card-w)] place-items-center rounded-md border border-dashed border-gold/30 text-gold/30" />
  );
}



