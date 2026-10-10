import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { CardMark } from "@/components/parlor/CardMark";
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
import { useGameStarted } from "@/lib/games-started";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import {
  dealTail,
  freshGame,
  hasAvailableMove,
  moveTableau,
  runsComplete,
  setClearRuns,
  type GameState,
  type TableauPile,
} from "@/lib/scorpion";
import { mulberry32 } from "@/lib/random";
import cardBackAsset from "@/assets/card-back.png";

export const Route = createFileRoute("/scorpion")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Scorpion Solitaire — Cards and Games" },
      {
        name: "description",
        content:
          "Scorpion solitaire in the parlour: build four descending same-suit runs from King to Ace and clear the table.",
      },
      { property: "og:title", content: "Play Scorpion Solitaire — Cards and Games" },
      {
        property: "og:description",
        content: "A patient game of Scorpion solitaire, dealt fresh every hand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScorpionTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20260909;

const isRed = (suit: Card["suit"]) => suit === "H" || suit === "D";

// Four foundations, one per suit, for the completed King-to-Ace runs.
const FOUNDATION_COUNT = 4;

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

const BEST_MOVES_KEY = "scorpion-best-moves";
const BEST_TIME_KEY = "scorpion-best-time";

type Best = { moves: number; time: number };

type Selection = { type: "tableau"; index: number; cardIndex: number } | null;

function ScorpionTable() {
  const navigate = useNavigate();
  const game = getGame("scorpion");
  const [state, setState] = useState<GameState>(() => freshGame(mulberry32(SSR_SEED)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [dragOverTarget, setDragOverTarget] = useState<number | null>(null);
  // The tail currently being dragged, so its originals can be hidden while the
  // browser shows the drag image (avoids a duplicate card left behind).
  const [dragging, setDragging] = useState<Selection>(null);
  const dragSourceRef = useRef<Selection>(null);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const [conceded, setConceded] = useState(false);
  const { recordResult } = useSolitaireStats(game.id);
  const { end, beginNew, recordAction } = useGameStarted(game.name);
  const prevWonRef = useRef(false);
  useEffect(() => {
    if (state.won && !prevWonRef.current) {
      recordResult("win");
      end("won");
    }
    prevWonRef.current = state.won;
  }, [state.won, recordResult, end]);
  const stateRef = useRef(state);
  stateRef.current = state;

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
      if (!endedRef.current && startRef.current !== 0)
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
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
    endedRef.current = state.won;
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

  const apply = (candidate: GameState) => {
    if (candidate === state) return;
    recordAction("table action");
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
    recordAction("new game");
    beginNew();
  };

  const concede = () => {
    if (state.won || conceded) return;
    recordResult("loss");
    recordAction("concede");
    end("conceded");
    setConceded(true);
  };

  const gameInProgress = state.moves > 0 && !state.won && !conceded;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : reset());
  const confirmHome = () => {
    if (gameInProgress) {
      setConfirming("home");
    } else {
      recordAction("home");
      void navigate({ to: "/" });
    }
  };

  const undo = () => {
    if (history.length === 0 || state.won || conceded) return;
    recordAction("undo");
    const prev = history[history.length - 1]!;
    // Each undo counts as a move.
    setState({ ...prev, moves: prev.moves + 1 });
    setHistory(history.slice(0, -1));
    setSelection(null);
  };

  const clickTableau = (index: number, cardIndex: number) => {
    const current = stateRef.current;
    if (selection && selection.type === "tableau") {
      if (selection.index === index && selection.cardIndex === cardIndex) {
        setSelection(null);
        return;
      }
      const candidate = moveTableau(current, selection.index, selection.cardIndex, index);
      if (candidate !== current) {
        apply(candidate);
        return;
      }
    }
    setSelection({ type: "tableau", index, cardIndex });
  };

  const clickEmpty = (index: number) => {
    const current = stateRef.current;
    if (!selection || selection.type !== "tableau") return;
    const candidate = moveTableau(current, selection.index, selection.cardIndex, index);
    if (candidate !== current) apply(candidate);
  };

  const clearDrag = () => {
    dragSourceRef.current = null;
    setDragOverTarget(null);
    setDragging(null);
  };

  const beginDrag = (source: Selection, e: DragEvent<HTMLButtonElement>) => {
    if (!source) {
      e.preventDefault();
      return;
    }
    dragSourceRef.current = source;
    setSelection(null);
    setDragging(source);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(source));
    // Use the dragged card itself as the drag image so the browser shows a
    // crisp ghost instead of an offset snapshot of the whole button.
    if (e.currentTarget) e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
  };

  const highlightTableau = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget((t) => (t === index ? t : index));
  };

  const dropOnTableau = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const src = dragSourceRef.current;
    clearDrag();
    if (!src) return;
    const candidate = moveTableau(stateRef.current, src.index, src.cardIndex, index);
    if (candidate !== stateRef.current) apply(candidate);
  };

  const clickTail = () => {
    const candidate = dealTail(stateRef.current);
    if (candidate !== stateRef.current) apply(candidate);
  };

  const toggleClearRuns = () => {
    setSelection(null);
    setState((s) => setClearRuns(s, !s.clearRuns));
  };

  const canDealTail = state.tail.length > 0 && (state.clearRuns || !hasAvailableMove(state));

  return (
    <div className="min-h-screen text-cream">
      <div className="relative mx-auto max-w-6xl px-1 pb-10 pt-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
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
              <h1 className="font-display text-2xl font-bold leading-tight">Scorpion</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={confirmHome}
              className="cursor-pointer bg-transparent text-xs uppercase tracking-[0.2em] text-white transition-colors hover:text-gold"
            >
              ← BACK TO THE GAME ROOM
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-center gap-6 border-y border-gold/15 py-4 text-center">
          <Stat label="Moves" value={String(state.moves)} />
          <Stat label="Time" value={formatElapsed(shownElapsed)} />
          <Stat label="Runs" value={`${runsComplete(state)} / 4`} />
          <Stat label="Best moves" value={best.moves > 0 ? String(best.moves) : "—"} />
          <Stat label="Best time" value={best.time > 0 ? formatElapsed(best.time) : "—"} />
        </div>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_260px]">
          <div className="select-none relative rounded-2xl border border-gold/15 bg-[#4c9a2a] px-1 py-4 text-black sm:p-6">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-6">
              <div className="flex flex-col items-center gap-1">
                <TailPile count={state.tail.length} disabled={!canDealTail} onClick={clickTail} />
              </div>
              <div className="flex gap-2">
                {Array.from({ length: FOUNDATION_COUNT }, (_, index) => (
                  <FoundationSlot key={index} pile={state.foundations[index] ?? []} />
                ))}
              </div>
            </div>

            <div className="flex items-start justify-center gap-1 sm:gap-3">
              {state.tableau.map((pile, index) => (
                <TableauPile
                  key={index}
                  pile={pile}
                  selection={selection}
                  dragging={dragging}
                  index={index}
                  onCardClick={clickTableau}
                  onEmptyClick={clickEmpty}
                  onCardDragStart={(cardIndex, e) =>
                    beginDrag({ type: "tableau", index, cardIndex }, e)
                  }
                  onDragEnd={clearDrag}
                  onDragOver={highlightTableau(index)}
                  onDrop={dropOnTableau(index)}
                  isDropTarget={dragOverTarget === index}
                />
              ))}
            </div>

            <p className="mt-6 text-center text-xs text-black">
              Build four descending runs, King to Ace, one per suit. Drag (or click) a card onto
              another pile to move its run. Only a King fills an empty pile.
            </p>

            {state.won && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🎉</div>
                  <h2 className="font-display text-3xl font-bold text-gold">
                    You cleared the table!
                  </h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    All four runs made it home in {state.moves} moves.
                  </p>
                  <Button variant="parlor" onClick={reset}>
                    Deal again
                  </Button>
                </div>
              </div>
            )}
            {conceded && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🏳️</div>
                  <h2 className="font-display text-3xl font-bold text-red-300">You conceded</h2>
                  <p className="mx-auto max-w-sm text-ivory/70">This game is recorded as a loss.</p>
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
                  disabled={state.won || conceded}
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
                  disabled={history.length === 0 || state.won || conceded}
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
                <FavouriteSwitch gameId="scorpion" />
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 border-t border-gold/15 pt-4 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={toggleClearRuns}
              className="cursor-pointer rounded-full border border-gold/30 px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-ivory/70 transition-colors hover:text-gold"
            >
              Clear runs {state.clearRuns ? "on" : "off"}
            </button>
          </div>
          <p className="text-xs text-ivory/40">
            {canDealTail
              ? "Click the tail to deal its cards to the first three piles."
              : "No moves left — deal the tail, or start a new hand."}
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
                recordResult("abandoned");
                if (confirming === "home") { recordAction("home"); void navigate({ to: "/" }); }
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

function CardFace({
  card,
  selected = false,
  hidden = false,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  card: Card;
  selected?: boolean;
  hidden?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
}) {
  const red = isRed(card.suit);
  const isFace = card.rank > 10;
  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--scorpion-card-h)] w-[var(--scorpion-card-w)] select-none overflow-hidden rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-destructive" : "text-ink"
      } ${selected ? "-translate-y-1 ring-2 ring-gold" : ""} ${hidden ? "invisible" : ""}`}
    >
      <span className="absolute left-1 top-0.5 flex flex-col items-center font-display text-[10.5px] font-bold leading-none sm:text-sm">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-[9px] sm:text-xs">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span
        aria-hidden
        className={`absolute inset-0 grid place-items-center font-display text-base sm:text-2xl ${
          isFace ? "opacity-90" : "opacity-80"
        }`}
      >
        {isFace ? (
          <span className="flex flex-col items-center leading-none">
            <span className="text-[10.5px] sm:text-base">{RANK_LABEL[card.rank]}</span>
            <span className="text-[13px] sm:text-[19px]">{SUIT_SYMBOL[card.suit]}</span>
          </span>
        ) : (
          SUIT_SYMBOL[card.suit]
        )}
      </span>
      <span className="absolute bottom-0.5 right-1 flex rotate-180 flex-col items-center font-display text-[10.5px] font-bold leading-none sm:text-sm">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-[9px] sm:text-xs">{SUIT_SYMBOL[card.suit]}</span>
      </span>
    </button>
  );
}

function CardBack() {
  return (
    <div
      aria-label="Face-down card"
      className="relative block h-[var(--scorpion-card-h)] w-[var(--scorpion-card-w)] overflow-hidden rounded-lg shadow-md shadow-black/30"
    >
      <img src={cardBackAsset} alt="" aria-hidden className="h-full w-full object-cover" />
    </div>
  );
}

function EmptySlot({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Empty pile"
      className="grid h-[var(--scorpion-card-h)] w-[var(--scorpion-card-w)] place-items-center rounded-md border border-dashed border-gold/30 text-lg text-gold/30"
    >
      ♚
    </button>
  );
}

function TailPile({
  count,
  disabled,
  onClick,
}: {
  count: number;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {count > 0 ? (
          <>
            {count > 1 && (
              <div className="absolute -top-1 left-0 opacity-60">
                <CardBack />
              </div>
            )}
            {count > 2 && (
              <div className="absolute -top-2 left-0 opacity-30">
                <CardBack />
              </div>
            )}
            <button
              type="button"
              onClick={onClick}
              disabled={disabled}
              aria-label="Deal the tail"
              className={`relative block cursor-pointer rounded-md transition-opacity ${disabled ? "cursor-not-allowed opacity-60" : "hover:opacity-80"}`}
            >
              <CardBack />
            </button>
          </>
        ) : (
          <EmptySlot />
        )}
      </div>
      <span className="text-[10px] uppercase tracking-[0.18em] text-black">Tail</span>
    </div>
  );
}

function FoundationEmptySlot() {
  return (
    <div
      aria-label="Empty foundation"
      className="grid h-[var(--scorpion-card-h)] w-[var(--scorpion-card-w)] place-items-center rounded-md border-2 border-dotted border-black/60"
    />
  );
}

function FoundationSlot({ pile }: { pile: Card[] }) {
  const top = pile[pile.length - 1];
  return (
    <div className="relative">
      {!top ? (
        <FoundationEmptySlot />
      ) : (
        <>
          {pile.length > 1 && (
            <div className="absolute -top-1 opacity-40">
              <CardBack />
            </div>
          )}
          <div className="relative">
            <CardFace card={top} />
          </div>
        </>
      )}
    </div>
  );
}

function TableauPile({
  pile,
  index,
  selection,
  dragging,
  onCardClick,
  onEmptyClick,
  onCardDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isDropTarget,
}: {
  pile: TableauPile;
  index: number;
  selection: Selection;
  dragging: Selection;
  onCardClick: (index: number, cardIndex: number) => void;
  onEmptyClick: (index: number) => void;
  onCardDragStart: (cardIndex: number, e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  isDropTarget: boolean;
}) {
  const empty = pile.faceDown.length === 0 && pile.faceUp.length === 0;
  return (
    <div
      className={`flex flex-col items-stretch rounded-md ${isDropTarget ? "ring-2 ring-gold" : ""}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {pile.faceDown.map((card, i) => (
        <div
          key={card.id}
          style={{ marginTop: i === 0 ? 0 : "calc(var(--scorpion-down) - var(--scorpion-card-h))" }}
        >
          <CardBack />
        </div>
      ))}
      {pile.faceUp.map((card, i) => {
        // Selecting a card selects its whole tail (every card from it up to the
        // top), so the run lifts together to show what will move.
        const isSelected =
          selection?.type === "tableau" && selection.index === index && i >= selection.cardIndex;
        const isDragging =
          dragging?.type === "tableau" && dragging.index === index && i >= dragging.cardIndex;
        const marginTop =
          i === 0
            ? pile.faceDown.length > 0
              ? "calc(var(--scorpion-down) - var(--scorpion-card-h))"
              : 0
            : "calc(var(--scorpion-visible) - var(--scorpion-card-h))";
        return (
          <div key={card.id} style={{ marginTop }}>
            <CardFace
              card={card}
              selected={isSelected}
              hidden={isDragging}
              onClick={() => onCardClick(index, i)}
              draggable
              onDragStart={(e) => onCardDragStart(i, e)}
              onDragEnd={onDragEnd}
            />
          </div>
        );
      })}
      {empty && <EmptySlot onClick={() => onEmptyClick(index)} />}
    </div>
  );
}
