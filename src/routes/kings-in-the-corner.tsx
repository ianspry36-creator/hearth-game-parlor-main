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
  legalSlots,
  pairSumsToTen,
  placeCard,
  removeCards,
  slotKind,
  ROWS,
  COLS,
  type GameState,
  type Position,
  type SlotKind,
} from "@/lib/kings-in-the-corner";
import { mulberry32 } from "@/lib/random";
import cardBackAsset from "@/assets/card-back.png";

export const Route = createFileRoute("/kings-in-the-corner")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Kings in the Corner — Cards and Games" },
      {
        name: "description",
        content:
          "Kings in the Corner solitaire in the parlour: settle the twelve face cards into their reserved slots and pair off every numbered card that sums to ten.",
      },
      { property: "og:title", content: "Play Kings in the Corner — Cards and Games" },
      {
        property: "og:description",
        content: "A patient game of Kings in the Corner, dealt fresh every hand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KingsInTheCornerTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20260907;

const isRed = (suit: Suit) => suit === "H" || suit === "D";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

const BEST_MOVES_KEY = "kings-in-the-corner-best-moves";
const BEST_TIME_KEY = "kings-in-the-corner-best-time";

type Best = { moves: number; time: number };

function KingsInTheCornerTable() {
  const navigate = useNavigate();
  const game = getGame("kings-in-the-corner");
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
  const prevLostRef = useRef(false);
  useEffect(() => {
    if (state.lost && !prevLostRef.current) recordResult("loss");
    prevLostRef.current = state.lost;
  }, [state.lost, recordResult]);

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
    startRef.current = Date.now();
    endedRef.current = false;

    const id = window.setInterval(() => {
      if (!endedRef.current) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
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
    endedRef.current = state.won || state.lost;
    if ((state.won || state.lost) && finishedElapsed === null) {
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
  }, [state.won, state.lost, finishedElapsed, elapsed, state.moves]);

  const shownElapsed = finishedElapsed ?? elapsed;

  const legal = state.draw ? legalSlots(state.board, state.draw) : [];
  const legalSet = new Set(legal.map((p) => `${p.row}:${p.col}`));

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
    endedRef.current = false;
  };

  const gameInProgress = state.moves > 0;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : reset());
  const confirmHome = () => (gameInProgress ? setConfirming("home") : void navigate({ to: "/" }));

  const undo = () => {
    if (history.length === 0 || state.won || state.lost) return;
    const prev = history[history.length - 1]!;
    setState(prev);
    setHistory(history.slice(0, -1));
    setSelection(null);
  };

  const handleRemoval = (pos: Position, card: Card) => {
    if (card.rank > 10) {
      setSelection(null);
      return;
    }
    if (card.rank === 10) {
      const removed = removeCards(state, pos, null);
      if (removed !== state) apply(removed);
      else setSelection(null);
      return;
    }
    if (!selection) {
      setSelection(pos);
      return;
    }
    if (selection.row === pos.row && selection.col === pos.col) {
      setSelection(null);
      return;
    }
    const other = state.board[selection.row]?.[selection.col];
    if (other && pairSumsToTen(other, card)) {
      const removed = removeCards(state, selection, pos);
      if (removed !== state) apply(removed);
    } else {
      setSelection(pos);
    }
  };

  const clickSlot = (pos: Position) => {
    const card = state.board[pos.row]?.[pos.col];
    if (card) {
      handleRemoval(pos, card);
      return;
    }
    if (state.draw) {
      const placed = placeCard(state, pos);
      if (placed !== state) apply(placed);
    }
    setSelection(null);
  };

  return (
    <div className="min-h-screen bg-brand text-cream">
      <div className="mx-auto max-w-4xl px-6 py-8">
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
              <h1 className="font-display text-2xl font-bold leading-tight">Kings in the Corner</h1>
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
            <FavouriteSwitch gameId="kings-in-the-corner" />
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
            <Button variant="parlor" onClick={confirmReset} className="scale-90 sm:scale-100">
              New game
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-center gap-6 border-y border-gold/15 py-4 text-center">
          <Stat label="Moves" value={String(state.moves)} />
          <Stat label="Time" value={formatElapsed(shownElapsed)} />
          <Stat label="Best moves" value={best.moves > 0 ? String(best.moves) : "—"} />
          <Stat label="Best time" value={best.time > 0 ? formatElapsed(best.time) : "—"} />
          <Stat label="Stock" value={String(state.stock.length)} />
        </div>

        <div className="relative mt-8 rounded-2xl border border-gold/15 bg-surface/40 p-5 sm:p-8">
          <div className="mb-6 flex items-center justify-center gap-5">
            <div className="relative">
              {state.stock.length > 0 ? <CardBack /> : <EmptySlot />}
              <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-ivory/50">
                {state.stock.length}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              {state.draw ? <CardFace card={state.draw} /> : <EmptySlot />}
              <span className="text-[10px] uppercase tracking-[0.18em] text-ivory/45">Draw</span>
            </div>
          </div>

          <div className="mx-auto grid w-fit grid-cols-4 gap-1 sm:gap-2">
            {Array.from({ length: ROWS }, (_, row) =>
              Array.from({ length: COLS }, (_, col) => {
                const pos = { row, col };
                const kind = slotKind(pos);
                const card = state.board[row]![col] ?? null;
                const key = `${row}:${col}`;
                return (
                  <SlotCell
                    key={key}
                    card={card}
                    kind={kind}
                    selected={selection !== null && selection.row === row && selection.col === col}
                    isLegal={legalSet.has(key)}
                    onClick={() => clickSlot(pos)}
                  />
                );
              }),
            )}
          </div>

          <p className="mt-6 text-center text-xs text-ivory/50">
            Place the drawn card, then pair off cards whose ranks add up to ten. Click a ten to
            clear it alone.
          </p>

          {state.won && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
              <div className="space-y-4 text-center">
                <div className="text-5xl">🎉</div>
                <h2 className="font-display text-3xl font-bold text-gold">You cleared the table!</h2>
                <p className="mx-auto max-w-sm text-ivory/70">
                  All twelve face cards are home and every numbered card is paired off in{" "}
                  {state.moves} moves.
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
                <div className="text-5xl">🃏</div>
                <h2 className="font-display text-3xl font-bold text-gold">You're stuck</h2>
                <p className="mx-auto max-w-sm text-ivory/70">
                  {state.lostReason ?? "There is no legal move left."}
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
            <RulesDialog
              game={game}
              trigger={
                <Button variant="parlorOutline" className="scale-75 sm:scale-100">
                  How to Play
                </Button>
              }
            />
            <Button
              variant="parlorOutline"
              onClick={undo}
              disabled={history.length === 0 || state.won || state.lost}
              className="scale-75 sm:scale-100"
            >
              Undo
            </Button>
          </div>
          <span className="text-xs uppercase tracking-[0.2em] text-ivory/40">
            Kings in the corners · Queens and jacks along the edges · Pairs of ten
          </span>
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

const SLOT_MARK: Record<SlotKind, string> = {
  king: "K",
  queen: "Q",
  jack: "J",
  any: "·",
};

function SlotCell({
  card,
  kind,
  selected,
  isLegal,
  onClick,
}: {
  card: Card | null;
  kind: SlotKind;
  selected: boolean;
  isLegal: boolean;
  onClick: () => void;
}) {
  if (!card) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Empty ${kind} slot`}
        className={`grid h-[var(--kic-card-h)] w-[var(--kic-card-w)] shrink-0 place-items-center rounded-lg border text-sm font-bold transition-colors sm:text-lg ${
          isLegal
            ? "border-dashed border-gold/80 bg-gold/15 text-gold"
            : "border-dashed border-gold/30 bg-gold/5 text-gold/40"
        }`}
      >
        {SLOT_MARK[kind]}
      </button>
    );
  }

  const red = isRed(card.suit);
  const isFaceCard = card.rank === 1 || card.rank > 10;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--kic-card-h)] w-[var(--kic-card-w)] shrink-0 select-none rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-[#c0392b]" : "text-brand"
      } ${selected ? "-translate-y-1 ring-2 ring-gold" : ""}`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-[9px] font-bold leading-none sm:left-1 sm:top-1 sm:text-sm">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[8px] sm:text-xs">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-sm sm:text-3xl">
        {isFaceCard ? RANK_LABEL[card.rank] : SUIT_SYMBOL[card.suit]}
      </span>
    </button>
  );
}

function CardFace({ card }: { card: Card }) {
  const red = isRed(card.suit);
  const isFaceCard = card.rank === 1 || card.rank > 10;
  return (
    <div
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--kic-card-h)] w-[var(--kic-card-w)] select-none rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 ${
        red ? "text-[#c0392b]" : "text-brand"
      }`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-[9px] font-bold leading-none sm:left-1 sm:top-1 sm:text-sm">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[8px] sm:text-xs">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-sm sm:text-3xl">
        {isFaceCard ? RANK_LABEL[card.rank] : SUIT_SYMBOL[card.suit]}
      </span>
    </div>
  );
}

function CardBack() {
  return (
    <div
      aria-label="Face-down card"
      className="relative block h-[var(--kic-card-h)] w-[var(--kic-card-w)] overflow-hidden rounded-lg shadow-md shadow-black/30"
    >
      <img src={cardBackAsset} alt="" aria-hidden className="h-full w-full object-cover" />
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="grid h-[var(--kic-card-h)] w-[var(--kic-card-w)] place-items-center rounded-lg border border-dashed border-gold/30 text-gold/30" />
  );
}




