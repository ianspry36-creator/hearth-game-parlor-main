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
import { HistoryDialog } from "@/components/parlor/HistoryDialog";
import { ConcedeButton } from "@/components/parlor/ConcedeButton";
import { useSolitaireStats } from "@/lib/solitaireStats";
import { useGameStarted } from "@/lib/games-started";
import { CardMark } from "@/components/parlor/CardMark";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import {
  autoComplete,
  canAutoComplete,
  canPlaceOnTableau,
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

// How long a card takes to glide from the reserve onto a tableau pile.
const FLIGHT_MS = 350;

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

type Selection =
  | { type: "waste" }
  | { type: "reserve" }
  | { type: "foundation"; index: number }
  | { type: "tableau"; index: number; cardIndex: number }
  | null;

type DropTarget =
  | { type: "foundation"; index: number }
  | { type: "tableau"; index: number }
  | null;

type FlyingCard = {
  key: number;
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

function CanfieldTable() {
  const navigate = useNavigate();
  const game = getGame("canfield");
  const [state, setState] = useState<GameState>(() => freshGame(mulberry32(SSR_SEED)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [dragOverTarget, setDragOverTarget] = useState<DropTarget>(null);
  const dragSourceRef = useRef<Selection>(null);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const [conceded, setConceded] = useState(false);
  const { recordResult } = useSolitaireStats(game.id);
  const { end, beginNew, recordAction } = useGameStarted(game.name);
  // Card-flight animation bookkeeping: the reserve card currently gliding onto a
  // tableau pile, plus refs used to measure the reserve's top card and each pile.
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const flightKeyRef = useRef(0);
  const reserveTopRef = useRef<HTMLDivElement | null>(null);
  const wasteTopRef = useRef<HTMLDivElement | null>(null);
  const tableauRefs = useRef<(HTMLDivElement | null)[]>([]);
  const foundationRefs = useRef<(HTMLDivElement | null)[]>([]);
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

    return () => window.clearInterval(id);
  }, []);

  // Start the clock on the first move rather than when the hand is dealt.
  useEffect(() => {
    if (startRef.current === 0 && state.moves > 0) startRef.current = Date.now();
  }, [state.moves]);

  useEffect(() => {
    endedRef.current = state.won || conceded;
    if (state.won && finishedElapsed === null) {
      setFinishedElapsed(elapsed);
    }
  }, [state.won, finishedElapsed, elapsed, conceded]);

  const shownElapsed = finishedElapsed ?? elapsed;

  // A reserve card that was auto-dealt into a just-cleared tableau pile should
  // glide across the board instead of snapping into place.
  const animateSettleFill = (candidate: GameState, fillIndex: number): boolean => {
    const card = candidate.tableau[fillIndex]![0]!;
    const sourceRect = reserveTopRef.current?.getBoundingClientRect();
    const pileRect = tableauRefs.current[fillIndex]?.getBoundingClientRect();

    // Without a measured source or target (e.g. before the board paints) just move.
    if (!sourceRect || !pileRect) return false;

    const key = flightKeyRef.current++;
    const to = { x: pileRect.left, y: pileRect.top };

    // Commit the player's move now but keep the reserve card held out and the
    // cleared pile empty, so the card can be seen flying across the board.
    const intermediate: GameState = {
      ...candidate,
      tableau: candidate.tableau.map((p, i) => (i === fillIndex ? [] : p)),
    };
    setState(intermediate);
    setFlying((current) => [
      ...current,
      { key, card, from: { x: sourceRect.left, y: sourceRect.top }, to },
    ]);

    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== key));
      setState(candidate);
    }, FLIGHT_MS);

    return true;
  };

  const apply = (candidate: GameState) => {
    if (candidate === state) return;
    recordAction("table action");
    const before = state;
    setHistory((h) => [...h, before]);
    setSelection(null);
    if (!candidate.won && canAutoComplete(candidate)) {
      candidate = autoComplete(candidate);
    } else if (candidate.reserve.length < before.reserve.length) {
      // A tableau pile was cleared, so a reserve card was dealt into it
      // automatically. Animate that card gliding from the reserve.
      const movedCard = before.reserve[before.reserve.length - 1]!;
      const fillIndex = candidate.tableau.findIndex(
        (pile) => pile.length > 0 && pile[0]!.id === movedCard.id,
      );
      if (fillIndex !== -1 && animateSettleFill(candidate, fillIndex)) return;
    }
    setState(candidate);
  };

  const animateReserveToTableau = (toIndex: number) => {
    const before = stateRef.current;
    if (before.reserve.length === 0) return;
    const next = moveReserveToTableau(before, toIndex);
    if (next === before) return;

    const card = before.reserve[before.reserve.length - 1]!;
    const sourceRect = reserveTopRef.current?.getBoundingClientRect();
    const pileRect = tableauRefs.current[toIndex]?.getBoundingClientRect();

    // Without a measured source or target (e.g. before the board paints) just move.
    if (!sourceRect || !pileRect) {
      apply(next);
      return;
    }

    const visible =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--canfield-visible"),
      ) || 24;
    const key = flightKeyRef.current++;
    const to = {
      x: pileRect.left,
      y: pileRect.top + before.tableau[toIndex]!.length * visible,
    };

    // Lift the card out of the reserve right away so it visibly flies off, then
    // commit the whole move (recording `before` in history) once it lands.
    setState((current) => ({ ...current, reserve: current.reserve.slice(0, -1) }));
    setSelection(null);
    setFlying((current) => [
      ...current,
      { key, card, from: { x: sourceRect.left, y: sourceRect.top }, to },
    ]);

    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== key));
      setHistory((h) => [...h, before]);
      setState(!next.won && canAutoComplete(next) ? autoComplete(next) : next);
    }, FLIGHT_MS);
  };

  const animateWasteToTableau = (toIndex: number) => {
    const before = stateRef.current;
    if (before.waste.length === 0) return;
    const next = moveWasteToTableau(before, toIndex);
    if (next === before) return;

    const card = before.waste[before.waste.length - 1]!;
    const sourceRect = wasteTopRef.current?.getBoundingClientRect();
    const pileRect = tableauRefs.current[toIndex]?.getBoundingClientRect();

    // Without a measured source or target (e.g. before the board paints) just move.
    if (!sourceRect || !pileRect) {
      apply(next);
      return;
    }

    const visible =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--canfield-visible"),
      ) || 24;
    const key = flightKeyRef.current++;
    const to = {
      x: pileRect.left,
      y: pileRect.top + before.tableau[toIndex]!.length * visible,
    };

    // Lift the card out of the waste right away so it visibly flies off, then
    // commit the whole move (recording `before` in history) once it lands.
    setState((current) => ({ ...current, waste: current.waste.slice(0, -1) }));
    setSelection(null);
    setFlying((current) => [
      ...current,
      { key, card, from: { x: sourceRect.left, y: sourceRect.top }, to },
    ]);

    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== key));
      setHistory((h) => [...h, before]);
      setState(!next.won && canAutoComplete(next) ? autoComplete(next) : next);
    }, FLIGHT_MS);
  };

  const animateWasteToFoundation = (foundationIndex: number) => {
    const before = stateRef.current;
    if (before.waste.length === 0) return;
    const next = moveWasteToFoundation(before, foundationIndex);
    if (next === before) return;

    const card = before.waste[before.waste.length - 1]!;
    const sourceRect = wasteTopRef.current?.getBoundingClientRect();
    const pileRect = foundationRefs.current[foundationIndex]?.getBoundingClientRect();

    // Without a measured source or target (e.g. before the board paints) just move.
    if (!sourceRect || !pileRect) {
      apply(next);
      return;
    }

    const key = flightKeyRef.current++;
    const to = { x: pileRect.left, y: pileRect.top };

    // Lift the card out of the waste right away so it visibly flies off, then
    // commit the whole move (recording `before` in history) once it lands.
    setState((current) => ({ ...current, waste: current.waste.slice(0, -1) }));
    setSelection(null);
    setFlying((current) => [
      ...current,
      { key, card, from: { x: sourceRect.left, y: sourceRect.top }, to },
    ]);

    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== key));
      setHistory((h) => [...h, before]);
      setState(!next.won && canAutoComplete(next) ? autoComplete(next) : next);
    }, FLIGHT_MS);
  };

  const reset = () => {
    setState(freshGame());
    setFlying([]);
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
    if (history.length === 0 || state.won) return;
    recordAction("undo");
    const prev = history[history.length - 1]!;
    setState(prev);
    setHistory(history.slice(0, -1));
    setSelection(null);
  };

  const clickStock = () => apply(drawStock(state, 3));

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
          if (target !== null) animateWasteToFoundation(target);
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
    if (
      selection?.type === "tableau" &&
      selection.index === index &&
      selection.cardIndex === cardIndex
    ) {
      setSelection(null);
      return;
    }
    if (selection) {
      if (selection.type === "waste") animateWasteToTableau(index);
      else if (selection.type === "reserve") animateReserveToTableau(index);
      else if (selection.type === "foundation")
        apply(moveFoundationToTableau(state, selection.index, index));
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
    if (target !== null) {
      animateWasteToFoundation(target);
      setSelection(null);
      return;
    }
    // No foundation for the card: fly it onto the first tableau pile that takes it.
    for (let i = 0; i < state.tableau.length; i += 1) {
      if (canPlaceOnTableau([card], state.tableau[i]!)) {
        animateWasteToTableau(i);
        break;
      }
    }
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

  const clearDrag = () => {
    dragSourceRef.current = null;
    setDragOverTarget(null);
  };

  const beginDrag = (source: Selection, e: DragEvent<HTMLButtonElement>) => {
    if (source?.type === "tableau") {
      const pile = stateRef.current.tableau[source.index]!;
      if (!isRun(pile.slice(source.cardIndex))) {
        e.preventDefault();
        return;
      }
    }
    dragSourceRef.current = source;
    setSelection(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", source ? JSON.stringify(source) : "");
  };

  const highlightFoundation = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget((t) =>
      t?.type === "foundation" && t.index === index ? t : { type: "foundation", index },
    );
  };

  const highlightTableau = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget((t) =>
      t?.type === "tableau" && t.index === index ? t : { type: "tableau", index },
    );
  };

  const dropOnFoundation = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const src = dragSourceRef.current;
    clearDrag();
    if (!src) return;
    const s = stateRef.current;
    if (src.type === "waste") animateWasteToFoundation(index);
    else if (src.type === "reserve") apply(moveReserveToFoundation(s, index));
    else if (src.type === "tableau") {
      if (src.cardIndex === s.tableau[src.index]!.length - 1)
        apply(moveTableauToFoundation(s, src.index, index));
    }
  };

  const dropOnTableau = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const src = dragSourceRef.current;
    clearDrag();
    if (!src) return;
    const s = stateRef.current;
    if (src.type === "waste") animateWasteToTableau(index);
    else if (src.type === "reserve") animateReserveToTableau(index);
    else if (src.type === "foundation") apply(moveFoundationToTableau(s, src.index, index));
    else if (src.type === "tableau") apply(moveTableauToTableau(s, src.index, src.cardIndex, index));
  };

  return (
    <div className="min-h-screen text-cream">
      <div className="mx-auto max-w-5xl px-1.5 py-8 sm:px-6">
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
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-center gap-6 border-y border-gold/15 py-4 text-center">
          <Stat label="Moves" value={String(state.moves)} />
          <Stat label="Time" value={formatElapsed(shownElapsed)} />
          <Button
            variant="parlorGhost"
            className="bg-black text-white border-black hover:bg-black/80"
            onClick={undo}
            disabled={history.length === 0 || state.won || conceded}
          >
            Undo
          </Button>
        </div>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_260px]">
          <div className="select-none relative rounded-2xl border border-gold/15 bg-[#4c9a2a] p-4 sm:p-6">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-6">
              <div className="flex items-start gap-2">
                <StockPile count={state.stock.length} onClick={clickStock} />
                <WastePile
                  cards={state.waste}
                  selected={selection?.type === "waste"}
                  onClick={clickWaste}
                  onDoubleClick={doubleClickWaste}
                  onDragStart={(e) => beginDrag({ type: "waste" }, e)}
                  onDragEnd={clearDrag}
                  topRef={(el) => (wasteTopRef.current = el)}
                />
              </div>
              <div className="flex gap-1">
                {state.foundations.map((pile, index) => (
                  <FoundationSlot
                    key={index}
                    pile={pile}
                    selected={selection?.type === "foundation" && selection.index === index}
                    onClick={() => clickFoundation(index)}
                    onDragStart={(e) => beginDrag({ type: "foundation", index }, e)}
                    onDragEnd={clearDrag}
                    onDragOver={highlightFoundation(index)}
                    onDrop={dropOnFoundation(index)}
                    isDropTarget={dragOverTarget?.type === "foundation" && dragOverTarget.index === index}
                    containerRef={(el) => (foundationRefs.current[index] = el)}
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
                  onDragStart={(e) => beginDrag({ type: "reserve" }, e)}
                  onDragEnd={clearDrag}
                  topRef={(el) => (reserveTopRef.current = el)}
                />
                <span className="text-[10px] uppercase tracking-[0.18em] text-black">
                  Reserve
                </span>
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
                    onCardDragStart={(i, e) => beginDrag({ type: "tableau", index, cardIndex: i }, e)}
                    onDragEnd={clearDrag}
                    onDragOver={highlightTableau(index)}
                    onDrop={dropOnTableau(index)}
                    isDropTarget={dragOverTarget?.type === "tableau" && dragOverTarget.index === index}
                    containerRef={(el) => (tableauRefs.current[index] = el)}
                  />
                ))}
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-black">
              Build the foundations up from the {RANK_LABEL[state.baseRank]}, wrapping King to Ace.
              Double-click a card to send it home.
            </p>

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
                <FavouriteSwitch gameId="canfield" />
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
      {flying.map((flight) => (
        <FlyingCardView key={flight.key} flight={flight} />
      ))}
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
  draggable,
  onDragStart,
  onDragEnd,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
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
      onDoubleClick={onDoubleClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--canfield-card-h)] w-[var(--canfield-card-w)] select-none overflow-hidden rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-destructive" : "text-ink"
      } ${selected ? "-translate-y-1 ring-2 ring-gold" : ""}`}
    >
      <span className="absolute left-1 top-0.5 flex flex-col items-center font-display text-[11px] font-bold leading-none sm:text-sm">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-[10px] sm:text-xs">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span
        aria-hidden
        className={`absolute inset-0 grid place-items-center font-display text-[17px] sm:text-2xl ${
          isFace ? "opacity-90" : "opacity-80"
        }`}
      >
        {isFace ? (
          <span className="flex flex-col items-center leading-none">
            <span className="text-[11px] sm:text-base">{RANK_LABEL[card.rank]}</span>
            <span className="text-[14px] sm:text-[19px]">{SUIT_SYMBOL[card.suit]}</span>
          </span>
        ) : (
          SUIT_SYMBOL[card.suit]
        )}
      </span>
      <span className="absolute bottom-0.5 right-1 flex rotate-180 flex-col items-center font-display text-[11px] font-bold leading-none sm:text-sm">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-[10px] sm:text-xs">{SUIT_SYMBOL[card.suit]}</span>
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
      className="relative block h-[var(--canfield-card-h)] w-[var(--canfield-card-w)] overflow-hidden rounded-lg shadow-md shadow-black/30"
    >
      <img src={cardBackAsset} alt="" aria-hidden className="h-full w-full object-cover" />
    </button>
  );
}

function EmptySlot({
  onClick,
  symbol,
  black,
}: {
  onClick?: () => void;
  symbol?: string;
  black?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Empty pile"
      className={`grid h-[var(--canfield-card-h)] w-[var(--canfield-card-w)] place-items-center rounded-md border border-dashed ${
        black ? "border-black" : "border-gold/30"
      } text-lg text-gold/30`}
    >
      {symbol ?? ""}
    </button>
  );
}

function StockPile({ count, onClick }: { count: number; onClick: () => void }) {
  // A tight stack of card-back "shadows" peeking out behind the stock hints
  // at a deep pile without stretching its footprint.
  const shadowDepth = Math.max(0, Math.min(count - 1, 3));
  return (
    <div className="relative">
      {count > 0 ? (
        <>
          {shadowDepth > 0 && (
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {Array.from({ length: shadowDepth }).map((_, i) => (
                <img
                  key={i}
                  src={cardBackAsset}
                  alt=""
                  className="absolute h-[var(--canfield-card-h)] w-[var(--canfield-card-w)] overflow-hidden rounded-md object-cover shadow-md shadow-black/30"
                  style={{ top: `${-(i + 1) * 2}px`, left: `${-(i + 1) * 2}px` }}
                />
              ))}
            </div>
          )}
          <CardBack onClick={onClick} />
        </>
      ) : (
        <EmptySlot onClick={onClick} />
      )}
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
  onDragStart,
  onDragEnd,
  topRef,
}: {
  cards: Card[];
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: (e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  topRef?: (el: HTMLDivElement | null) => void;
}) {
  const visible = cards.slice(-3);
  if (visible.length === 0) return <EmptySlot black />;
  const top = visible[visible.length - 1]!;
  return (
    <div className="flex items-start">
      {visible.slice(0, -1).map((card) => (
        <div key={card.id} className="-mr-10 sm:-mr-12">
          <CardBack />
        </div>
      ))}
      <div className="relative z-10" ref={topRef}>
        <CardFace
          card={top}
          selected={selected}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      </div>
    </div>
  );
}

function FoundationSlot({
  pile,
  selected,
  onClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isDropTarget,
  containerRef,
}: {
  pile: Card[];
  selected: boolean;
  onClick: () => void;
  onDragStart: (e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  isDropTarget: boolean;
  containerRef?: (el: HTMLDivElement | null) => void;
}) {
  const top = pile[pile.length - 1];
  return (
    <div
      ref={containerRef}
      className={`relative rounded-md ${isDropTarget ? "ring-2 ring-gold" : ""}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {!top ? (
        <EmptySlot onClick={onClick} black />
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
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
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
  onDragStart,
  onDragEnd,
  topRef,
}: {
  cards: Card[];
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: (e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  topRef?: (el: HTMLDivElement | null) => void;
}) {
  const top = cards[cards.length - 1];
  return (
    <div className="relative">
      {!top ? (
        <EmptySlot />
      ) : (
        <div className="flex flex-col items-stretch">
          {/* The reserve fans upward: every card below the playable one peeks a few
              pixels above the card in front of it, so the depth of the pile reads
              at a glance. Only the top card is interactive. */}
          {cards.slice(0, -1).map((card) => (
            <div
              key={card.id}
              className="mb-[calc(var(--canfield-reserve-visible)_-_var(--canfield-card-h))]"
            >
              <CardBack />
            </div>
          ))}
          <div className="relative z-10" ref={topRef}>
            <CardFace
              card={top}
              selected={selected}
              onClick={onClick}
              onDoubleClick={onDoubleClick}
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          </div>
        </div>
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
  onCardDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isDropTarget,
  containerRef,
}: {
  pile: Card[];
  index: number;
  selection: Selection;
  onCardClick: (index: number, cardIndex: number) => void;
  onDoubleClick: (index: number) => void;
  onCardDragStart: (cardIndex: number, e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  isDropTarget: boolean;
  containerRef?: (el: HTMLDivElement | null) => void;
}) {
  const empty = pile.length === 0;
  return (
    <div
      ref={containerRef}
      className={`flex flex-col items-stretch rounded-md ${isDropTarget ? "ring-2 ring-gold" : ""}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {pile.map((card, i) => {
        const isSelected =
          selection?.type === "tableau" && selection.index === index && selection.cardIndex === i;
        return (
          <div
            key={card.id}
            style={{
              marginTop: i === 0 ? 0 : "calc(var(--canfield-visible) - var(--canfield-card-h))",
            }}
          >
            <CardFace
              card={card}
              selected={isSelected}
              onClick={() => onCardClick(index, i)}
              onDoubleClick={() => onDoubleClick(index)}
              draggable
              onDragStart={(e) => onCardDragStart(i, e)}
              onDragEnd={onDragEnd}
            />
          </div>
        );
      })}
      {empty && <EmptySlot />}
    </div>
  );
}

function FlyingCardView({ flight }: { flight: FlyingCard }) {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    let raf = 0;
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setMoved(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  const dx = moved ? flight.to.x - flight.from.x : 0;
  const dy = moved ? flight.to.y - flight.from.y : 0;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 transition-transform ease-out"
      style={{
        left: flight.from.x,
        top: flight.from.y,
        transform: `translate(${dx}px, ${dy}px)`,
        transitionDuration: `${FLIGHT_MS}ms`,
      }}
    >
      <CardFace card={flight.card} />
    </div>
  );
}
