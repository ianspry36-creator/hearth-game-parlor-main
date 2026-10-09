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
import { HistoryDialog } from "@/components/parlor/HistoryDialog";
import { ConcedeButton } from "@/components/parlor/ConcedeButton";
import { useSolitaireStats } from "@/lib/solitaireStats";
import { useGameStarted } from "@/lib/games-started";
import { CardMark } from "@/components/parlor/CardMark";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import {
  autoComplete,
  autoCompleteFrames,
  canAutoComplete,
  FOUNDATION_SUITS,
  foundationTarget,
  freshGame,
  isRed,
  isRun,
  moveCellToCell,
  moveCellToFoundation,
  moveCellToTableau,
  moveFoundationToCell,
  moveFoundationToTableau,
  moveTableauToCell,
  moveTableauToFoundation,
  moveTableauToTableau,
  type GameState,
} from "@/lib/freecell";
import { mulberry32 } from "@/lib/random";

export const Route = createFileRoute("/freecell")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play FreeCell — Cards and Games" },
      {
        name: "description",
        content:
          "FreeCell solitaire in the parlor: four free cells, eight piles, and fifty-two cards to send home by suit.",
      },
      { property: "og:title", content: "Play FreeCell — Cards and Games" },
      {
        property: "og:description",
        content: "A patient game of FreeCell solitaire, dealt fresh every hand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FreeCellTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20260903;

type Selection =
  | { type: "cell"; index: number }
  | { type: "tableau"; index: number; cardIndex: number }
  | { type: "foundation"; index: number }
  | null;

type DragSource =
  | { type: "cell"; index: number }
  | { type: "tableau"; index: number; cardIndex: number }
  | { type: "foundation"; index: number };

function FreeCellTable() {
  const navigate = useNavigate();
  const game = getGame("freecell");
  const [state, setState] = useState<GameState>(() => freshGame(mulberry32(SSR_SEED)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [autocompleting, setAutocompleting] = useState(false);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const [conceded, setConceded] = useState(false);
  const { recordResult } = useSolitaireStats(game.id);
  const { end, beginNew, recordAction } = useGameStarted(game.name);
  const stateRef = useRef(state);
  stateRef.current = state;
  const prevWonRef = useRef(false);
  useEffect(() => {
    if (state.won && !prevWonRef.current) {
      recordResult("win");
      end("won");
    }
    prevWonRef.current = state.won;
  }, [state.won, recordResult, end]);

  useEffect(() => {
    setState(freshGame());
    setHistory([]);
    setSelection(null);
  }, []);

  const runAutoComplete = (from: GameState) => {
    const frames = autoCompleteFrames(from);
    setAutocompleting(true);
    let i = 0;
    const tick = () => {
      if (i < frames.length) {
        setState(frames[i]!);
        i += 1;
        window.setTimeout(tick, 130);
      } else {
        setState(autoComplete(from));
        setAutocompleting(false);
      }
    };
    window.setTimeout(tick, 130);
  };

  const apply = (candidate: GameState) => {
    if (candidate === state || autocompleting) return;
    recordAction("table action");
    setHistory((h) => [...h, state]);
    setSelection(null);
    if (!candidate.won && canAutoComplete(candidate)) {
      setState(candidate);
      runAutoComplete(candidate);
      return;
    }
    setState(candidate);
  };

  const reset = () => {
    setState(freshGame());
    setHistory([]);
    setSelection(null);
    setAutocompleting(false);
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
    if (history.length === 0 || autocompleting || conceded) return;
    recordAction("undo");
    const prev = history[history.length - 1]!;
    setState({ ...prev, moves: prev.moves + 1 });
    setHistory(history.slice(0, -1));
    setSelection(null);
  };

  const clickCell = (index: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (selection) {
      if (selection.type === "tableau") apply(moveTableauToCell(state, selection.index, index));
      else if (selection.type === "foundation")
        apply(moveFoundationToCell(state, selection.index, index));
      else if (selection.type === "cell") {
        if (selection.index === index) {
          setSelection(null);
          return;
        }
        apply(moveCellToCell(state, selection.index, index));
      }
      return;
    }
    if (state.cells[index] !== null) setSelection({ type: "cell", index });
  };

  const doubleClickCell = (index: number) => {
    const card = state.cells[index]!;
    if (card === null) return;
    setSelection(null);
    const foundationIndex = foundationTarget(card, state.foundations);
    if (foundationIndex !== null) apply(moveCellToFoundation(state, index, foundationIndex));
  };

  const clickFoundation = (index: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (selection) {
      if (selection.type === "cell") {
        const card = state.cells[selection.index];
        if (card) {
          const target = foundationTarget(card, state.foundations);
          if (target !== null) apply(moveCellToFoundation(state, selection.index, target));
        }
      } else if (selection.type === "tableau") {
        const pile = state.tableau[selection.index]!;
        if (selection.cardIndex === pile.length - 1) {
          const card = pile[selection.cardIndex];
          if (card) {
            const target = foundationTarget(card, state.foundations);
            if (target !== null) apply(moveTableauToFoundation(state, selection.index, target));
          }
        } else {
          setSelection(null);
        }
      } else {
        setSelection(null);
      }
      return;
    }
    if (state.foundations[index]!.length > 0) setSelection({ type: "foundation", index });
  };

  const clickTableau = (index: number, cardIndex: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (
      selection?.type === "tableau" &&
      selection.index === index &&
      selection.cardIndex === cardIndex
    ) {
      setSelection(null);
      return;
    }
    if (selection) {
      if (selection.type === "cell") apply(moveCellToTableau(state, selection.index, index));
      else if (selection.type === "foundation")
        apply(moveFoundationToTableau(state, selection.index, index));
      else if (selection.type === "tableau") {
        const count = state.tableau[selection.index]!.length - selection.cardIndex;
        apply(moveTableauToTableau(state, selection.index, count, index));
      }
      return;
    }
    const pile = state.tableau[index]!;
    if (pile.length === 0) return;
    if (isRun(pile.slice(cardIndex))) setSelection({ type: "tableau", index, cardIndex });
  };

  const doubleClickTableau = (index: number) => {
    const pile = state.tableau[index]!;
    if (pile.length === 0) return;
    setSelection(null);
    const card = pile[pile.length - 1]!;
    const foundationIndex = foundationTarget(card, state.foundations);
    if (foundationIndex !== null) {
      apply(moveTableauToFoundation(state, index, foundationIndex));
      return;
    }
    const emptyCell = state.cells.findIndex((c) => c === null);
    if (emptyCell !== -1) apply(moveTableauToCell(state, index, emptyCell));
  };

  const dragRef = useRef<{
    source: DragSource;
    cards: Card[];
    startX: number;
    startY: number;
    moved: boolean;
    w: number;
    h: number;
    visible: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragGhost, setDragGhost] = useState<{
    cards: Card[];
    x: number;
    y: number;
    w: number;
    h: number;
    visible: number;
  } | null>(null);
  // Card ids currently being dragged, so the originals can be hidden while the
  // ghost follows the pointer (avoids a duplicate card left behind at the source).
  const draggingIds = dragGhost ? new Set(dragGhost.cards.map((c) => c.id)) : null;

  const cardsFor = (source: DragSource): Card[] => {
    const s = stateRef.current;
    if (source.type === "cell") return s.cells[source.index] ? [s.cells[source.index]!] : [];
    if (source.type === "foundation") return s.foundations[source.index]!.slice(-1);
    return s.tableau[source.index]!.slice(source.cardIndex);
  };

  const cardDims = () => {
    const styles = getComputedStyle(document.documentElement);
    const parse = (name: string, fallback: number) => {
      const value = parseFloat(styles.getPropertyValue(name));
      return Number.isFinite(value) ? value : fallback;
    };
    return {
      w: parse("--fc-card-w", 80),
      h: parse("--fc-card-h", 112),
      visible: parse("--fc-visible", 24),
    };
  };

  const beginDrag = (source: DragSource) => (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const cards = cardsFor(source);
    if (cards.length === 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const dims = cardDims();
    dragRef.current = {
      source,
      cards,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      ...dims,
    };
    setDragGhost({ cards, x: e.clientX, y: e.clientY, ...dims });
  };

  const moveDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8)
      drag.moved = true;
    setDragGhost({
      cards: drag.cards,
      x: e.clientX,
      y: e.clientY,
      w: drag.w,
      h: drag.h,
      visible: drag.visible,
    });
  };

  const dropOntoCell = (source: DragSource, index: number) => {
    const s = stateRef.current;
    if (source.type === "cell") apply(moveCellToCell(s, source.index, index));
    else if (source.type === "tableau") apply(moveTableauToCell(s, source.index, index));
    else if (source.type === "foundation") apply(moveFoundationToCell(s, source.index, index));
  };

  const dropOntoFoundation = (source: DragSource) => {
    const s = stateRef.current;
    if (source.type === "cell") {
      const card = s.cells[source.index];
      if (card) {
        const target = foundationTarget(card, s.foundations);
        if (target !== null) apply(moveCellToFoundation(s, source.index, target));
      }
    } else if (source.type === "tableau") {
      const pile = s.tableau[source.index]!;
      if (source.cardIndex === pile.length - 1) {
        const card = pile[source.cardIndex];
        if (card) {
          const target = foundationTarget(card, s.foundations);
          if (target !== null) apply(moveTableauToFoundation(s, source.index, target));
        }
      }
    }
  };

  const dropOntoTableau = (source: DragSource, index: number) => {
    const s = stateRef.current;
    if (source.type === "cell") apply(moveCellToTableau(s, source.index, index));
    else if (source.type === "foundation") apply(moveFoundationToTableau(s, source.index, index));
    else if (source.type === "tableau") {
      const count = s.tableau[source.index]!.length - source.cardIndex;
      apply(moveTableauToTableau(s, source.index, count, index));
    }
  };

  const endDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragGhost(null);
    if (!drag.moved) return; // it was a tap — let onClick handle selection
    suppressClickRef.current = true;
    // If the browser doesn't synthesize a click after this drag, clear the flag
    // so the next tap isn't swallowed.
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const drop = target?.closest("[data-drop]");
    if (drop) {
      const kind = drop.getAttribute("data-drop");
      if (kind === "cell") dropOntoCell(drag.source, Number(drop.getAttribute("data-index")));
      else if (kind === "foundation") dropOntoFoundation(drag.source);
      else if (kind === "tableau")
        dropOntoTableau(drag.source, Number(drop.getAttribute("data-index")));
    }
  };

  return (
    <div className="min-h-screen text-cream">
      <div className="mx-auto max-w-6xl px-1.5 py-8 sm:px-6">
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
              <h1 className="font-display text-2xl font-bold leading-tight">FreeCell</h1>
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
          <div className="select-none relative rounded-2xl border border-gold/20 bg-[#4c9a2a] p-1.5 text-black sm:p-8">
            <div className="space-y-8">
              <div className="flex items-start gap-1 sm:gap-2">
                <div className="flex gap-1 sm:gap-2">
                  {state.cells.map((card, index) => (
                    <CellSlot
                      key={index}
                      index={index}
                      card={card}
                      selected={selection?.type === "cell" && selection.index === index}
                      onClick={() => clickCell(index)}
                      onDoubleClick={() => doubleClickCell(index)}
                      onPointerDown={beginDrag({ type: "cell", index })}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      draggingIds={draggingIds}
                    />
                  ))}
                </div>
                <div className="ml-auto flex gap-1 sm:gap-2">
                  {state.foundations.map((pile, index) => (
                    <FoundationSlot
                      key={index}
                      pile={pile}
                      suitIndex={index}
                      selected={selection?.type === "foundation" && selection.index === index}
                      onClick={() => clickFoundation(index)}
                      onPointerDown={beginDrag({ type: "foundation", index })}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      draggingIds={draggingIds}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-8 gap-px sm:gap-2">
                {state.tableau.map((pile, index) => (
                  <TableauPile
                    key={index}
                    pile={pile}
                    index={index}
                    selection={selection}
                    draggingIds={draggingIds}
                    onCardClick={clickTableau}
                    onDoubleClick={doubleClickTableau}
                    onPointerDownCard={(cardIndex) =>
                      beginDrag({ type: "tableau", index, cardIndex })
                    }
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                  />
                ))}
              </div>

              <div className="flex flex-col items-center justify-center gap-3 border-t border-gold/15 pt-4 text-center">
                <span className="text-sm text-black">
                  {state.moves} {state.moves === 1 ? "move" : "moves"}
                </span>
                <Button
                  variant="parlorGhost"
                  className="bg-black text-white border-black hover:bg-black/80"
                  onClick={undo}
                  disabled={history.length === 0 || autocompleting || conceded}
                >
                  Undo
                </Button>
              </div>
            </div>

            {state.won && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🎉</div>
                  <h2 className="font-display text-3xl font-bold text-gold">
                    You cleared the table!
                  </h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    All fifty-two cards made it home to the foundations in {state.moves} moves.
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
                <StatisticsDialog
                  game={game}
                  trigger={
                    <Button variant="parlorGhost" className="w-full">
                      Statistics
                    </Button>
                  }
                />
                <FavouriteSwitch gameId="freecell" />
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

      {dragGhost && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: dragGhost.x - dragGhost.w / 2, top: dragGhost.y - dragGhost.h / 2 }}
        >
          <div className="flex flex-col items-stretch">
            {dragGhost.cards.map((card, i) => (
              <div
                key={card.id}
                style={{ marginTop: i === 0 ? 0 : -(dragGhost.h - dragGhost.visible) }}
              >
                <CardFace card={card} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CardFace({
  card,
  selected = false,
  hidden = false,
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  card: Card;
  selected?: boolean;
  hidden?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
}) {
  const red = isRed(card.suit);
  const isFace = card.rank > 10;
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--fc-card-h)] w-[var(--fc-card-w)] touch-none select-none overflow-hidden rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-destructive" : "text-ink"
      } ${selected ? "-translate-y-1 ring-2 ring-gold" : ""} ${hidden ? "opacity-0" : ""}`}
    >
      <span className="absolute left-1 top-0.5 flex flex-col items-center font-display text-xs font-bold leading-none sm:text-lg">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-[10px] sm:text-sm">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span
        aria-hidden
        className={`absolute inset-0 grid place-items-center font-display text-2xl sm:text-4xl ${
          isFace ? "opacity-90" : "opacity-80"
        }`}
      >
        {isFace ? (
          <span className="flex flex-col items-center leading-none">
            <span className="text-base sm:text-2xl">{RANK_LABEL[card.rank]}</span>
            <span className="text-[19px] sm:text-[29px]">{SUIT_SYMBOL[card.suit]}</span>
          </span>
        ) : (
          SUIT_SYMBOL[card.suit]
        )}
      </span>
      <span className="absolute bottom-0.5 right-1 flex rotate-180 flex-col items-center font-display text-xs font-bold leading-none sm:text-lg">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-[10px] sm:text-sm">{SUIT_SYMBOL[card.suit]}</span>
      </span>
    </button>
  );
}

function EmptySlot({
  onClick,
  symbol,
  red,
  black,
}: {
  onClick?: () => void;
  symbol?: string;
  red?: boolean;
  black?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Empty pile"
      className={`grid h-[var(--fc-card-h)] w-[var(--fc-card-w)] place-items-center rounded-lg border border-dashed ${
        black ? "border-black" : "border-gold/30"
      } text-base sm:text-2xl ${
        red ? "text-destructive" : symbol ? "text-[var(--yukon-ink)]" : "text-gold/30"
      }`}
    >
      {symbol ?? ""}
    </button>
  );
}

function CellSlot({
  card,
  index,
  selected,
  draggingIds,
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  card: Card | null;
  index: number;
  selected: boolean;
  draggingIds?: Set<string> | null;
  onClick: () => void;
  onDoubleClick: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}) {
  return (
    <div className="relative" data-drop="cell" data-index={index}>
      {card ? (
        <CardFace
          card={card}
          selected={selected}
          hidden={draggingIds?.has(card.id)}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      ) : (
        <EmptySlot onClick={onClick} black />
      )}
    </div>
  );
}

function FoundationSlot({
  pile,
  suitIndex,
  selected,
  draggingIds,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  pile: Card[];
  suitIndex: number;
  selected: boolean;
  draggingIds?: Set<string> | null;
  onClick: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}) {
  const top = pile[pile.length - 1];
  const suit = FOUNDATION_SUITS[suitIndex];
  const redSuit = suit ? isRed(suit) : false;
  const suitSymbol = suit ? SUIT_SYMBOL[suit] : "";
  return (
    <div className="relative" data-drop="foundation">
      {top ? (
        <CardFace
          card={top}
          selected={selected}
          hidden={draggingIds?.has(top.id)}
          onClick={onClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      ) : (
        <EmptySlot onClick={onClick} symbol={suitSymbol} red={redSuit} black />
      )}
    </div>
  );
}

function TableauPile({
  pile,
  index,
  selection,
  draggingIds,
  onCardClick,
  onDoubleClick,
  onPointerDownCard,
  onPointerMove,
  onPointerUp,
}: {
  pile: Card[];
  index: number;
  selection: Selection;
  draggingIds?: Set<string> | null;
  onCardClick: (index: number, cardIndex: number) => void;
  onDoubleClick: (index: number) => void;
  onPointerDownCard: (cardIndex: number) => (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}) {
  return (
    <div className="flex flex-col items-center" data-drop="tableau" data-index={index}>
      <div className="flex flex-col items-stretch">
        {pile.map((card, i) => {
          const isSelected =
            selection?.type === "tableau" && selection.index === index && selection.cardIndex === i;
          return (
            <div
              key={card.id}
              style={{ marginTop: i === 0 ? 0 : "calc(var(--fc-visible) - var(--fc-card-h))" }}
            >
              <CardFace
                card={card}
                selected={isSelected}
                hidden={draggingIds?.has(card.id)}
                onClick={() => onCardClick(index, i)}
                onDoubleClick={() => onDoubleClick(index)}
                onPointerDown={onPointerDownCard(i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            </div>
          );
        })}
      </div>
      {pile.length === 0 && <EmptySlot onClick={() => onCardClick(index, 0)} />}
    </div>
  );
}
