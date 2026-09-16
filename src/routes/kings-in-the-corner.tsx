import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
          "Kings in the Corner solitaire in the parlour: settle the twelve face cards into their reserved slots to win the hand.",
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

type DragSource =
  | { type: "draw" }
  | { type: "board"; pos: Position };

function KingsInTheCornerTable() {
  const navigate = useNavigate();
  const game = getGame("kings-in-the-corner");
  const [state, setState] = useState<GameState>(() => freshGame(mulberry32(SSR_SEED)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<Position | null>(null);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const [viewingBoard, setViewingBoard] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const { recordResult } = useSolitaireStats(game.id);
  const stateRef = useRef(state);
  stateRef.current = state;
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
    setUndoCount(0);
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
    setViewingBoard(false);
    setUndoCount(0);
    setFinishedElapsed(null);
    setElapsed(0);
    startRef.current = Date.now();
    endedRef.current = false;
  };

  const gameInProgress = state.moves > 0;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : reset());
  const confirmHome = () => (gameInProgress ? setConfirming("home") : void navigate({ to: "/" }));

  const undo = () => {
    if (history.length === 0 || state.won) return;
    // Once the board is full and the game is lost, the player may still undo
    // after dismissing the "stuck" overlay with Keep Playing.
    if (state.lost && !viewingBoard) return;
    const prev = history[history.length - 1]!;
    setState(prev);
    setHistory(history.slice(0, -1));
    setSelection(null);
    setViewingBoard(false);
    setFinishedElapsed(null);
    setUndoCount((c) => c + 1);
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

  // --- Drag-and-drop (pointer-based so it also works with touch on mobile) ---
  const dragRef = useRef<{
    source: DragSource;
    card: Card;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragGhost, setDragGhost] = useState<{ card: Card; x: number; y: number } | null>(null);

  const beginDrag = (source: DragSource, card: Card) => (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { source, card, startX: e.clientX, startY: e.clientY, moved: false };
    setDragGhost({ card, x: e.clientX, y: e.clientY });
  };

  const moveDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8)
      drag.moved = true;
    setDragGhost({ card: drag.card, x: e.clientX, y: e.clientY });
  };

  const endDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragGhost(null);
    if (!drag.moved) return; // it was a tap — let onClick handle it
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const drop = target?.closest("[data-drop]");
    if (!drop) return;
    const row = Number(drop.getAttribute("data-row"));
    const col = Number(drop.getAttribute("data-col"));
    if (Number.isNaN(row) || Number.isNaN(col)) return;
    const pos = { row, col };
    const s = stateRef.current;

    if (drag.source.type === "draw") {
      // Drop the face-up draw card onto an empty slot.
      const placed = placeCard(s, pos);
      if (placed !== s) apply(placed);
      return;
    }

    // Dragging one numbered card onto another: pair them off if they sum to ten.
    const from = s.board[drag.source.pos.row]?.[drag.source.pos.col];
    const to = s.board[row]?.[col];
    if (from && to && pairSumsToTen(from, to)) {
      const removed = removeCards(s, drag.source.pos, pos);
      if (removed !== s) apply(removed);
    }
  };

  const clickSlot = (pos: Position) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
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
      <div className="mx-auto max-w-4xl px-1.5 py-8 sm:px-6">
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
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-center gap-6 border-y border-gold/15 py-4 text-center">
          <Stat label="Moves" value={String(state.moves)} />
          <Stat label="Time" value={formatElapsed(shownElapsed)} />
          <Stat label="Best moves" value={best.moves > 0 ? String(best.moves) : "—"} />
          <Stat label="Best time" value={best.time > 0 ? formatElapsed(best.time) : "—"} />
        </div>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_260px]">
          <div className="relative rounded-2xl border border-gold/15 bg-surface/40 p-5 sm:p-8">
            <div className="mb-6 flex items-start justify-center gap-5">
              <div className="relative">
                {state.stock.length > 0 ? <CardBack /> : <EmptySlot />}
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-ivory/50">
                  {state.stock.length}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                {state.draw ? (
                  <CardFace
                    card={state.draw}
                    onPointerDown={beginDrag({ type: "draw" }, state.draw)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                  />
                ) : (
                  <EmptySlot />
                )}
                <span className="text-[10px] uppercase tracking-[0.18em] text-ivory/45">Draw</span>
              </div>
              <Button
                variant="parlorGhost"
                className="self-center"
                onClick={undo}
                disabled={history.length === 0 || state.won || (state.lost && !viewingBoard)}
              >
                Undo
              </Button>
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
                      pos={pos}
                      card={card}
                      kind={kind}
                      selected={
                        selection !== null && selection.row === row && selection.col === col
                      }
                      isLegal={legalSet.has(key)}
                      onClick={() => clickSlot(pos)}
                      {...(card && card.rank < 10
                        ? {
                            onPointerDown: beginDrag({ type: "board", pos }, card),
                            onPointerMove: moveDrag,
                            onPointerUp: endDrag,
                          }
                        : {})}
                    />
                  );
                }),
              )}
            </div>

            <p className="mt-6 text-center text-xs text-ivory/50">
              Drag the drawn card onto an empty slot, or drag one card onto another to pair off ten.
              Tap a ten to clear it alone.
            </p>

            {state.won && !viewingBoard && (
              <div className="absolute inset-x-0 inset-y-[15%] z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🎉</div>
                  <h2 className="font-display text-3xl font-bold text-gold">
                    You won!
                  </h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    All twelve face cards are home in{" "}
                    {state.moves} {state.moves === 1 ? "move" : "moves"} using {undoCount}{" "}
                    {undoCount === 1 ? "undo" : "undos"}.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="parlor" onClick={reset}>
                      Deal again
                    </Button>
                    <Button variant="parlorOutline" onClick={() => setViewingBoard(true)}>
                      View Board
                    </Button>
                    <Button variant="parlorOutline" onClick={() => void navigate({ to: "/" })}>
                      Return to game board
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {state.lost && !viewingBoard && (
              <div className="absolute inset-x-0 inset-y-[15%] z-10 grid place-items-center rounded-2xl bg-brand/80 p-3 backdrop-blur-sm">
                <div className="space-y-2 text-center">
                  <div className="text-5xl">🃏</div>
                  <h2 className="font-display text-3xl font-bold text-gold">You're stuck</h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    {state.lostReason ?? "There is no legal move left."}
                  </p>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    You can keep playing and use Undo function.
                  </p>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    You used {52 - state.stock.length} cards and made {state.moves}{" "}
                    {state.moves === 1 ? "move" : "moves"}.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="parlor" onClick={reset}>
                      Deal again
                    </Button>
                    <Button variant="parlorOutline" onClick={() => setViewingBoard(true)}>
                      Keep Playing
                    </Button>
                    <Button variant="parlorOutline" onClick={() => void navigate({ to: "/" })}>
                      Return to game board
                    </Button>
                  </div>
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
                <StatisticsDialog
                  game={game}
                  trigger={
                    <Button variant="parlorGhost" className="w-full">
                      Statistics
                    </Button>
                  }
                />
                <FavouriteSwitch gameId="kings-in-the-corner" />
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-6 border-t border-gold/15 pt-4 text-center">
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

      {dragGhost && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: dragGhost.x, top: dragGhost.y, transform: "translate(-50%, -50%)" }}
        >
          <CardFace card={dragGhost.card} />
        </div>
      )}
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
  pos,
  card,
  kind,
  selected,
  isLegal,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  pos: Position;
  card: Card | null;
  kind: SlotKind;
  selected: boolean;
  isLegal: boolean;
  onClick: () => void;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
}) {
  if (!card) {
    return (
      <button
        type="button"
        data-drop="slot"
        data-row={pos.row}
        data-col={pos.col}
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
      data-drop="slot"
      data-row={pos.row}
      data-col={pos.col}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--kic-card-h)] w-[var(--kic-card-w)] shrink-0 touch-none select-none rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-[#c0392b]" : "text-brand"
      } ${selected ? "-translate-y-1 ring-2 ring-gold" : ""}`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-[18px] font-bold leading-none sm:left-1 sm:top-1 sm:text-sm">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[16px] sm:text-xs">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-[28px] sm:text-3xl">
        {isFaceCard ? RANK_LABEL[card.rank] : SUIT_SYMBOL[card.suit]}
      </span>
    </button>
  );
}

function CardFace({
  card,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  card: Card;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
}) {
  const red = isRed(card.suit);
  const isFaceCard = card.rank === 1 || card.rank > 10;
  return (
    <div
      aria-label={cardLabel(card)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`relative block h-[var(--kic-card-h)] w-[var(--kic-card-w)] touch-none select-none rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 ${
        red ? "text-[#c0392b]" : "text-brand"
      }`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-[18px] font-bold leading-none sm:left-1 sm:top-1 sm:text-sm">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[16px] sm:text-xs">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-[28px] sm:text-3xl">
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
