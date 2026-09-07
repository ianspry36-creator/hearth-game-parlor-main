import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type DragEvent } from "react";
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
  const { recordResult } = useSolitaireStats(game.id);
  const prevWonRef = useRef(false);
  useEffect(() => {
    if (state.won && !prevWonRef.current) recordResult("win");
    prevWonRef.current = state.won;
  }, [state.won, recordResult]);

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
  };

  const gameInProgress = state.moves > 0;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : reset());
  const confirmHome = () => (gameInProgress ? setConfirming("home") : void navigate({ to: "/" }));

  const undo = () => {
    if (history.length === 0 || autocompleting) return;
    const prev = history[history.length - 1]!;
    setState({ ...prev, moves: prev.moves + 1 });
    setHistory(history.slice(0, -1));
    setSelection(null);
  };

  const clickCell = (index: number) => {
    if (selection) {
      if (selection.type === "tableau") apply(moveTableauToCell(state, selection.index, index));
      else if (selection.type === "foundation") apply(moveFoundationToCell(state, selection.index, index));
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
    if (selection?.type === "tableau" && selection.index === index && selection.cardIndex === cardIndex) {
      setSelection(null);
      return;
    }
    if (selection) {
      if (selection.type === "cell") apply(moveCellToTableau(state, selection.index, index));
      else if (selection.type === "foundation") apply(moveFoundationToTableau(state, selection.index, index));
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


  const dragRef = useRef<DragSource | null>(null);

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const startDrag = (source: DragSource) => (e: DragEvent) => {
    dragRef.current = source;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "card");
  };

  const dropOnCell = (index: number) => (e: DragEvent) => {
    e.preventDefault();
    const source = dragRef.current;
    if (!source) return;
    dragRef.current = null;
    if (source.type === "cell") apply(moveCellToCell(state, source.index, index));
    else if (source.type === "tableau") apply(moveTableauToCell(state, source.index, index));
    else if (source.type === "foundation") apply(moveFoundationToCell(state, source.index, index));
  };

  const dropOnFoundation = (index: number) => (e: DragEvent) => {
    e.preventDefault();
    const source = dragRef.current;
    if (!source) return;
    dragRef.current = null;
    if (source.type === "cell") {
      const card = state.cells[source.index];
      if (card) {
        const target = foundationTarget(card, state.foundations);
        if (target !== null) apply(moveCellToFoundation(state, source.index, target));
      }
    } else if (source.type === "tableau") {
      const pile = state.tableau[source.index]!;
      if (source.cardIndex === pile.length - 1) {
        const card = pile[source.cardIndex];
        if (card) {
          const target = foundationTarget(card, state.foundations);
          if (target !== null) apply(moveTableauToFoundation(state, source.index, target));
        }
      }
    }
  };

  const dropOnTableau = (index: number) => (e: DragEvent) => {
    e.preventDefault();
    const source = dragRef.current;
    if (!source) return;
    dragRef.current = null;
    if (source.type === "cell") apply(moveCellToTableau(state, source.index, index));
    else if (source.type === "foundation") apply(moveFoundationToTableau(state, source.index, index));
    else if (source.type === "tableau") {
      const count = state.tableau[source.index]!.length - source.cardIndex;
      apply(moveTableauToTableau(state, source.index, count, index));
    }
  };


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
            <FavouriteSwitch gameId="freecell" />
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

        <div className="relative rounded-2xl border border-gold/20 bg-surface/40 p-5 sm:p-8">
          <div className="space-y-8">
            <div className="flex items-start gap-1 sm:gap-2">
              <div className="flex gap-1 sm:gap-2">
                {state.cells.map((card, index) => (
                  <CellSlot
                    key={index}
                    card={card}
                    selected={selection?.type === "cell" && selection.index === index}
                    onClick={() => clickCell(index)}
                    onDoubleClick={() => doubleClickCell(index)}
                    onDragOver={onDragOver}
                    onDrop={dropOnCell(index)}
                    onDragStart={startDrag({ type: "cell", index })}
                  />
                ))}
              </div>
              <div className="flex gap-1 sm:gap-2">
                {state.foundations.map((pile, index) => (
                  <FoundationSlot
                    key={index}
                    pile={pile}
                    suitIndex={index}
                    selected={selection?.type === "foundation" && selection.index === index}
                    onClick={() => clickFoundation(index)}
                    onDragOver={onDragOver}
                    onDrop={dropOnFoundation(index)}
                    onDragStart={startDrag({ type: "foundation", index })}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-8 gap-1 sm:gap-2">
              {state.tableau.map((pile, index) => (
                <TableauPile
                  key={index}
                  pile={pile}
                  index={index}
                  selection={selection}
                  onCardClick={clickTableau}
                  onDoubleClick={doubleClickTableau}
                  onDragOver={onDragOver}
                  onDrop={dropOnTableau(index)}
                  onDragStartCard={(cardIndex) => startDrag({ type: "tableau", index, cardIndex })}
                />
              ))}
            </div>

            <div className="flex flex-col items-center justify-center gap-3 border-t border-gold/15 pt-4 text-center">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="parlorOutline" onClick={confirmReset} className="scale-75 sm:scale-100">
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
                  variant="parlorOutline"
                  onClick={undo}
                  disabled={history.length === 0 || autocompleting}
                  className="scale-75 sm:scale-100"
                >
                  Undo
                </Button>
                <span className="text-sm text-ivory/60">
                  {state.moves} {state.moves === 1 ? "move" : "moves"}
                </span>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-ivory/40">
                Free cells · Foundations · Eight piles
              </span>
            </div>
          </div>

          {state.won && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
              <div className="space-y-4 text-center">
                <div className="text-5xl">🎉</div>
                <h2 className="font-display text-3xl font-bold text-gold">You cleared the table!</h2>
                <p className="mx-auto max-w-sm text-ivory/70">
                  All fifty-two cards made it home to the foundations in {state.moves} moves.
                </p>
                <Button variant="parlor" onClick={reset}>
                  Deal again
                </Button>
              </div>
            </div>
          )}
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


function CardFace({
  card,
  selected = false,
  onClick,
  onDoubleClick,
  onDragStart,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onDragStart?: (e: DragEvent) => void;
}) {
  const red = isRed(card.suit);
  const isFace = card.rank === 1 || card.rank > 10;
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
      draggable={!!onDragStart}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--fc-card-h)] w-[var(--fc-card-w)] select-none rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-[#c0392b]" : "text-brand"
      } ${selected ? "-translate-y-1 ring-2 ring-gold" : ""}`}
    >
      <span className="absolute left-1 top-1 flex flex-col items-center font-display text-xs font-bold leading-none sm:text-lg">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[10px] sm:text-sm">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-2xl sm:text-4xl">
        {isFace ? RANK_LABEL[card.rank] : SUIT_SYMBOL[card.suit]}
      </span>
    </button>
  );
}

function EmptySlot({ onClick, symbol }: { onClick?: () => void; symbol?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Empty pile"
      className="grid h-[var(--fc-card-h)] w-[var(--fc-card-w)] place-items-center rounded-lg border border-dashed border-gold/30 text-base text-gold/30 sm:text-2xl"
    >
      {symbol ?? ""}
    </button>
  );
}

function CellSlot({
  card,
  selected,
  onClick,
  onDoubleClick,
  onDrop,
  onDragOver,
  onDragStart,
}: {
  card: Card | null;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDrop?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDragStart: (e: DragEvent) => void;
}) {
  return (
    <div className="relative" onDragOver={onDragOver} onDrop={onDrop}>
      {card ? (
        <CardFace
          card={card}
          selected={selected}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onDragStart={onDragStart}
        />
      ) : (
        <EmptySlot onClick={onClick} />
      )}
    </div>
  );
}

function FoundationSlot({
  pile,
  suitIndex,
  selected,
  onClick,
  onDrop,
  onDragOver,
  onDragStart,
}: {
  pile: Card[];
  suitIndex: number;
  selected: boolean;
  onClick: () => void;
  onDrop?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDragStart: (e: DragEvent) => void;
}) {
  const top = pile[pile.length - 1];
  const suit = FOUNDATION_SUITS[suitIndex];
  const suitSymbol = suit ? SUIT_SYMBOL[suit] : "";
  return (
    <div className="relative" onDragOver={onDragOver} onDrop={onDrop}>
      {top ? (
        <CardFace card={top} selected={selected} onClick={onClick} onDragStart={onDragStart} />
      ) : (
        <EmptySlot onClick={onClick} symbol={suitSymbol} />
      )}
    </div>
  );
}

function TableauPile({
  pile,
  index,
  selection,
  onCardClick,
  onDoubleClick,
  onDrop,
  onDragOver,
  onDragStartCard,
}: {
  pile: Card[];
  index: number;
  selection: Selection;
  onCardClick: (index: number, cardIndex: number) => void;
  onDoubleClick: (index: number) => void;
  onDrop?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDragStartCard: (cardIndex: number) => (e: DragEvent) => void;
}) {
  return (
    <div className="flex flex-col items-center" onDragOver={onDragOver} onDrop={onDrop}>
      <div className="flex flex-col items-stretch">
        {pile.map((card, i) => {
          const isSelected =
            selection?.type === "tableau" && selection.index === index && selection.cardIndex === i;
          return (
            <div key={card.id} style={{ marginTop: i === 0 ? 0 : "calc(var(--fc-visible) - var(--fc-card-h))" }}>
              <CardFace
                card={card}
                selected={isSelected}
                onClick={() => onCardClick(index, i)}
                onDoubleClick={() => onDoubleClick(index)}
                onDragStart={onDragStartCard(i)}
              />
            </div>
          );
        })}
      </div>
      {pile.length === 0 && <EmptySlot onClick={() => onCardClick(index, 0)} />}
    </div>
  );
}

