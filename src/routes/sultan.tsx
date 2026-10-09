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
import { useIsMobile } from "@/hooks/use-mobile";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import {
  cardsHome,
  drawStock,
  foundationComplete,
  foundationTarget,
  freshGame,
  isRed,
  moveReserveToFoundation,
  moveWasteToFoundation,
  moveWasteToReserve,
  readPackCount,
  redeal,
  writePackCount,
  type GameState,
  type PackCount,
} from "@/lib/sultan";
import { mulberry32 } from "@/lib/random";
import cardBackAsset from "@/assets/card-back.png";

export const Route = createFileRoute("/sultan")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Sultan Solitaire — Cards and Games" },
      {
        name: "description",
        content:
          "Sultan solitaire in the parlour: ring the King of Hearts with foundations built up from the seed rank and send every card home.",
      },
      { property: "og:title", content: "Play Sultan Solitaire — Cards and Games" },
      {
        property: "og:description",
        content: "A patient game of Sultan solitaire, dealt fresh every hand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SultanTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20260910;

// How long a card takes to glide between two spots on the table.
const FLIGHT_MS = 350;

// How far each waste card overlaps the one before it when fanned out.
const WASTE_SPREAD = 22;

// How many waste cards can fan out before the overlap has to shrink so the
// fan never runs off the board. Wider on desktop than on mobile.
const WASTE_MAX_FAN_DESKTOP = 22;
const WASTE_MAX_FAN_MOBILE = 12;

// The per-card overlap at a given waste size. Once the waste grows past the
// comfortable fan size, the overlap shrinks proportionally so the total fan
// width stays fixed instead of spilling off screen.
function wasteSpread(count: number, isMobile: boolean): number {
  const maxFan = isMobile ? WASTE_MAX_FAN_MOBILE : WASTE_MAX_FAN_DESKTOP;
  if (count <= maxFan) return WASTE_SPREAD;
  return (WASTE_SPREAD * (maxFan - 1)) / (count - 1);
}

// The reach of the one-pack ring of foundations, as a percentage of the ring
// container's width and height. The vertical reach is larger so the Ace of
// Hearts (above) and the King of Diamonds (below) clear the now-larger Sultan.
const RING_RADIUS_X_PCT = 48;
const RING_RADIUS_Y_PCT = 66;

// Extra breathing room between the Sultan and the ring of foundations, so the
// surrounding Kings never crowd the centre card (a 25% increase in spacing).
const FOUNDATION_SPREAD = 1.25;

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

type DragSource = { type: "waste" } | { type: "reserve"; index: number };
type Selection = DragSource | null;

type DropTarget = { type: "foundation"; index: number } | { type: "reserve"; index: number } | null;

type FlyingCard = {
  key: number;
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

// Reads the responsive card size from CSS variables so the drag ghost can be
// centred under the pointer.
function sultanCardDims(): { w: number; h: number } {
  const styles = getComputedStyle(document.documentElement);
  const parse = (name: string, fallback: number) => {
    const value = parseFloat(styles.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  return { w: parse("--sultan-card-w", 79), h: parse("--sultan-card-h", 110) };
}
function SultanTable() {
  const navigate = useNavigate();
  const game = getGame("sultan");
  const isMobile = useIsMobile();
  const [packs, setPacks] = useState<PackCount>(2);
  const [state, setState] = useState<GameState>(() => freshGame(2, mulberry32(SSR_SEED)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [dragOverTarget, setDragOverTarget] = useState<DropTarget>(null);
  const dragRef = useRef<{
    source: DragSource;
    card: Card;
    startX: number;
    startY: number;
    moved: boolean;
    w: number;
    h: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragGhost, setDragGhost] = useState<{
    source: DragSource;
    card: Card;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const [conceded, setConceded] = useState(false);
  const { recordResult } = useSolitaireStats(game.id);
  const { end, beginNew, recordAction } = useGameStarted(game.name);
  // Card-flight animation bookkeeping: the waste card gliding onto a foundation,
  // plus refs used to measure the waste's top card and each foundation.
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const flightKeyRef = useRef(0);
  const wasteTopRef = useRef<HTMLDivElement | null>(null);
  const wasteContainerRef = useRef<HTMLDivElement | null>(null);
  const stockRef = useRef<HTMLDivElement | null>(null);
  const foundationRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reserveRefs = useRef<(HTMLDivElement | null)[]>([]);
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
    const saved = readPackCount();
    setPacks(saved);
    setState(freshGame(saved));
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
  const totalHome = state.foundations.length * 13;

  const apply = (candidate: GameState) => {
    if (candidate === state) return;
    setHistory((h) => [...h, state]);
    setSelection(null);
    setState(candidate);
  };

  const animateWasteToFoundation = (
    foundationIndex: number,
    fromOverride?: { x: number; y: number },
  ) => {
    const before = stateRef.current;
    if (before.waste.length === 0) return;
    const next = moveWasteToFoundation(before, foundationIndex);
    if (next === before) return;
    recordAction("waste to foundation");

    const card = before.waste[before.waste.length - 1]!;
    const sourceRect = wasteTopRef.current?.getBoundingClientRect();
    const pileRect = foundationRefs.current[foundationIndex]?.getBoundingClientRect();

    // Without a measured source or target (e.g. before the board paints) just move.
    if (!sourceRect || !pileRect) {
      apply(next);
      return;
    }

    const key = flightKeyRef.current++;
    const from = fromOverride
      ? {
          x: fromOverride.x - sourceRect.width / 2,
          y: fromOverride.y - sourceRect.height / 2,
        }
      : { x: sourceRect.left, y: sourceRect.top };
    const to = { x: pileRect.left, y: pileRect.top };

    // Lift the card out of the waste right away so it visibly flies off, then
    // commit the whole move (recording `before` in history) once it lands.
    setState((current) => ({ ...current, waste: current.waste.slice(0, -1) }));
    setSelection(null);
    setFlying((current) => [...current, { key, card, from, to }]);

    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== key));
      setHistory((h) => [...h, before]);
      setState(next);
    }, FLIGHT_MS);
  };

  const animateReserveToFoundation = (
    reserveIndex: number,
    foundationIndex: number,
    fromOverride?: { x: number; y: number },
  ) => {
    const before = stateRef.current;
    const card = before.reserves[reserveIndex];
    if (card == null) return;
    const next = moveReserveToFoundation(before, reserveIndex, foundationIndex);
    if (next === before) return;
    recordAction("reserve to foundation");

    const sourceRect = reserveRefs.current[reserveIndex]?.getBoundingClientRect();
    const pileRect = foundationRefs.current[foundationIndex]?.getBoundingClientRect();

    if (!sourceRect || !pileRect) {
      apply(next);
      return;
    }

    const key = flightKeyRef.current++;
    const from = fromOverride
      ? {
          x: fromOverride.x - sourceRect.width / 2,
          y: fromOverride.y - sourceRect.height / 2,
        }
      : { x: sourceRect.left, y: sourceRect.top };
    const to = { x: pileRect.left, y: pileRect.top };

    setState((current) => ({
      ...current,
      reserves: current.reserves.map((r, i) => (i === reserveIndex ? null : r)),
    }));
    setSelection(null);
    setFlying((current) => [...current, { key, card, from, to }]);

    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== key));
      setHistory((h) => [...h, before]);
      setState(next);
    }, FLIGHT_MS);
  };

  const animateWasteToReserve = (
    reserveIndex: number,
    fromOverride?: { x: number; y: number },
  ) => {
    const before = stateRef.current;
    if (before.waste.length === 0) return;
    const next = moveWasteToReserve(before, reserveIndex);
    if (next === before) return;
    recordAction("waste to reserve");

    const card = before.waste[before.waste.length - 1]!;
    const sourceRect = wasteTopRef.current?.getBoundingClientRect();
    const cellRect = reserveRefs.current[reserveIndex]?.getBoundingClientRect();

    if (!sourceRect || !cellRect) {
      apply(next);
      return;
    }

    const key = flightKeyRef.current++;
    const from = fromOverride
      ? {
          x: fromOverride.x - sourceRect.width / 2,
          y: fromOverride.y - sourceRect.height / 2,
        }
      : { x: sourceRect.left, y: sourceRect.top };
    const to = { x: cellRect.left, y: cellRect.top };

    setState((current) => ({ ...current, waste: current.waste.slice(0, -1) }));
    setSelection(null);
    setFlying((current) => [...current, { key, card, from, to }]);

    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== key));
      setHistory((h) => [...h, before]);
      setState(next);
    }, FLIGHT_MS);
  };

  const startFresh = (p: PackCount) => {
    setPacks(p);
    writePackCount(p);
    setState(freshGame(p));
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

  const reset = () => startFresh(packs);

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

  const cyclePacks = () => {
    if (gameInProgress) return;
    startFresh(packs === 2 ? 1 : 2);
  };

  const undo = () => {
    if (history.length === 0 || state.won) return;
    recordAction("undo");
    const prev = history[history.length - 1]!;
    const curr = stateRef.current;

    const commitInstant = () => {
      setState(prev);
      setHistory(history.slice(0, -1));
      setSelection(null);
    };

    // A redeal reverses many cards at once — leave that instantaneous.
    if (curr.stock.length > prev.stock.length) {
      commitInstant();
      return;
    }

    // Work out the single card the last move carried, and where it came from,
    // so it can glide home instead of teleporting.
    let card: Card | null = null;
    let fromRect: DOMRect | null = null;
    let toRect: DOMRect | null = null;
    let lifted: GameState = curr;

    if (curr.stock.length < prev.stock.length) {
      // A card was drawn from the stock: it currently sits on top of the waste.
      card = curr.waste[curr.waste.length - 1] ?? null;
      fromRect = wasteTopRef.current?.getBoundingClientRect() ?? null;
      toRect = stockRef.current?.getBoundingClientRect() ?? null;
      if (card) lifted = { ...curr, waste: curr.waste.slice(0, -1) };
    } else if (curr.waste.length < prev.waste.length) {
      const reserveIndex = curr.reserves.findIndex(
        (c, i) => c != null && prev.reserves[i] == null,
      );
      if (reserveIndex !== -1) {
        // Waste → reserve.
        card = curr.reserves[reserveIndex];
        fromRect = reserveRefs.current[reserveIndex]?.getBoundingClientRect() ?? null;
        toRect = wasteTopRef.current?.getBoundingClientRect() ?? null;
        lifted = {
          ...curr,
          reserves: curr.reserves.map((r, i) => (i === reserveIndex ? null : r)),
        };
      } else {
        // Waste → foundation.
        const foundationIndex = curr.foundations.findIndex(
          (p, i) => p.length > prev.foundations[i].length,
        );
        if (foundationIndex === -1) {
          commitInstant();
          return;
        }
        const pile = curr.foundations[foundationIndex]!;
        card = pile[pile.length - 1]!;
        fromRect = foundationRefs.current[foundationIndex]?.getBoundingClientRect() ?? null;
        toRect = wasteTopRef.current?.getBoundingClientRect() ?? null;
        lifted = {
          ...curr,
          foundations: curr.foundations.map((p, i) =>
            i === foundationIndex ? p.slice(0, -1) : p,
          ),
        };
      }
    } else {
      // Reserve → foundation.
      const reserveIndex = curr.reserves.findIndex(
        (c, i) => c == null && prev.reserves[i] != null,
      );
      const foundationIndex = curr.foundations.findIndex(
        (p, i) => p.length > prev.foundations[i].length,
      );
      if (reserveIndex === -1 || foundationIndex === -1) {
        commitInstant();
        return;
      }
      const pile = curr.foundations[foundationIndex]!;
      card = pile[pile.length - 1]!;
      fromRect = foundationRefs.current[foundationIndex]?.getBoundingClientRect() ?? null;
      toRect = reserveRefs.current[reserveIndex]?.getBoundingClientRect() ?? null;
      lifted = {
        ...curr,
        foundations: curr.foundations.map((p, i) =>
          i === foundationIndex ? p.slice(0, -1) : p,
        ),
      };
    }

    if (!card || !fromRect || !toRect) {
      commitInstant();
      return;
    }

    const key = flightKeyRef.current++;
    setState(lifted);
    setSelection(null);
    setFlying((current) => [
      ...current,
      {
        key,
        card,
        from: { x: fromRect.left, y: fromRect.top },
        to: { x: toRect.left, y: toRect.top },
      },
    ]);

    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== key));
      setState(prev);
      setHistory(history.slice(0, -1));
    }, FLIGHT_MS);
  };

  const clickStock = () => {
    if (state.won || conceded) return;
    if (state.stock.length > 0) {
      const before = stateRef.current;
      const next = drawStock(before);
      if (next === before) return;
      recordAction("stock draw");
      const card = before.stock[before.stock.length - 1]!;
      const stockRect = stockRef.current?.getBoundingClientRect();
      const wasteRect = wasteContainerRef.current?.getBoundingClientRect();
      if (!stockRect || !wasteRect) {
        apply(next);
        return;
      }
      // The freshly drawn card lands at the end of the waste fan. Its overlap
      // already accounts for the fan shrinking once the waste grows large.
      const targetIndex = before.waste.length;
      const spread = wasteSpread(targetIndex + 1, isMobile);
      const key = flightKeyRef.current++;
      setState((current) => ({ ...current, stock: current.stock.slice(0, -1) }));
      setSelection(null);
      setFlying((current) => [
        ...current,
        {
          key,
          card,
          from: { x: stockRect.left, y: stockRect.top },
          to: { x: wasteRect.left + targetIndex * spread, y: wasteRect.top },
        },
      ]);
      window.setTimeout(() => {
        setFlying((current) => current.filter((f) => f.key !== key));
        setHistory((h) => [...h, before]);
        setState(next);
      }, FLIGHT_MS);
    } else if (state.redeals > 0 && state.waste.length > 0) {
      recordAction("redeal");
      apply(redeal(state));
    }
  };

  const clickWaste = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (state.waste.length === 0) return;
    setSelection(selection?.type === "waste" ? null : { type: "waste" });
  };

  const clickReserveCell = (index: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const s = stateRef.current;
    if (selection) {
      if (selection.type === "waste") {
        animateWasteToReserve(index);
      } else {
        setSelection(null);
      }
      return;
    }
    if (s.reserves[index] != null) setSelection({ type: "reserve", index });
  };

  const clickFoundation = (index: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const s = stateRef.current;
    if (selection?.type === "waste") {
      const card = s.waste[s.waste.length - 1];
      if (card) {
        const target = foundationTarget(card, s.foundations);
        if (target !== null) animateWasteToFoundation(target);
      }
      return;
    }
    if (selection?.type === "reserve") {
      const card = s.reserves[selection.index];
      if (card) {
        const target = foundationTarget(card, s.foundations);
        if (target !== null) animateReserveToFoundation(selection.index, target);
      }
      return;
    }
    setSelection(null);
  };

  const doubleClickWaste = () => {
    if (state.waste.length === 0) return;
    const card = state.waste[state.waste.length - 1]!;
    const target = foundationTarget(card, state.foundations);
    if (target !== null) animateWasteToFoundation(target);
    setSelection(null);
  };

  const doubleClickReserve = (index: number) => {
    const card = state.reserves[index];
    if (card == null) return;
    const target = foundationTarget(card, state.foundations);
    if (target !== null) animateReserveToFoundation(index, target);
    setSelection(null);
  };

  const beginDrag = (source: DragSource) => (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const s = stateRef.current;
    const card =
      source.type === "waste" ? s.waste[s.waste.length - 1] ?? null : s.reserves[source.index];
    if (!card) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const dims = sultanCardDims();
    dragRef.current = {
      source,
      card,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      ...dims,
    };
    setDragGhost({ source, card, x: e.clientX, y: e.clientY, ...dims });
    setSelection(null);
  };

  const moveDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8)
      drag.moved = true;
    setDragGhost({
      source: drag.source,
      card: drag.card,
      x: e.clientX,
      y: e.clientY,
      w: drag.w,
      h: drag.h,
    });
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const drop = target?.closest("[data-drop]");
    if (!drop) {
      setDragOverTarget((t) => (t === null ? t : null));
      return;
    }
    const kind = drop.getAttribute("data-drop");
    const index = Number(drop.getAttribute("data-index"));
    if (kind === "foundation")
      setDragOverTarget((t) =>
        t?.type === "foundation" && t.index === index ? t : { type: "foundation", index },
      );
    else if (kind === "reserve")
      setDragOverTarget((t) =>
        t?.type === "reserve" && t.index === index ? t : { type: "reserve", index },
      );
  };

  const endDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragGhost(null);
    setDragOverTarget(null);
    if (!drag.moved) return; // it was a tap — let onClick handle selection
    suppressClickRef.current = true;
    // If the browser doesn't synthesize a click after this drag, clear the flag
    // so the next tap isn't swallowed.
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    const dropPoint = { x: e.clientX, y: e.clientY };
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const drop = target?.closest("[data-drop]");
    if (!drop) return;
    const kind = drop.getAttribute("data-drop");
    const index = Number(drop.getAttribute("data-index"));
    if (kind === "foundation") {
      if (drag.source.type === "waste") animateWasteToFoundation(index, dropPoint);
      else if (drag.source.type === "reserve")
        animateReserveToFoundation(drag.source.index, index, dropPoint);
    } else if (kind === "reserve") {
      if (drag.source.type === "waste") animateWasteToReserve(index, dropPoint);
    }
  };
  return (
    <div className="min-h-screen select-none text-cream">
      <div className="mx-auto max-w-5xl px-1.5 py-8 sm:px-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
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
              <h1 className="font-display text-2xl font-bold leading-tight">Sultan</h1>
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
          <Stat label="Home" value={`${cardsHome(state)}/${totalHome}`} />
          <Button
            variant="parlorGhost"
            className="bg-black text-white border-black hover:bg-black/80"
            onClick={undo}
            disabled={history.length === 0 || state.won || conceded}
          >
            Undo
          </Button>
        </div>

        <div className="mt-4 grid items-start gap-6 lg:grid-cols-[1fr_260px]">
          <div className="select-none relative rounded-2xl border border-gold/15 bg-[#4c9a2a] p-4 sm:p-6">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-6">
              <div className="flex items-start gap-2">
                <StockPile
                  count={state.stock.length}
                  redeals={state.redeals}
                  canRedeal={state.stock.length === 0 && state.redeals > 0 && state.waste.length > 0}
                  onClick={clickStock}
                  containerRef={(el) => (stockRef.current = el)}
                />
                <WastePile
                  cards={state.waste}
                  selected={selection?.type === "waste"}
                  hidden={dragGhost?.source.type === "waste"}
                  onClick={clickWaste}
                  onDoubleClick={doubleClickWaste}
                  onPointerDown={beginDrag({ type: "waste" })}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  topRef={(el) => (wasteTopRef.current = el)}
                  containerRef={(el) => (wasteContainerRef.current = el)}
                  isMobile={isMobile}
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-center gap-3 sm:gap-5">
              <div className="flex shrink-0 flex-col gap-2">
                {state.reserves.slice(0, 3).map((card, index) => (
                  <ReserveCell
                    key={index}
                    card={card}
                    index={index}
                    selected={selection?.type === "reserve" && selection.index === index}
                    hidden={
                      dragGhost?.source.type === "reserve" && dragGhost.source.index === index
                    }
                    onClick={() => clickReserveCell(index)}
                    onDoubleClick={() => doubleClickReserve(index)}
                    onPointerDown={beginDrag({ type: "reserve", index })}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    isDropTarget={dragOverTarget?.type === "reserve" && dragOverTarget.index === index}
                    cellRef={(el) => (reserveRefs.current[index] = el)}
                  />
                ))}
              </div>

              <div className="relative aspect-square w-full max-w-[380px] shrink">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <SultanCard card={state.sultan} />
                </div>
                {state.foundations.map((pile, index) => {
                  const pos = foundationPosition(index, state.packs);
                  return (
                    <div
                      key={index}
                      ref={(el) => (foundationRefs.current[index] = el)}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    >
                      <FoundationSlot
                        pile={pile}
                        done={foundationComplete(pile)}
                        index={index}
                        onClick={() => clickFoundation(index)}
                        isDropTarget={
                          dragOverTarget?.type === "foundation" && dragOverTarget.index === index
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex shrink-0 flex-col gap-2">
                {state.reserves.slice(3).map((card, offset) => {
                  const index = offset + 3;
                  return (
                    <ReserveCell
                      key={index}
                      card={card}
                      index={index}
                      selected={selection?.type === "reserve" && selection.index === index}
                      hidden={
                        dragGhost?.source.type === "reserve" && dragGhost.source.index === index
                      }
                      onClick={() => clickReserveCell(index)}
                      onDoubleClick={() => doubleClickReserve(index)}
                      onPointerDown={beginDrag({ type: "reserve", index })}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      isDropTarget={
                        dragOverTarget?.type === "reserve" && dragOverTarget.index === index
                      }
                      cellRef={(el) => (reserveRefs.current[index] = el)}
                    />
                  );
                })}
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-black">
              Ring the Sultan with foundations built up in suit, wrapping King to Ace. Turn one
              card at a time from the stock, and park it in a reserve cell if it cannot go home.
              Double-click a card to send it to its foundation.
            </p>
            {state.won && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🎉</div>
                  <h2 className="font-display text-3xl font-bold text-gold">
                    The court is complete!
                  </h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    Every card made it home around the Sultan in {state.moves} moves.
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
                <div className="pt-1">
                  <div className="flex w-full items-center justify-between gap-2.5">
                    <span className="text-xs uppercase tracking-[0.2em] text-ivory/50">PACKS</span>
                    <button
                      type="button"
                      onClick={cyclePacks}
                      disabled={gameInProgress}
                      className="rounded-full border border-gold/25 bg-gold/5 px-2.5 py-0.5 text-xs capitalize text-cream transition-colors hover:border-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        gameInProgress
                          ? "Packs are locked once the first move has been made"
                          : "Change the number of packs"
                      }
                    >
                      {packs === 2 ? "Two packs" : "One pack"}
                    </button>
                  </div>
                </div>
                <FavouriteSwitch gameId="sultan" />
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
                if (confirming === "home") {
                  recordAction("home");
                  void navigate({ to: "/" });
                } else if (confirming === "new") {
                  recordAction("new game");
                  reset();
                }
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
      {dragGhost && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50"
          style={{ left: dragGhost.x - dragGhost.w / 2, top: dragGhost.y - dragGhost.h / 2 }}
        >
          <CardFace card={dragGhost.card} static />
        </div>
      )}
    </div>
  );
}

// Grid cells for the eight foundations of a two-pack game, listed clockwise
// starting with the Ace of Hearts directly above the Sultan.
const GRID_POSITIONS: { x: number; y: number }[] = [
  { x: 50, y: 16.67 },
  { x: 75, y: 16.67 },
  { x: 75, y: 50 },
  { x: 75, y: 83.33 },
  { x: 50, y: 83.33 },
  { x: 25, y: 83.33 },
  { x: 25, y: 50 },
  { x: 25, y: 16.67 },
];

function foundationPosition(index: number, packs: PackCount): { x: number; y: number } {
  // Two packs arrange the eight foundations in a 3×3 grid around the Sultan.
  if (packs === 2) {
    const base = GRID_POSITIONS[index] ?? { x: 50, y: 50 };
    return {
      x: 50 + (base.x - 50) * FOUNDATION_SPREAD,
      y: 50 + (base.y - 50) * FOUNDATION_SPREAD,
    };
  }
  // One pack rings its four foundations around the Sultan. The vertical reach
  // is taller so the Ace of Hearts (above) and King of Diamonds (below) clear
  // the Sultan.
  const angle = (index / 4) * 2 * Math.PI - Math.PI / 2;
  return {
    x: 50 + (RING_RADIUS_X_PCT / 2) * Math.cos(angle) * FOUNDATION_SPREAD,
    y: 50 + (RING_RADIUS_Y_PCT / 2) * Math.sin(angle) * FOUNDATION_SPREAD,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-[0.2em] text-ivory/45">{label}</span>
      <span className="font-display text-xl font-bold leading-tight">{value}</span>
    </div>
  );
}
function CardFaceArt({ card }: { card: Card }) {
  const rank = RANK_LABEL[card.rank];
  const suit = SUIT_SYMBOL[card.suit];
  const isFace = card.rank > 10;
  return (
    <>
      {/* corner index */}
      <span className="absolute left-1 top-0.5 flex flex-col items-center font-display text-[12px] font-bold leading-none sm:text-[19px]">
        <span className="font-[Times_New_Roman,serif]">{rank}</span>
        <span className="text-[11px] sm:text-[17.5px]">{suit}</span>
      </span>
      {/* graphic */}
      <span
        aria-hidden
        className={`absolute inset-0 grid place-items-center font-display text-[26px] sm:text-[44px] ${
          isFace ? "opacity-90" : "opacity-80"
        }`}
      >
        {isFace ? (
          <span className="flex flex-col items-center leading-none">
            <span className="text-[17px] sm:text-[29px]">{rank}</span>
            <span className="text-[21px] sm:text-[35px]">{suit}</span>
          </span>
        ) : (
          suit
        )}
      </span>
      {/* mirrored bottom-right index */}
      <span className="absolute bottom-0.5 right-1 flex rotate-180 flex-col items-center font-display text-[12px] font-bold leading-none sm:text-[19px]">
        <span className="font-[Times_New_Roman,serif]">{rank}</span>
        <span className="text-[11px] sm:text-[17.5px]">{suit}</span>
      </span>
    </>
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
  static: isStatic = false,
}: {
  card: Card;
  selected?: boolean;
  hidden?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
  static?: boolean;
}) {
  const red = isRed(card.suit);
  const className = `relative block h-[var(--sultan-card-h)] w-[var(--sultan-card-w)] touch-none select-none overflow-hidden rounded-lg border bg-white text-left shadow-md shadow-black/30 transition-transform ${
    selected ? "border-gold -translate-y-1 ring-2 ring-gold" : "border-black/10"
  } ${hidden ? "opacity-0" : ""} ${red ? "text-destructive" : "text-ink"}`;
  const face = <CardFaceArt card={card} />;
  if (isStatic) {
    return (
      <div aria-label={cardLabel(card)} className={className}>
        {face}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label={cardLabel(card)}
      className={className}
    >
      {face}
    </button>
  );
}

function CardBack({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Face-down card"
      className="relative block h-[var(--sultan-card-h)] w-[var(--sultan-card-w)] overflow-hidden rounded-lg shadow-md shadow-black/30"
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
      className={`grid h-[var(--sultan-card-h)] w-[var(--sultan-card-w)] place-items-center rounded-md border border-dashed ${
        black ? "border-black" : "border-gold/30"
      } text-lg text-gold/30`}
    >
      {symbol ?? ""}
    </button>
  );
}
function StockPile({
  count,
  redeals,
  canRedeal,
  onClick,
  containerRef,
}: {
  count: number;
  redeals: number;
  canRedeal: boolean;
  onClick: () => void;
  containerRef?: (el: HTMLDivElement | null) => void;
}) {
  const shadowDepth = Math.max(0, Math.min(count - 1, 3));
  return (
    <div className="relative" ref={containerRef}>
      {count > 0 ? (
        <>
          {shadowDepth > 0 && (
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {Array.from({ length: shadowDepth }).map((_, i) => (
                <img
                  key={i}
                  src={cardBackAsset}
                  alt=""
                  className="absolute h-[var(--sultan-card-h)] w-[var(--sultan-card-w)] overflow-hidden rounded-md object-cover shadow-md shadow-black/30"
                  style={{ top: `${-(i + 1) * 2}px`, left: `${-(i + 1) * 2}px` }}
                />
              ))}
            </div>
          )}
          <CardBack onClick={onClick} />
        </>
      ) : canRedeal ? (
        <button
          type="button"
          onClick={onClick}
          className="grid h-[var(--sultan-card-h)] w-[var(--sultan-card-w)] place-items-center rounded-md border border-dashed border-black bg-black/15 text-center text-[11px] font-semibold text-white transition-colors hover:bg-black/25"
        >
          ↺ Redeal
        </button>
      ) : (
        <EmptySlot />
      )}
      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-ivory/50">
        {count > 0
          ? `${count} · ${redeals} redeal${redeals === 1 ? "" : "s"}`
          : `${redeals} redeal${redeals === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}

function WastePile({
  cards,
  selected,
  hidden,
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  topRef,
  containerRef,
  isMobile,
}: {
  cards: Card[];
  selected: boolean;
  hidden?: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  topRef?: (el: HTMLDivElement | null) => void;
  containerRef?: (el: HTMLDivElement | null) => void;
  isMobile: boolean;
}) {
  if (cards.length === 0) {
    return (
      <div ref={containerRef}>
        <EmptySlot black />
      </div>
    );
  }
  return (
    <div ref={containerRef} className="relative">
      {cards.map((card, index) => {
        const isTop = index === cards.length - 1;
        return (
          <div
            key={index}
            ref={isTop ? topRef : undefined}
            className="absolute left-0 top-0"
            style={{ transform: `translateX(${index * wasteSpread(cards.length, isMobile)}px)`, zIndex: index + 1 }}
          >
            {isTop ? (
              <CardFace
                card={card}
                selected={selected}
                hidden={hidden}
                onClick={onClick}
                onDoubleClick={onDoubleClick}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            ) : (
              <CardFace card={card} static />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FoundationSlot({
  pile,
  done,
  index,
  onClick,
  isDropTarget,
}: {
  pile: Card[];
  done: boolean;
  index: number;
  onClick: () => void;
  isDropTarget: boolean;
}) {
  const top = pile[pile.length - 1];
  return (
    <div
      data-drop="foundation"
      data-index={index}
      className={`relative rounded-md ${isDropTarget ? "ring-2 ring-gold" : ""} ${
        done ? "ring-2 ring-gold/70" : ""
      }`}
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
            <CardFace card={top} onClick={onClick} />
          </div>
        </>
      )}
    </div>
  );
}

function ReserveCell({
  card,
  index,
  selected,
  hidden,
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  isDropTarget,
  cellRef,
}: {
  card: Card | null;
  index: number;
  selected: boolean;
  hidden?: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  isDropTarget: boolean;
  cellRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={cellRef}
      data-drop="reserve"
      data-index={index}
      className={`relative rounded-md ${isDropTarget ? "ring-2 ring-gold" : ""}`}
    >
      {card == null ? (
        <EmptySlot onClick={onClick} black />
      ) : (
        <CardFace
          card={card}
          selected={selected}
          hidden={hidden}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      )}
    </div>
  );
}
function SultanCard({ card }: { card: Card }) {
  const red = isRed(card.suit);
  return (
    <div
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--sultan-card-h)] w-[var(--sultan-card-w)] select-none overflow-hidden rounded-lg border-2 border-gold bg-white text-left shadow-lg shadow-black/40 ${
        red ? "text-destructive" : "text-ink"
      }`}
    >
      <CardFaceArt card={card} />
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
  const red = isRed(flight.card.suit);
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
      <div
        className={`relative block h-[var(--sultan-card-h)] w-[var(--sultan-card-w)] select-none overflow-hidden rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 ${
          red ? "text-destructive" : "text-ink"
        }`}
      >
        <CardFaceArt card={flight.card} />
      </div>
    </div>
  );
}







