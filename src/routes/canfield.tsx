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
import {
  autoComplete,
  canAutoComplete,
  cardsHome,
  drawStock,
  foundationTarget,
  freshGame,
  isRed,
  isRun,
  moveFoundationToTableau,
  moveReserveToFoundation,
  moveReserveToTableau,
  moveTableauToFoundation,
  moveTableauToTableau,
  moveWasteToFoundation,
  moveWasteToTableau,
  type DrawMode,
  type GameState,
} from "@/lib/canfield";
import { mulberry32 } from "@/lib/random";
import cardBackAsset from "@/assets/card-back.png";

export const Route = createFileRoute("/canfield")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Canfield — Cards and Games" },
      {
        name: "description",
        content:
          "Canfield solitaire in the parlour: build the foundations up from the lead rank, drain the reserve, and send all fifty-two cards home.",
      },
      { property: "og:title", content: "Play Canfield — Cards and Games" },
      {
        property: "og:description",
        content: "A patient game of Canfield solitaire, dealt fresh every hand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CanfieldTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20260908;

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

const BEST_MOVES_KEY = "canfield-best-moves";
const BEST_TIME_KEY = "canfield-best-time";

type Best = { moves: number; time: number };

type Selection =
  | { type: "waste" }
  | { type: "reserve" }
  | { type: "foundation"; index: number }
  | { type: "tableau"; index: number; cardIndex: number }
  | null;

function CanfieldTable() {
  const navigate = useNavigate();
  const game = getGame("canfield");
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
    setHistory((h) => [...h, state]);
    setSelection(null);
    if (!candidate.won && canAutoComplete(candidate)) candidate = autoComplete(candidate);
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
    if (history.length === 0 || state.won) return;
    const prev = history[history.length - 1]!;
    setState(prev);
    setHistory(history.slice(0, -1));
    setSelection(null);
  };

  const clickStock = () => apply(drawStock(state, drawMode));

  const clickWaste = () => {
    if (state.waste.length === 0) return;
    setSelection(selection?.type === "waste" ? null : { type: "waste" });
  };

  const clickReserve = () => {
    if (state.reserve.length === 0) return;
    setSelection(selection?.type === "reserve" ? null : { type: "reserve" });
  };

  const clickFoundation = (index: number) => {
    const currentState = stateRef.current;
    if (selection) {
      if (selection.type === "waste") {
        const card = currentState.waste[currentState.waste.length - 1];
        if (card) {
          const target = foundationTarget(card, currentState.foundations, currentState.baseRank);
          if (target !== null) apply(moveWasteToFoundation(currentState, target));
        }
      } else if (selection.type === "reserve") {
        const card = currentState.reserve[currentState.reserve.length - 1];
        if (card) {
          const target = foundationTarget(card, currentState.foundations, currentState.baseRank);
          if (target !== null) apply(moveReserveToFoundation(currentState, target));
        }
      } else if (selection.type === "tableau") {
        const pile = currentState.tableau[selection.index]!;
        if (selection.cardIndex === pile.length - 1) {
          const card = pile[selection.cardIndex];
          if (card) {
            const target = foundationTarget(card, currentState.foundations, currentState.baseRank);
            if (target !== null) apply(moveTableauToFoundation(currentState, selection.index, target));
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
    if (selection?.type === "tableau" && selection.index === index && selection.cardIndex === cardIndex) {
      setSelection(null);
      return;
    }
    if (selection) {
      if (selection.type === "waste") apply(moveWasteToTableau(state, index));
      else if (selection.type === "reserve") apply(moveReserveToTableau(state, index));
      else if (selection.type === "foundation") apply(moveFoundationToTableau(state, selection.index, index));
      else if (selection.type === "tableau")
        apply(moveTableauToTableau(state, selection.index, selection.cardIndex, index));
      return;
    }
    const pile = state.tableau[index]!;
    if (pile.length === 0) return;
    if (isRun(pile.slice(cardIndex))) setSelection({ type: "tableau", index, cardIndex });
  };

  const doubleClickWaste = () => {
    if (state.waste.length === 0) return;
    const card = state.waste[state.waste.length - 1]!;
    const target = foundationTarget(card, state.foundations, state.baseRank);
    if (target !== null) apply(moveWasteToFoundation(state, target));
    setSelection(null);
  };

  const doubleClickReserve = () => {
    if (state.reserve.length === 0) return;
    const card = state.reserve[state.reserve.length - 1]!;
    const target = foundationTarget(card, state.foundations, state.baseRank);
    if (target !== null) apply(moveReserveToFoundation(state, target));
    setSelection(null);
  };

  const doubleClickTableau = (index: number) => {
    const pile = state.tableau[index]!;
    if (pile.length === 0) return;
    const card = pile[pile.length - 1]!;
    const target = foundationTarget(card, state.foundations, state.baseRank);
    if (target !== null) apply(moveTableauToFoundation(state, index, target));
    setSelection(null);
  };

  return (
    <div className="min-h-screen bg-brand text-cream">
      <div className="mx-auto max-w-5xl px-6 py-8">
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
              <h1 className="font-display text-2xl font-bold leading-tight">Canfield</h1>
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
            <FavouriteSwitch gameId="canfield" />
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
          <Stat label="Moves" value={String(state.moves)} />
          <Stat label="Time" value={formatElapsed(shownElapsed)} />
          <Stat label="Cards home" value={String(cardsHome(state))} />
          <Stat label="Best moves" value={best.moves > 0 ? String(best.moves) : "—"} />
          <Stat label="Best time" value={best.time > 0 ? formatElapsed(best.time) : "—"} />
        </div>

        <div className="relative mt-8 rounded-2xl border border-gold/15 bg-surface/40 p-4 sm:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-start gap-2">
              <StockPile count={state.stock.length} onClick={clickStock} />
              <WastePile
                cards={state.waste}
                selected={selection?.type === "waste"}
                onClick={clickWaste}
                onDoubleClick={doubleClickWaste}
              />
            </div>
            <div className="flex gap-2">
              {state.foundations.map((pile, index) => (
                <FoundationSlot
                  key={index}
                  pile={pile}
                  selected={selection?.type === "foundation" && selection.index === index}
                  onClick={() => clickFoundation(index)}
                />
              ))}
            </div>
          </div>

          <div className="flex items-start justify-center gap-3 sm:gap-6">
            <div className="flex flex-col items-center gap-1">
              <ReservePile
                cards={state.reserve}
                selected={selection?.type === "reserve"}
                onClick={clickReserve}
                onDoubleClick={doubleClickReserve}
              />
              <span className="text-[10px] uppercase tracking-[0.18em] text-ivory/45">Reserve</span>
            </div>
            <div className="flex gap-2 sm:gap-3">
              {state.tableau.map((pile, index) => (
                <TableauPile
                  key={index}
                  pile={pile}
                  selection={selection}
                  index={index}
                  onCardClick={clickTableau}
                  onDoubleClick={doubleClickTableau}
                />
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-ivory/50">
            Build the foundations up from the {RANK_LABEL[state.baseRank]}, wrapping King to Ace.
            Double-click a card to send it home.
          </p>

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
              variant="parlorOutline"
              onClick={undo}
              disabled={history.length === 0 || state.won}
              className="scale-75 sm:scale-100"
            >
              Undo
            </Button>
            <button
              type="button"
              onClick={() => setDrawMode(drawMode === 3 ? 1 : 3)}
              className="cursor-pointer rounded-full border border-gold/30 px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-ivory/70 transition-colors hover:text-gold"
            >
              Draw {drawMode === 3 ? 3 : 1}
            </button>
          </div>
          <p className="text-xs text-ivory/40">
            Click the stock to deal. Select a card, then click where it should go.
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

function CardFace({
  card,
  selected = false,
  onClick,
  onDoubleClick,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}) {
  const red = isRed(card.suit);
  const isFaceCard = card.rank === 1 || card.rank > 10;
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--canfield-card-h)] w-[var(--canfield-card-w)] select-none rounded-md border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-[#c0392b]" : "text-brand"
      } ${selected ? "-translate-y-1 ring-2 ring-gold" : ""}`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-[9px] font-bold leading-none sm:left-1 sm:top-1 sm:text-sm">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[8px] sm:text-xs">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-sm sm:text-2xl">
        {isFaceCard ? RANK_LABEL[card.rank] : SUIT_SYMBOL[card.suit]}
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
      className="relative block h-[var(--canfield-card-h)] w-[var(--canfield-card-w)] overflow-hidden rounded-md shadow-md shadow-black/30"
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
      className="grid h-[var(--canfield-card-h)] w-[var(--canfield-card-w)] place-items-center rounded-md border border-dashed border-gold/30 text-lg text-gold/30"
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
}: {
  cards: Card[];
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const visible = cards.slice(-3);
  if (visible.length === 0) return <EmptySlot />;
  const top = visible[visible.length - 1]!;
  return (
    <div className="flex items-start">
      {visible.slice(0, -1).map((card) => (
        <div key={card.id} className="-mr-10 sm:-mr-12">
          <CardBack />
        </div>
      ))}
      <div className="relative z-10">
        <CardFace card={top} selected={selected} onClick={onClick} onDoubleClick={onDoubleClick} />
      </div>
    </div>
  );
}

function FoundationSlot({
  pile,
  selected,
  onClick,
}: {
  pile: Card[];
  selected: boolean;
  onClick: () => void;
}) {
  const top = pile[pile.length - 1];
  return (
    <div className="relative">
      {!top ? (
        <EmptySlot onClick={onClick} />
      ) : (
        <>
          {pile.length > 1 && (
            <div className="absolute -top-1 opacity-40">
              <CardBack />
            </div>
          )}
          <div className="relative">
            <CardFace card={top} selected={selected} onClick={onClick} />
          </div>
        </>
      )}
    </div>
  );
}

function ReservePile({
  cards,
  selected,
  onClick,
  onDoubleClick,
}: {
  cards: Card[];
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const top = cards[cards.length - 1];
  return (
    <div className="relative">
      {!top ? (
        <EmptySlot />
      ) : (
        <>
          {cards.length > 1 && (
            <div className="absolute -top-1.5 opacity-60">
              <CardBack />
            </div>
          )}
          <div className="relative">
            <CardFace card={top} selected={selected} onClick={onClick} onDoubleClick={onDoubleClick} />
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
}: {
  pile: Card[];
  index: number;
  selection: Selection;
  onCardClick: (index: number, cardIndex: number) => void;
  onDoubleClick: (index: number) => void;
}) {
  const empty = pile.length === 0;
  return (
    <div className="flex flex-col items-stretch">
      {pile.map((card, i) => {
        const isSelected =
          selection?.type === "tableau" && selection.index === index && selection.cardIndex === i;
        return (
          <div
            key={card.id}
            style={{ marginTop: i === 0 ? 0 : "calc(var(--canfield-visible) - var(--canfield-card-h))" }}
          >
            <CardFace
              card={card}
              selected={isSelected}
              onClick={() => onCardClick(index, i)}
              onDoubleClick={() => onDoubleClick(index)}
            />
          </div>
        );
      })}
      {empty && <EmptySlot />}
    </div>
  );
}



