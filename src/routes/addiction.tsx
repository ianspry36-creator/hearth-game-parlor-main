import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { HistoryDialog } from "@/components/parlor/HistoryDialog";
import { ConcedeButton } from "@/components/parlor/ConcedeButton";
import { useSolitaireStats } from "@/lib/solitaireStats";
import { CardMark } from "@/components/parlor/CardMark";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card, type Suit } from "@/lib/cribbage";
import {
  freshGame,
  hasAnyMove,
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
  const [hinting, setHinting] = useState(false);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const { recordResult } = useSolitaireStats(game.id);
  const [conceded, setConceded] = useState(false);
  const prevWonRef = useRef(false);
  // FLIP animation bookkeeping: the board container for measuring card slots,
  // plus the rectangles captured just before a shuffle so moved cards can glide
  // to their new slots.
  const boardRef = useRef<HTMLDivElement>(null);
  const flipRectsRef = useRef<Map<string, DOMRect> | null>(null);
  useEffect(() => {
    if (state.won && !prevWonRef.current) recordResult("win");
    prevWonRef.current = state.won;
  }, [state.won, recordResult]);

  // Stuck with no shuffle left means the hand is lost.
  const lost = !state.won && shufflesRemaining(state) === 0 && !hasAnyMove(state.board);
  const prevLostRef = useRef(false);
  useEffect(() => {
    if (lost && !prevLostRef.current) recordResult("loss");
    prevLostRef.current = lost;
  }, [lost, recordResult]);

  // Timer bookkeeping.
  const [elapsed, setElapsed] = useState(0);
  const [finishedElapsed, setFinishedElapsed] = useState<number | null>(null);
  const startRef = useRef(0);
  const endedRef = useRef(false);

  // Best scores, loaded from local storage once on the client.
  const [best, setBest] = useState<Best>({ moves: 0, time: 0 });

  useEffect(() => {
    setState(freshGame());
    setHistory([]);
    setSelection(null);
    setFinishedElapsed(null);
    setElapsed(0);
    startRef.current = 0;
    endedRef.current = false;

    const id = window.setInterval(() => {
      if (!endedRef.current && startRef.current !== 0) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
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

  // Start the clock on the first move rather than when the hand is dealt.
  useEffect(() => {
    if (startRef.current === 0 && state.moves > 0) startRef.current = Date.now();
  }, [state.moves]);

  useEffect(() => {
    const over = state.won || lost;
    endedRef.current = over;
    if (over && finishedElapsed === null) {
      setFinishedElapsed(elapsed);
      if (state.won) {
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
    }
  }, [state.won, lost, finishedElapsed, elapsed, state.moves]);

  const shownElapsed = finishedElapsed ?? elapsed;

  const targets = selection ? legalTargets(state.board, selection) : [];
  const targetSet = new Set(targets.map((t) => `${t.row}:${t.col}`));

  // Every card that currently has at least one legal empty slot to move into,
  // kept as an ordered list (for the auto-hint tour) and a set (for the ring).
  const movablePositions = useMemo(() => {
    const out: Position[] = [];
    for (let r = 0; r < state.board.length; r += 1) {
      for (let c = 0; c < state.board[r]!.length; c += 1) {
        const card = state.board[r]![c];
        if (card && legalTargets(state.board, { row: r, col: c }).length > 0) {
          out.push({ row: r, col: c });
        }
      }
    }
    return out;
  }, [state.board]);
  const movableSet = useMemo(
    () => new Set(movablePositions.map((p) => `${p.row}:${p.col}`)),
    [movablePositions],
  );

  // Auto-hint: every ten seconds, flash every card that can move red at once,
  // hold the flash briefly, then clear until the next cycle.
  useEffect(() => {
    if (state.won || lost || movablePositions.length === 0) {
      setHinting(false);
      return;
    }

    let hideTimer: number | null = null;

    const flash = () => {
      setHinting(true);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setHinting(false), 800);
    };

    flash();
    const tourTimer = window.setInterval(flash, 10000);

    return () => {
      window.clearInterval(tourTimer);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
    };
  }, [state.won, lost, movablePositions]);

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
    startRef.current = 0;
    endedRef.current = false;
    setConceded(false);
  };

  const concede = () => {
    if (state.won || lost || conceded) return;
    recordResult("loss");
    setConceded(true);
  };

  const gameInProgress = state.moves > 0 && !state.won && !lost && !conceded;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : reset());
  const confirmHome = () => (gameInProgress ? setConfirming("home") : void navigate({ to: "/" }));

  const undo = () => {
    if (history.length === 0 || state.won || lost || conceded) return;
    const prev = history[history.length - 1]!;
    setState(prev);
    setHistory(history.slice(0, -1));
    setSelection(null);
  };

  const shuffle = () => {
    const next = shuffleBoard(state);
    if (next === state) return;
    // Capture where every card currently sits so the FLIP effect below can
    // glide each card from its old slot to its new one after the redeal.
    const rects = new Map<string, DOMRect>();
    boardRef.current?.querySelectorAll<HTMLButtonElement>("[data-card-id]").forEach((el) => {
      const id = el.dataset.cardId;
      if (id) rects.set(id, el.getBoundingClientRect());
    });
    flipRectsRef.current = rects;
    apply(next);
  };

  // FLIP: after a shuffle, animate each surviving card from its old slot to its
  // new one. The board is keyed by position, so React reuses each slot's element
  // and only the card content swaps; here we offset that element back to where
  // the card started and transition it home.
  useLayoutEffect(() => {
    const prev = flipRectsRef.current;
    if (!prev) return;
    flipRectsRef.current = null;
    const boardEl = boardRef.current;
    if (!boardEl) return;
    const flips: { el: HTMLElement; dx: number; dy: number }[] = [];
    boardEl.querySelectorAll<HTMLButtonElement>("[data-card-id]").forEach((el) => {
      const id = el.dataset.cardId;
      if (!id) return;
      const from = prev.get(id);
      if (!from) return;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (dx === 0 && dy === 0) return;
      flips.push({ el, dx, dy });
    });
    if (flips.length === 0) return;
    for (const f of flips) {
      f.el.style.transition = "none";
      f.el.style.transform = `translate(${f.dx}px, ${f.dy}px)`;
    }
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const f of flips) {
          f.el.style.transition = "transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)";
          f.el.style.transform = "";
        }
      });
    });
    const clear = () => {
      for (const f of flips) {
        f.el.style.transition = "";
        f.el.style.transform = "";
      }
    };
    const timer = window.setTimeout(clear, 500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clear();
    };
  }, [state.board]);

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

  // Double-click a card to move it straight into its first legal empty slot.
  const doubleClickSlot = (pos: Position) => {
    if (state.won || lost) return;
    const targets = legalTargets(state.board, pos);
    if (targets.length === 0) return;
    const moved = moveCard(state, pos, targets[0]!);
    if (moved !== state) apply(moved);
  };

  const remaining = shufflesRemaining(state);

  return (
    <div className="text-cream">
      <div className="mx-auto max-w-6xl px-1.5 pt-8 pb-1.5 sm:px-6">
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

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="select-none relative rounded-2xl border border-gold/20 bg-surface/40 p-4 sm:p-8">
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center">
                <Stat label="Moves" value={String(state.moves)} />
                <Stat label="Time" value={formatElapsed(shownElapsed)} />
                <Stat label="Shuffles left" value={String(remaining)} />
                <Stat label="Best time" value={best.time > 0 ? formatElapsed(best.time) : "—"} />
                <Stat label="Best moves" value={best.moves > 0 ? String(best.moves) : "—"} />
              </div>

              <div ref={boardRef} className="overflow-x-auto">
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
                            movable={movableSet.has(`${r}:${c}`)}
                            hint={hinting && movableSet.has(`${r}:${c}`)}
                            onClick={() => clickSlot(pos)}
                            onDoubleClick={() => doubleClickSlot(pos)}
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

            {lost && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/85 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🔒</div>
                  <h2 className="font-display text-3xl font-bold text-gold">You're stuck</h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    No card can move and your three shuffles are spent.
                  </p>
                  <Button variant="parlor" onClick={reset}>
                    Deal again
                  </Button>
                </div>
              </div>
            )}
            {conceded && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/85 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🏳️</div>
                  <h2 className="font-display text-3xl font-bold text-red-300">
                    You conceded
                  </h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    This game is recorded as a loss.
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
                <ConcedeButton
                  moves={state.moves}
                  disabled={state.won || lost || conceded}
                  onConcede={concede}
                  className="w-full"
                />
                <RulesDialog
                  game={game}
                  trigger={
                    <Button variant="parlorGhost" className="w-full">
                      How to Play
                    </Button>
                  }
                />
                <HistoryDialog
                  game={game}
                  trigger={
                    <Button variant="parlorGhost" className="w-full">
                      History
                    </Button>
                  }
                />
                <Button
                  variant="parlorGhost"
                  className="w-full"
                  onClick={undo}
                  disabled={history.length === 0 || state.won || lost || conceded}
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
                recordResult("abandoned");
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
  movable,
  hint,
  onClick,
  onDoubleClick,
}: {
  card: Card | null;
  selected: boolean;
  isTarget: boolean;
  correct: boolean;
  movable: boolean;
  hint: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
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
      data-card-id={card.id}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--ad-card-h)] w-[var(--ad-card-w)] shrink-0 select-none rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-[#c0392b]" : "text-ink"
      } ${
        selected
          ? "-translate-y-1 ring-2 ring-gold"
          : hint
            ? "-translate-y-1 ring-2 ring-[#c0392b] bg-[#fdeceb] shadow-[0_0_0_3px_rgba(192,57,43,0.4)]"
            : movable
              ? "ring-2 ring-gold/60"
              : ""
      }`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-[9px] font-bold leading-none sm:left-1 sm:top-1 sm:text-sm">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[8px] sm:text-xs">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-sm sm:text-xl">
        {isFace ? RANK_LABEL[card.rank] : SUIT_SYMBOL[card.suit]}
      </span>
      {correct && (
        <span className="absolute right-0.5 top-0.5 grid size-2 place-items-center rounded-full bg-gold sm:right-1 sm:top-1 sm:size-2.5" />
      )}
    </button>
  );
}
