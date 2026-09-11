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
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import {
  autoComplete,
  canAutoComplete,
  canPlaceOnTableau,
  drawStock,
  flipTableau,
  FOUNDATION_SUITS,
  foundationTarget,
  freshGame,
  isRed,
  isRun,
  moveFoundationToTableau,
  moveTableauToFoundation,
  moveTableauToTableau,
  moveWasteToFoundation,
  moveWasteToTableau,
  type DrawMode,
  type GameState,
  type TableauPile as TableauPileData,
} from "@/lib/solitaire";
import { mulberry32 } from "@/lib/random";
import cardBackAsset from "@/assets/card-back.png";

export const Route = createFileRoute("/solitaire")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Solitaire — Cards and Games" },
      {
        name: "description",
        content:
          "Klondike solitaire in the parlor: deal the tableau, build the foundations by suit, and send all fifty-two cards home.",
      },
      { property: "og:title", content: "Play Solitaire — Cards and Games" },
      {
        property: "og:description",
        content: "A patient game of Klondike solitaire, dealt fresh every hand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SolitaireTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20260902;

type Selection =
  | { type: "waste" }
  | { type: "tableau"; index: number; cardIndex: number }
  | { type: "foundation"; index: number }
  | null;

type DragSource =
  | { type: "waste" }
  | { type: "tableau"; index: number; cardIndex: number }
  | { type: "foundation"; index: number };

const CARD_H = 90; // px — matches h-[90px]
const FACE_DOWN_VISIBLE = 15;
const FACE_UP_VISIBLE = 15;

function SolitaireTable() {
  const navigate = useNavigate();
  const game = getGame("solitaire");
  const [state, setState] = useState<GameState>(() => freshGame(mulberry32(SSR_SEED)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>(3);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const { recordResult } = useSolitaireStats(game.id);
  const prevWonRef = useRef(false);
  useEffect(() => {
    if (state.won && !prevWonRef.current) recordResult("win");
    prevWonRef.current = state.won;
  }, [state.won, recordResult]);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setState(freshGame());
    setHistory([]);
    setSelection(null);
  }, []);

  const apply = (candidate: GameState) => {
    if (candidate === state) return;
    let next = candidate;
    setHistory((h) => [...h, state]);
    if (!next.won && canAutoComplete(next)) next = autoComplete(next);
    setState(next);
    setSelection(null);
  };

  const reset = () => {
    setState(freshGame());
    setHistory([]);
    setSelection(null);
  };

  const gameInProgress = state.moves > 0;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : reset());
  const confirmHome = () => (gameInProgress ? setConfirming("home") : void navigate({ to: "/" }));

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1]!;
    setState({ ...prev, moves: prev.moves + 1 });
    setHistory(history.slice(0, -1));
    setSelection(null);
  };

  const clickStock = () => apply(drawStock(state, drawMode));

  const clickWaste = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (state.waste.length === 0) return;
    setSelection(selection?.type === "waste" ? null : { type: "waste" });
  };

  const doubleClickWaste = () => {
    if (state.waste.length === 0) return;
    const card = state.waste[state.waste.length - 1]!;
    // Prefer a foundation move, then fall back to the first legal tableau pile.
    const target = foundationTarget(card, state.foundations);
    if (target !== null) {
      apply(moveWasteToFoundation(state, target));
    } else {
      const to = state.tableau.findIndex((pile) => canPlaceOnTableau([card], pile));
      if (to !== -1) apply(moveWasteToTableau(state, to));
    }
    setSelection(null);
  };

  const clickFoundation = (index: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const currentState = stateRef.current;
    if (selection) {
      if (selection.type === "waste") {
        const card = currentState.waste[currentState.waste.length - 1];
        if (card) {
          const target = foundationTarget(card, currentState.foundations);
          if (target !== null) apply(moveWasteToFoundation(currentState, target));
        }
      } else if (selection.type === "tableau") {
        const pile = currentState.tableau[selection.index]!;
        if (selection.cardIndex === pile.faceUp.length - 1) {
          const card = pile.faceUp[selection.cardIndex];
          if (card) {
            const target = foundationTarget(card, currentState.foundations);
            if (target !== null)
              apply(moveTableauToFoundation(currentState, selection.index, target));
          }
        } else {
          setSelection(null);
        }
      } else {
        setSelection(null);
      }
      return;
    }
    if (currentState.foundations[index]!.length > 0) setSelection({ type: "foundation", index });
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
      if (selection.type === "waste") apply(moveWasteToTableau(state, index));
      else if (selection.type === "foundation")
        apply(moveFoundationToTableau(state, selection.index, index));
      else if (selection.type === "tableau") {
        const count = state.tableau[selection.index]!.faceUp.length - selection.cardIndex;
        apply(moveTableauToTableau(state, selection.index, count, index));
      }
      return;
    }
    const pile = state.tableau[index]!;
    if (pile.faceUp.length === 0) {
      apply(flipTableau(state, index));
      return;
    }
    if (isRun(pile.faceUp.slice(cardIndex))) setSelection({ type: "tableau", index, cardIndex });
  };

  const doubleClickTableau = (index: number) => {
    const pile = state.tableau[index]!;
    if (pile.faceUp.length === 0) return;
    const card = pile.faceUp[pile.faceUp.length - 1]!;
    // Prefer a foundation move, then fall back to the first legal tableau pile.
    const target = foundationTarget(card, state.foundations);
    if (target !== null) {
      apply(moveTableauToFoundation(state, index, target));
    } else {
      const to = state.tableau.findIndex((p, i) => i !== index && canPlaceOnTableau([card], p));
      if (to !== -1) apply(moveTableauToTableau(state, index, 1, to));
    }
    setSelection(null);
  };

  const dragRef = useRef<{
    source: DragSource;
    cards: Card[];
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragGhost, setDragGhost] = useState<{ cards: Card[]; x: number; y: number } | null>(null);

  const cardsFor = (source: DragSource): Card[] => {
    const s = stateRef.current;
    if (source.type === "waste") return s.waste.slice(-1);
    if (source.type === "foundation") return s.foundations[source.index]!.slice(-1);
    return s.tableau[source.index]!.faceUp.slice(source.cardIndex);
  };

  const beginDrag = (source: DragSource) => (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const cards = cardsFor(source);
    if (cards.length === 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { source, cards, startX: e.clientX, startY: e.clientY, moved: false };
    setDragGhost({ cards, x: e.clientX, y: e.clientY });
  };

  const moveDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8)
      drag.moved = true;
    setDragGhost({ cards: drag.cards, x: e.clientX, y: e.clientY });
  };

  const dropOntoTableau = (source: DragSource, index: number) => {
    const s = stateRef.current;
    if (source.type === "waste") apply(moveWasteToTableau(s, index));
    else if (source.type === "foundation") apply(moveFoundationToTableau(s, source.index, index));
    else if (source.type === "tableau") {
      const count = s.tableau[source.index]!.faceUp.length - source.cardIndex;
      apply(moveTableauToTableau(s, source.index, count, index));
    }
  };

  const dropOntoFoundation = (source: DragSource) => {
    const s = stateRef.current;
    if (source.type === "waste") {
      const card = s.waste[s.waste.length - 1];
      if (card) {
        const target = foundationTarget(card, s.foundations);
        if (target !== null) apply(moveWasteToFoundation(s, target));
      }
    } else if (source.type === "tableau") {
      const pile = s.tableau[source.index]!;
      if (source.cardIndex === pile.faceUp.length - 1) {
        const card = pile.faceUp[source.cardIndex];
        if (card) {
          const target = foundationTarget(card, s.foundations);
          if (target !== null) apply(moveTableauToFoundation(s, source.index, target));
        }
      }
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
      if (kind === "tableau") dropOntoTableau(drag.source, Number(drop.getAttribute("data-index")));
      else if (kind === "foundation") dropOntoFoundation(drag.source);
    }
  };

  return (
    <div className="min-h-screen bg-brand text-cream">
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
              <h1 className="font-display text-2xl font-bold leading-tight">Solitaire</h1>
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
          <div className="relative rounded-2xl border border-gold/20 bg-surface/40 p-5 sm:p-8">
            <div className="space-y-8">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="flex items-start gap-4">
                  <StockPile count={state.stock.length} onClick={clickStock} />
                  <WastePile
                    cards={state.waste}
                    selected={selection?.type === "waste"}
                    onClick={clickWaste}
                    onDoubleClick={doubleClickWaste}
                    onPointerDown={beginDrag({ type: "waste" })}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                  />
                </div>
                <div className="flex gap-2">
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
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {state.tableau.map((pile, index) => (
                  <TableauPile
                    key={index}
                    pile={pile}
                    index={index}
                    selection={selection}
                    onCardClick={clickTableau}
                    onDoubleClick={doubleClickTableau}
                    onPointerDownCard={(cardIndex) => beginDrag({ type: "tableau", index, cardIndex })}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                  />
                ))}
              </div>

              <div className="border-t border-gold/15 pt-4 text-center">
                <span className="text-sm text-ivory/60">
                  {state.moves} {state.moves === 1 ? "move" : "moves"}
                </span>
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
                  disabled={history.length === 0}
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
                <FavouriteSwitch gameId="solitaire" />
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

      {dragGhost && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: dragGhost.x - 32, top: dragGhost.y - 45 }}
        >
          <div className="flex flex-col items-stretch">
            {dragGhost.cards.map((card, i) => (
              <div
                key={card.id}
                style={{ marginTop: i === 0 ? 0 : -(CARD_H - FACE_UP_VISIBLE) }}
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
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
}) {
  const red = isRed(card.suit);
  const isFace = card.rank === 1 || card.rank > 10;
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label={cardLabel(card)}
      className={`relative block h-[90px] w-16 touch-none select-none rounded-md border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-[#c0392b]" : "text-brand"
      } ${selected ? "-translate-y-1 ring-2 ring-gold" : ""}`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-sm font-bold leading-none">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="text-xs">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-2xl">
        {isFace ? RANK_LABEL[card.rank] : SUIT_SYMBOL[card.suit]}
      </span>
    </button>
  );
}

function CardBack({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Face-down card"
      className="relative block h-[90px] w-16 overflow-hidden rounded-md shadow-md shadow-black/30"
    >
      <img src={cardBackAsset} alt="" aria-hidden className="h-full w-full object-cover" />
    </button>
  );
}

function EmptySlot({ onClick, symbol }: { onClick?: () => void; symbol?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Empty pile"
      className="grid h-[90px] w-16 place-items-center rounded-md border border-dashed border-gold/30 text-lg text-gold/30"
    >
      {symbol ?? ""}
    </button>
  );
}

function StockPile({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <div className="relative">
      {count > 0 ? <CardBack onClick={onClick} /> : <EmptySlot onClick={onClick} />}
      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-ivory/50">
        {count}
      </span>
    </div>
  );
}

function WastePile({
  cards,
  selected,
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  cards: Card[];
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}) {
  const top = cards[cards.length - 1];
  if (!top) return <EmptySlot />;
  return (
    <div className="relative">
      {cards.length > 1 && (
        <div className="absolute -left-1.5 top-1 opacity-50">
          <CardBack />
        </div>
      )}
      {cards.length > 2 && (
        <div className="absolute -left-3 top-2 opacity-30">
          <CardBack />
        </div>
      )}
      <div className="relative">
        <CardFace
          card={top}
          selected={selected}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
    </div>
  );
}

function FoundationSlot({
  pile,
  suitIndex,
  selected,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  pile: Card[];
  suitIndex: number;
  selected: boolean;
  onClick: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}) {
  const top = pile[pile.length - 1];
  const suit = FOUNDATION_SUITS[suitIndex];
  const suitSymbol = suit ? SUIT_SYMBOL[suit] : "";
  return (
    <div className="relative" data-drop="foundation">
      {!top ? (
        <EmptySlot onClick={onClick} symbol={suitSymbol} />
      ) : (
        <>
          {pile.length > 1 && (
            <div className="absolute -top-1 opacity-40">
              <CardBack />
            </div>
          )}
          <div className="relative">
            <CardFace
              card={top}
              selected={selected}
              onClick={onClick}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
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
  onCardClick,
  onDoubleClick,
  onPointerDownCard,
  onPointerMove,
  onPointerUp,
}: {
  pile: TableauPileData;
  index: number;
  selection: Selection;
  onCardClick: (index: number, cardIndex: number) => void;
  onDoubleClick: (index: number) => void;
  onPointerDownCard: (cardIndex: number) => (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}) {
  const empty = pile.faceDown.length === 0 && pile.faceUp.length === 0;
  const canFlip = pile.faceUp.length === 0 && pile.faceDown.length > 0;
  return (
    <div className="flex flex-col items-center" data-drop="tableau" data-index={index}>
      <div className="flex flex-col items-stretch">
        {pile.faceDown.map((card, i) => {
          const isTop = i === pile.faceDown.length - 1;
          return (
            <div key={card.id} style={{ marginTop: i === 0 ? 0 : -(CARD_H - FACE_DOWN_VISIBLE) }}>
              {canFlip && isTop ? <CardBack onClick={() => onCardClick(index, 0)} /> : <CardBack />}
            </div>
          );
        })}
        {pile.faceUp.map((card, i) => {
          const isSelected =
            selection?.type === "tableau" && selection.index === index && selection.cardIndex === i;
          return (
            <div
              key={card.id}
              style={{
                marginTop: pile.faceDown.length === 0 && i === 0 ? 0 : -(CARD_H - FACE_UP_VISIBLE),
              }}
            >
              <CardFace
                card={card}
                selected={isSelected}
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
      {empty && <EmptySlot onClick={() => onCardClick(index, 0)} />}
    </div>
  );
}
