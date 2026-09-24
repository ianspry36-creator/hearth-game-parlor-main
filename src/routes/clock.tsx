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
  currentCard,
  freshGame,
  place,
  reveal,
  slotLabel,
  type GameState,
  type ClockPile,
  type CenterSlot,
} from "@/lib/clock";
import { mulberry32 } from "@/lib/random";
import cardBackAsset from "@/assets/card-back.png";

export const Route = createFileRoute("/clock")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Clock Solitaire — Cards and Games" },
      {
        name: "description",
        content:
          "Clock solitaire in the parlour: deal the deck around the clock and lay every card at its own hour before the fourth King tolls.",
      },
      { property: "og:title", content: "Play Clock Solitaire — Cards and Games" },
      {
        property: "og:description",
        content: "A game of chance dealt fresh around the clock — win about one hand in thirteen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClockTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20260906;

const WINS_KEY = "clock-wins";
const BEST_TIME_KEY = "clock-best-time";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

// The twelve hour positions, laid out as percentages around the clock face
// (1 o'clock at top-right through 12 o'clock at the top). Slot 12 — the Kings —
// sits in the centre and is positioned separately.
const SLOT_POSITIONS = Array.from({ length: 12 }, (_, i) => {
  const angle = ((i + 1) * Math.PI) / 6;
  const x = 50 + 40 * Math.sin(angle);
  const y = 50 - 40 * Math.cos(angle);
  return { left: `${x}%`, top: `${y}%` } as const;
});

// A card currently flying from the active pile to its own hour (double-click/drag move).
type Flight = {
  key: number;
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

function ClockTable() {
  const navigate = useNavigate();
  const game = getGame("clock");
  const [state, setState] = useState<GameState>(() => freshGame(mulberry32(SSR_SEED)));
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
  const stateRef = useRef(state);
  stateRef.current = state;

  // Placement animation + drag-and-drop bookkeeping.
  const [flights, setFlights] = useState<Flight[]>([]);
  const [placing, setPlacing] = useState(false);
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const registerSlot = (slot: number, el: HTMLDivElement | null) => {
    if (el) slotRefs.current.set(slot, el);
    else slotRefs.current.delete(slot);
  };
  const centerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const registerCenter = (index: number, el: HTMLDivElement | null) => {
    if (el) centerRefs.current.set(index, el);
    else centerRefs.current.delete(index);
  };
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Timer bookkeeping.
  const [elapsed, setElapsed] = useState(0);
  const [finishedElapsed, setFinishedElapsed] = useState<number | null>(null);
  const startRef = useRef(0);
  const endedRef = useRef(false);

  // Lifetime wins and best winning time, loaded from local storage once.
  const [wins, setWins] = useState(0);
  const [bestTime, setBestTime] = useState(0);

  useEffect(() => {
    setState(freshGame());
    setElapsed(0);
    setFinishedElapsed(null);
    startRef.current = Date.now();
    endedRef.current = false;

    const id = window.setInterval(() => {
      if (!endedRef.current) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);

    try {
      setWins(Number(localStorage.getItem(WINS_KEY) || 0));
      setBestTime(Number(localStorage.getItem(BEST_TIME_KEY) || 0));
    } catch {
      // local storage unavailable; ignore
    }

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const over = state.won || state.lost;
    endedRef.current = over;
    if (over && finishedElapsed === null) {
      setFinishedElapsed(elapsed);
      if (state.won) {
        try {
          const nextWins = Number(localStorage.getItem(WINS_KEY) || 0) + 1;
          localStorage.setItem(WINS_KEY, String(nextWins));
          const priorBest = Number(localStorage.getItem(BEST_TIME_KEY) || 0);
          const nextBest = priorBest === 0 || elapsed < priorBest ? elapsed : priorBest;
          localStorage.setItem(BEST_TIME_KEY, String(nextBest));
          setWins(nextWins);
          setBestTime(nextBest);
        } catch {
          // ignore
        }
      }
    }
  }, [state.won, state.lost, finishedElapsed, elapsed]);

  const shownElapsed = finishedElapsed ?? elapsed;

  // Place the current card, then turn the next card of the destination pile —
  // except when a King has just struck the centre, where the player chooses
  // which of the centre's face-down cards to turn over next.
  const advance = (s: GameState, card: Card) => {
    let next = place(s);
    if (card.rank === 13) return next;
    next = reveal(next);
    // Lay a card that lands back on its own hour straight through the clock:
    // turn its pile's next face-down card automatically, so chains of
    // same-rank cards never leave the hand waiting on a card already at home.
    while (!next.won && !next.lost && next.active >= 0) {
      const current = currentCard(next);
      if (!current || current.rank === 13) return next;
      if (next.active !== current.rank - 1) return next;
      const pile = next.piles[next.active];
      if (!pile || pile.faceDown.length === 0) return next;
      next = place(next);
      if (next.won || next.lost) return next;
      next = reveal(next);
    }
    return next;
  };

  // Lay the current card at its own hour, flying it there when animated, then
  // turn the next card of that hour's pile face up in place.
  const placeCard = (animate = true) => {
    const current = stateRef.current;
    const card = currentCard(current);
    if (!card || current.won || current.lost || placing) return;
    const target = card.rank - 1;
    const fromRect = currentRef.current?.getBoundingClientRect();
    // A King flies to the first empty centre position, not the centre grid's
    // top-left corner.
    const toRect =
      target === 12
        ? centerRefs.current
            .get(current.center.findIndex((c) => c === null))
            ?.getBoundingClientRect()
        : slotRefs.current.get(target)?.getBoundingClientRect();
    if (animate && fromRect && toRect) {
      setPlacing(true);
      const flight: Flight = {
        key: Date.now(),
        card,
        from: { x: fromRect.left, y: fromRect.top },
        to: { x: toRect.left, y: toRect.top },
      };
      setFlights((currentFlights) => [...currentFlights, flight]);
      window.setTimeout(() => {
        setFlights((currentFlights) => currentFlights.filter((f) => f.key !== flight.key));
      }, 600);
      // Commit the card to its hour only once the flight has landed, then
      // turn the next card of that hour's pile face up.
      window.setTimeout(() => {
        setState(advance(stateRef.current, card));
        setPlacing(false);
      }, 450);
      return;
    }
    setState(advance(current, card));
  };

  // Turn over the chosen face-down card of the centre pile (2 x 2 grid).
  const revealCenter = (index: number) => {
    const current = stateRef.current;
    if (current.won || current.lost || current.active !== 12 || placing) return;
    const revealed = reveal(current, index);
    if (revealed === current) return;
    const card = currentCard(revealed);
    // A King turned over at the centre is already home: strike it at once so
    // the player can turn over another centre card without having to move it.
    setState(card && card.rank === 13 ? place(revealed) : revealed);
  };

  // Pointer-driven drag-and-drop for the current card (works for mouse and touch).
  const onCardPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (placing || !currentCard(stateRef.current)) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCardPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStartRef.current) return;
    setDragOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const onCardPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const didDrag = Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8;
    dragStartRef.current = null;
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
    if (!didDrag) return;
    const current = currentCard(stateRef.current);
    const target = current ? current.rank - 1 : -1;
    const targetEl = target >= 0 ? slotRefs.current.get(target) : undefined;
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const hit =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (hit) placeCard(true);
    }
  };

  const reset = () => {
    setState(freshGame());
    setFinishedElapsed(null);
    setElapsed(0);
    startRef.current = Date.now();
    endedRef.current = false;
    setFlights([]);
    setPlacing(false);
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
    dragStartRef.current = null;
  };

  const gameInProgress = state.revealed > 0 && !state.won && !state.lost;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : reset());
  const confirmHome = () => (gameInProgress ? setConfirming("home") : void navigate({ to: "/" }));

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
              <h1 className="font-display text-2xl font-bold leading-tight">Clock Solitaire</h1>
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
          <Stat label="Cards laid" value={`${state.revealed} / 52`} />
          <Stat label="Time" value={formatElapsed(shownElapsed)} />
          <Stat label="Wins" value={String(wins)} />
          <Stat label="Best time" value={bestTime > 0 ? formatElapsed(bestTime) : "—"} />
        </div>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_260px]">
          <div className="select-none relative rounded-2xl border border-gold/15 bg-surface/40 p-4 sm:p-6">
            <ClockFace
              state={state}
              onPlace={() => placeCard(true)}
              onRevealCenter={revealCenter}
              currentRef={currentRef}
              registerSlot={registerSlot}
              registerCenter={registerCenter}
              onCardPointerDown={onCardPointerDown}
              onCardPointerMove={onCardPointerMove}
              onCardPointerUp={onCardPointerUp}
              dragOffset={dragOffset}
              isDragging={isDragging}
              placing={placing}
            />

            <p className="mt-6 text-center text-xs text-ivory/50">
              Double-click or drag the face-up card to its own hour. At the centre, pick any of
              the four cards to turn over. The fourth King ends the hand.
            </p>

            {state.won && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🎉</div>
                  <h2 className="font-display text-3xl font-bold text-gold">The clock is set!</h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    All fifty-two cards found their hour before the fourth King struck.
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
                  <div className="text-5xl">⏰</div>
                  <h2 className="font-display text-3xl font-bold text-gold">
                    The fourth King struck!
                  </h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    You laid {state.revealed} cards before the clock tolled. Only about one hand in
                    thirteen is won.
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
                <StatisticsDialog
                  game={game}
                  trigger={
                    <Button variant="parlorGhost" className="w-full">
                      Statistics
                    </Button>
                  }
                />
                <FavouriteSwitch gameId="clock" />
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

      {flights.map((flight) => (
        <FlightView key={flight.key} flight={flight} />
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

function ClockFace({
  state,
  onPlace,
  onRevealCenter,
  currentRef,
  registerSlot,
  registerCenter,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  dragOffset,
  isDragging,
  placing,
}: {
  state: GameState;
  onPlace: () => void;
  onRevealCenter: (index: number) => void;
  currentRef: React.RefObject<HTMLButtonElement | null>;
  registerSlot: (slot: number, el: HTMLDivElement | null) => void;
  registerCenter: (index: number, el: HTMLDivElement | null) => void;
  onCardPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCardPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCardPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  dragOffset: { x: number; y: number };
  isDragging: boolean;
  placing: boolean;
}) {
  const current = currentCard(state);
  const dropTarget = current ? current.rank - 1 : -1;
  const activeSlot = state.active;
  const slotProps = {
    currentRef,
    onCurrentDoubleClick: onPlace,
    onCurrentPointerDown: onCardPointerDown,
    onCurrentPointerMove: onCardPointerMove,
    onCurrentPointerUp: onCardPointerUp,
    dragOffset,
    isDragging,
    placing,
  };
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[620px]">
      <div className="absolute inset-4 rounded-full border border-gold/15" />
      {state.piles.slice(0, 12).map((pile, slot) => (
        <div
          key={slot}
          ref={(el) => registerSlot(slot, el)}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={SLOT_POSITIONS[slot]}
        >
          <ClockSlot
            slot={slot}
            pile={pile}
            isDropTarget={dropTarget === slot}
            isCurrent={slot === activeSlot}
            {...slotProps}
          />
        </div>
      ))}
      <div
        ref={(el) => registerSlot(12, el)}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <CenterSlot
          center={state.center}
          activeCenter={state.activeCenter}
          isDropTarget={dropTarget === 12}
          isCurrent={12 === activeSlot}
          onRevealCenter={onRevealCenter}
          registerCenter={registerCenter}
          {...slotProps}
        />
      </div>
    </div>
  );
}

function ClockSlot({
  slot,
  pile,
  isDropTarget,
  isCurrent,
  currentRef,
  onCurrentDoubleClick,
  onCurrentPointerDown,
  onCurrentPointerMove,
  onCurrentPointerUp,
  dragOffset,
  isDragging,
  placing,
}: {
  slot: number;
  pile: ClockPile;
  isDropTarget: boolean;
  isCurrent: boolean;
  currentRef: React.RefObject<HTMLButtonElement | null>;
  onCurrentDoubleClick: () => void;
  onCurrentPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCurrentPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCurrentPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  dragOffset: { x: number; y: number };
  isDragging: boolean;
  placing: boolean;
}) {
  const down = pile.faceDown;
  const up = pile.faceUp;
  const isEmpty = down.length === 0 && up.length === 0;
  const overlapStyle = { marginTop: "calc(var(--clock-overlap) * -1)" };

  // The pile fans upward so the current card sits fully revealed at the
  // bottom, face-down cards above it, and cards already laid at the very top —
  // each card peeking a sliver of its top edge.
  const current = isCurrent && up.length > 0 ? up[up.length - 1] : null;
  const placed = current ? up.slice(0, -1) : up;

  // Build the pile from the top of the screen down, then give each layer an
  // increasing z-index so every card covers the one just above it, leaving the
  // top sliver of that card visible.
  type Layer =
    | { kind: "placed"; card: Card }
    | { kind: "down" }
    | { kind: "current"; card: Card };
  const layers: Layer[] = [
    ...placed.map((card): Layer => ({ kind: "placed", card })),
    ...down.map((): Layer => ({ kind: "down" })),
    ...(current ? [{ kind: "current", card: current } as Layer] : []),
  ];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative block">
        <div className="flex flex-col items-center">
          {layers.map((layer, idx) => {
            const style = {
              ...(idx > 0 ? overlapStyle : {}),
              zIndex: idx + 1,
            };
            if (layer.kind === "placed") {
              return (
                <div key={`placed-${idx}`} className="relative" style={style}>
                  <ClockCardFace card={layer.card} />
                </div>
              );
            }
            if (layer.kind === "down") {
              return (
                <div key={`down-${idx}`} className="relative" style={style}>
                  <ClockCardBack />
                </div>
              );
            }
            if (placing) {
              return (
                <div key="current" className="relative" style={style}>
                  <ClockCardFace card={layer.card} />
                </div>
              );
            }
            return (
              <button
                key="current"
                type="button"
                ref={currentRef}
                onDoubleClick={onCurrentDoubleClick}
                onPointerDown={onCurrentPointerDown}
                onPointerMove={onCurrentPointerMove}
                onPointerUp={onCurrentPointerUp}
                aria-label={`${cardLabel(layer.card)} — double-click or drag to its hour`}
                className={`relative block cursor-grab touch-none select-none transition-transform ${
                  isDragging ? "duration-0" : "duration-200"
                }`}
                style={{
                  ...style,
                  transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
                }}
              >
                <ClockCardFace card={layer.card} />
                <span className="absolute -inset-2 z-20 rounded-lg ring-2 ring-gold-bright animate-gentle-flash" />
              </button>
            );
          })}
        </div>
        {isEmpty && <EmptySlot />}
        {isDropTarget && (
          <span className="absolute -inset-2 z-30 rounded-lg ring-2 ring-gold-bright animate-gentle-flash" />
        )}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-ivory/50">
        {slotLabel(slot)}
      </span>
    </div>
  );
}

function CenterSlot({
  center,
  activeCenter,
  isDropTarget,
  isCurrent,
  currentRef,
  onCurrentDoubleClick,
  onCurrentPointerDown,
  onCurrentPointerMove,
  onCurrentPointerUp,
  dragOffset,
  isDragging,
  placing,
  onRevealCenter,
  registerCenter,
}: {
  center: CenterSlot[];
  activeCenter: number;
  isDropTarget: boolean;
  isCurrent: boolean;
  currentRef: React.RefObject<HTMLButtonElement | null>;
  onCurrentDoubleClick: () => void;
  onCurrentPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCurrentPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCurrentPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  dragOffset: { x: number; y: number };
  isDragging: boolean;
  placing: boolean;
  onRevealCenter: (index: number) => void;
  registerCenter: (index: number, el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {/* The four centre positions stay put: face-down cards wait to be
            turned over, a card flips face up in its own position, and a struck
            King sits face up where it was laid. */}
        <div className="grid grid-cols-2 gap-1">
          {center.map((slot, i) => (
            <div key={`centre-${i}`} ref={(el) => registerCenter(i, el)}>
              {slot === null ? (
                <EmptySlot />
              ) : slot.faceUp && i === activeCenter && !placing ? (
                <button
                  type="button"
                  ref={currentRef}
                  onDoubleClick={onCurrentDoubleClick}
                  onPointerDown={onCurrentPointerDown}
                  onPointerMove={onCurrentPointerMove}
                  onPointerUp={onCurrentPointerUp}
                  aria-label={`${cardLabel(slot.card)} — double-click or drag to its hour`}
                  className={`relative z-10 block cursor-grab touch-none select-none transition-transform ${
                    isDragging ? "duration-0" : "duration-200"
                  }`}
                  style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
                >
                  <ClockCardFace card={slot.card} />
                  <span className="absolute -inset-2 z-20 rounded-lg ring-2 ring-gold-bright animate-gentle-flash" />
                </button>
              ) : slot.faceUp ? (
                <div className="relative">
                  <ClockCardFace card={slot.card} />
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!isCurrent || placing}
                  onClick={() => onRevealCenter(i)}
                  aria-label="Turn over a centre card"
                  className={`relative block rounded-md transition-shadow ${
                    isCurrent && !placing
                      ? "cursor-pointer hover:ring-2 hover:ring-gold-bright"
                      : "cursor-default"
                  }`}
                >
                  <ClockCardBack />
                </button>
              )}
            </div>
          ))}
        </div>

        {isDropTarget && (
          <span className="absolute -inset-2 z-30 rounded-lg ring-2 ring-gold-bright animate-gentle-flash" />
        )}
      </div>

      <span className="text-[10px] font-bold uppercase tracking-wider text-ivory/50">K</span>
    </div>
  );
}

function ClockCardFace({ card }: { card: Card }) {
  const red = card.suit === "H" || card.suit === "D";
  return (
    <div
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--clock-card-h)] w-[var(--clock-card-w)] select-none rounded-md border border-black/10 bg-white text-left shadow-md shadow-black/30 ${
        red ? "text-[#c0392b]" : "text-ink"
      }`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-[10px] font-bold leading-none">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[9px]">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-base">
        {SUIT_SYMBOL[card.suit]}
      </span>
    </div>
  );
}

function ClockCardBack() {
  return (
    <div
      aria-label="Face-down card"
      className="block h-[var(--clock-card-h)] w-[var(--clock-card-w)] overflow-hidden rounded-md shadow-md shadow-black/30"
    >
      <img src={cardBackAsset} alt="" aria-hidden className="h-full w-full object-cover" />
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="grid h-[var(--clock-card-h)] w-[var(--clock-card-w)] place-items-center rounded-md border border-dashed border-gold/30 text-gold/30" />
  );
}

// A card animating from its own pile to its own hour.
function FlightView({ flight }: { flight: Flight }) {
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
      className="pointer-events-none fixed z-50 transition-transform duration-500 ease-out"
      style={{
        left: flight.from.x,
        top: flight.from.y,
        transformOrigin: "top left",
        transform: `translate(${dx}px, ${dy}px)`,
      }}
    >
      <ClockCardFace card={flight.card} />
    </div>
  );
}
