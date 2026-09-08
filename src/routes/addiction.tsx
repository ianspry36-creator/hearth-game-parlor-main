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
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card, type Suit } from "@/lib/cribbage";
import {
  freshGame,
  isCorrect,
  legalTargets,
  moveCard,
  shuffleBoard,
  shufflesRemaining,
  type GameState,
  type Position,
} from "@/lib/addiction";
import { mulberry32 } from "@/lib/random";

export const Route = createFileRoute("/addiction")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Addiction — Cards and Games" },
      {
        name: "description",
        content:
          "Addiction solitaire in the parlour: order four rows of a single suit from two to king, one careful card at a time.",
      },
      { property: "og:title", content: "Play Addiction — Cards and Games" },
      {
        property: "og:description",
        content: "A patient game of Addiction solitaire, dealt fresh every hand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AddictionTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20260906;

const isRed = (suit: Suit) => suit === "H" || suit === "D";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

const BEST_MOVES_KEY = "addiction-best-moves";
const BEST_TIME_KEY = "addiction-best-time";

type Best = { moves: number; time: number };

function AddictionTable() {
  const navigate = useNavigate();
  const game = getGame("addiction");
  const [state, setState] = useState<GameState>(() => freshGame(mulberry32(SSR_SEED)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<Position | null>(null);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const { recordResult } = useSolitaireStats(game.id);
  const prevWonRef = useRef(false);
  useEffect(() => {
    if (state.won && !prevWonRef.current) recordResult("win");
    prevWonRef.current = state.won;
  }, [state.won, recordResult]);

  // Timer bookkeeping.
  const [elapsed, setElapsed] = useState(0);
  const [finishedElapsed, setFinishedElapsed] = useState<number | null>(null);
  const startRef = useRef(0);
  const wonRef = useRef(false);

  // Best scores, loaded from local storage once on the client.
  const [best, setBest] = useState<Best>({ moves: 0, time: 0 });

  useEffect(() => {
    setState(freshGame());
    setHistory([]);
    setSelection(null);
    setFinishedElapsed(null);
    setElapsed(0);
    startRef.current = Date.now();
    wonRef.current = false;

    const id = window.setInterval(() => {
      if (!wonRef.current) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);

    try {
      const moves = Number(localStorage.getItem(BEST_MOVES_KEY) || 0);
      const time = Number(localStorage.getItem(BEST_TIME_KEY) || 0);
      setBest({ moves: moves > 0 ? moves : 0, time: time > 0 ? time : 0 });
    } catch {
      // local storage unavailable; ignore
    }

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    wonRef.current = state.won;
    if (state.won && finishedElapsed === null) {
      setFinishedElapsed(elapsed);
      try {
        const bestMoves = Number(localStorage.getItem(BEST_MOVES_KEY) || 0);
        const bestTime = Number(localStorage.getItem(BEST_TIME_KEY) || 0);
        const newMoves = bestMoves === 0 || state.moves < bestMoves ? state.moves : bestMoves;
        const newTime = bestTime === 0 || elapsed < bestTime ? elapsed : bestTime;
        localStorage.setItem(BEST_MOVES_KEY, String(newMoves));
        localStorage.setItem(BEST_TIME_KEY, String(newTime));
        setBest({ moves: newMoves, time: newTime });
      } catch {
        // ignore
      }
    }
  }, [state.won, finishedElapsed, elapsed, state.moves]);

  const shownElapsed = finishedElapsed ?? elapsed;

  const targets = selection ? legalTargets(state.board, selection) : [];
  const targetSet = new Set(targets.map((t) => `${t.row}:${t.col}`));

  const apply = (candidate: GameState) => {
    if (candidate === state) return;
    setHistory((h) => [...h, state]);
    setSelection(null);
    setState(candidate);
  };

  const reset = () => {
    setState(freshGame());
    setHistory([]);
    setSelection(null);
    setFinishedElapsed(null);
    setElapsed(0);
    startRef.current = Date.now();
    wonRef.current = false;
  };

  const gameInProgress = state.moves > 0;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : reset());
  const confirmHome = () => (gameInProgress ? setConfirming("home") : void navigate({ to: "/" }));

  const undo = () => {
    if (history.length === 0 || state.won) return;
    const prev = history[history.length - 1]!;
    setState(prev);
    setHistory(history.slice(0, -1));
    setSelection(null);
  };

  const shuffle = () => {
    const next = shuffleBoard(state);
    if (next !== state) apply(next);
  };

  const clickSlot = (pos: Position) => {
    const card = state.board[pos.row]?.[pos.col];

    if (selection) {
      if (selection.row === pos.row && selection.col === pos.col) {
        setSelection(null);
        return;
      }
      const moved = moveCard(state, selection, pos);
      if (moved !== state) {
        apply(moved);
      } else if (card) {
        setSelection(pos);
      } else {
        setSelection(null);
      }
      return;
    }

    if (card) setSelection(pos);
  };

  const remaining = shufflesRemaining(state);

  return (
    <div className="min-h-screen bg-brand text-cream">
      <div className="mx-auto max-w-6xl px-6 py-8">
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
              <h1 className="font-display text-2xl font-bold leading-tight">Addiction</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={confirmHome}
              className="cursor-pointer bg-transparent text-xs uppercase tracking-[0.2em] text-ivory/50 transition-colors hover:text-gold"
            >
              ← Back to the game room
            </button>
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_260px]">
          <div className="relative rounded-2xl border border-gold/20 bg-surface/40 p-4 sm:p-8">
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center">
                <Stat label="Moves" value={String(state.moves)} />
                <Stat label="Time" value={formatElapsed(shownElapsed)} />
                <Stat label="Shuffles left" value={String(remaining)} />
                <Stat label="Best time" value={best.time > 0 ? formatElapsed(best.time) : "—"} />
                <Stat label="Best moves" value={best.moves > 0 ? String(best.moves) : "—"} />
              </div>

              <div className="overflow-x-auto">
                <div className="mx-auto flex w-max flex-col gap-1.5 sm:gap-2">
                  {state.board.map((row, r) => (
                    <div key={r} className="flex gap-1 sm:gap-1.5">
                      {row.map((card, c) => {
                        const pos = { row: r, col: c };
                        const selected = selection?.row === r && selection?.col === c;
                        const isTarget = targetSet.has(`${r}:${c}`);
                        const correct = card !== null && isCorrect(state.board, r, c);
                        return (
                          <CardCell
                            key={c}
                            card={card}
                            selected={selected}
                            isTarget={isTarget}
                            correct={correct}
                            onClick={() => clickSlot(pos)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-3 border-t border-gold/15 pt-4 text-center">
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    variant="parlorOutline"
                    onClick={shuffle}
                    disabled={remaining === 0 || state.won}
                    className="scale-90 sm:scale-100"
                  >
                    Shuffle{remaining > 0 ? ` (${remaining} left)` : ""}
                  </Button>
                </div>
                <span className="text-xs uppercase tracking-[0.2em] text-ivory/40">
                  Four rows · Thirteen slots · One suit each
                </span>
              </div>
            </div>

            {state.won && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/85 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🎉</div>
                  <h2 className="font-display text-3xl font-bold text-gold">You solved it!</h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    Every suit lined up two through king in {state.moves} moves and{" "}
                    {formatElapsed(finishedElapsed ?? elapsed)}.
                    {best.moves > 0 && state.moves <= best.moves && (
                      <> That's your best move count yet!</>
                    )}
                  </p>
                  <Button variant="parlor" onClick={reset}>
                    Deal again
                  </Button>
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-gold/20 bg-surface/60 p-5">
              <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-ivory/60">
                Table actions
              </p>
              <div className="space-y-2.5">
                <Button variant="parlor" className="w-full" onClick={confirmReset}>
                  New game
                </Button>
                <RulesDialog
                  game={game}
                  trigger={
                    <Button variant="parlorGhost" className="w-full">
                      How to Play
                    </Button>
                  }
                />
                <Button
                  variant="parlorGhost"
                  className="w-full"
                  onClick={undo}
                  disabled={history.length === 0 || state.won}
                >
                  Undo
                </Button>
                <StatisticsDialog
                  game={game}
                  trigger={
                    <Button variant="parlorGhost" className="w-full">
                      Statistics
                    </Button>
                  }
                />
                <FavouriteSwitch gameId="addiction" />
              </div>
            </div>
          </aside>
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-[0.2em] text-ivory/45">{label}</span>
      <span className="font-display text-xl font-bold leading-tight">{value}</span>
      {hint ? <span className="text-[10px] text-ivory/40">{hint}</span> : null}
    </div>
  );
}

function CardCell({
  card,
  selected,
  isTarget,
  correct,
  onClick,
}: {
  card: Card | null;
  selected: boolean;
  isTarget: boolean;
  correct: boolean;
  onClick: () => void;
}) {
  if (!card) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Empty slot"
        className={`grid h-[var(--ad-card-h)] w-[var(--ad-card-w)] shrink-0 place-items-center rounded-lg border text-gold/40 transition-colors ${
          isTarget
            ? "border-dashed border-gold/80 bg-gold/15"
            : "border-dashed border-gold/30 bg-gold/5"
        }`}
      >
        {isTarget ? "·" : ""}
      </button>
    );
  }

  const red = isRed(card.suit);
  const isFace = card.rank > 10;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--ad-card-h)] w-[var(--ad-card-w)] shrink-0 select-none rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-[#c0392b]" : "text-brand"
      } ${selected ? "-translate-y-1 ring-2 ring-gold" : ""}`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-[9px] font-bold leading-none sm:left-1 sm:top-1 sm:text-sm">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[8px] sm:text-xs">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-sm sm:text-3xl">
        {isFace ? RANK_LABEL[card.rank] : SUIT_SYMBOL[card.suit]}
      </span>
      {correct && (
        <span className="absolute right-0.5 top-0.5 grid size-2 place-items-center rounded-full bg-gold sm:right-1 sm:top-1 sm:size-2.5" />
      )}
    </button>
  );
}
