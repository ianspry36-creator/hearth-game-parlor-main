import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  PEAK_CARDS,
  ROWS,
  cardsRemaining,
  drawFromStock,
  freshGame,
  hasAvailableMove,
  isOpen,
  moveToWaste,
  slotX,
  type GameState,
} from "@/lib/tripeaks";
import { mulberry32 } from "@/lib/random";
import cardBackAsset from "@/assets/card-back.png";

export const Route = createFileRoute("/tripeaks")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Tri Peaks Solitaire — Cards and Games" },
      {
        name: "description",
        content:
          "Tri Peaks solitaire in the parlour: climb a rank up or down and clear the three peaks onto the waste.",
      },
      { property: "og:title", content: "Play Tri Peaks Solitaire — Cards and Games" },
      {
        property: "og:description",
        content:
          "Three overlapping pyramids, one waste pile — fifty thousand numbered games to master.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TriPeaksTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is re-dealt on mount.
const SSR_SEED = 20260910;

const RECORDS_KEY = "tripeaks-records";
const MAX_GAMES = 50000;

type GameRecord = { cardsLeft: number; moves: number; won: boolean };
type Records = Record<string, GameRecord>;

function loadRecords(): Records {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    return raw ? (JSON.parse(raw) as Records) : {};
  } catch {
    return {};
  }
}

function clampGameNumber(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.floor(n), 1), MAX_GAMES);
}

const isRed = (suit: Card["suit"]) => suit === "H" || suit === "D";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

// The board's fixed footprint: the bottom row is ten cards wide and the peaks
// rise four rows. Every slot is absolutely positioned so a removed card simply
// vanishes without shifting its neighbours.
const PEAK_WIDTH = "calc(9 * var(--tripeaks-step-x) + var(--tripeaks-card-w))";
const PEAK_HEIGHT = "calc(3 * var(--tripeaks-step-y) + var(--tripeaks-card-h))";

function slotStyle(row: number, col: number): CSSProperties {
  return {
    left: `calc(${slotX(row, col)} * var(--tripeaks-step-x))`,
    bottom: `calc(${row} * var(--tripeaks-step-y))`,
    // Lower rows sit in front: the face-up bottom tier covers the face-down
    // cards behind it, so it stays readable as cards are played away.
    zIndex: ROWS - row,
  };
}

// How long a card takes to fly onto the waste pile after being clicked.
const FLIGHT_MS = 350;

type FlyingCard = {
  key: number;
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

function TriPeaksTable() {
  const navigate = useNavigate();
  const game = getGame("tripeaks");
  const [state, setState] = useState<GameState>(() => freshGame(mulberry32(SSR_SEED)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [gameNumber, setGameNumber] = useState(1);
  const [numberInput, setNumberInput] = useState("1");
  const [records, setRecords] = useState<Records>({});
  const [recordMessage, setRecordMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const { recordResult } = useSolitaireStats(game.id);
  const { end, beginNew } = useGameStarted(game.name);
  const [conceded, setConceded] = useState(false);
  const prevWonRef = useRef(false);
  useEffect(() => {
    if (state.won && !prevWonRef.current) {
      recordResult("win");
      end("won");
    }
    prevWonRef.current = state.won;
  }, [state.won, recordResult, end]);
  const prevLostRef = useRef(false);
  useEffect(() => {
    if (state.lost && !prevLostRef.current) {
      recordResult("loss");
      end("lost");
    }
    prevLostRef.current = state.lost;
  }, [state.lost, recordResult, end]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const gameNumberRef = useRef(gameNumber);
  gameNumberRef.current = gameNumber;
  const recordsRef = useRef(records);
  recordsRef.current = records;

  // Timer bookkeeping.
  const [elapsed, setElapsed] = useState(0);
  const [finishedElapsed, setFinishedElapsed] = useState<number | null>(null);
  const startRef = useRef(0);
  const endedRef = useRef(false);

  useEffect(() => {
    setState(freshGame(mulberry32(clampGameNumber(gameNumberRef.current))));
    setHistory([]);
    setRecordMessage(null);
    setFinishedElapsed(null);
    setElapsed(0);
    startRef.current = 0;
    endedRef.current = false;
    setRecords(loadRecords());

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
    endedRef.current = state.won;
  }, [state.won]);

  const shownElapsed = finishedElapsed ?? elapsed;

  const deal = (n: number) => {
    const g = clampGameNumber(n);
    setGameNumber(g);
    setNumberInput(String(g));
    setState(freshGame(mulberry32(g)));
    setHistory([]);
    setFlying([]);
    setRecordMessage(null);
    setFinishedElapsed(null);
    setElapsed(0);
    startRef.current = 0;
    endedRef.current = false;
    setConceded(false);
    beginNew();
  };

  const newRandomGame = () => deal(Math.floor(Math.random() * MAX_GAMES) + 1);

  const concede = () => {
    if (state.won || state.lost || conceded) return;
    recordResult("loss");
    end("conceded");
    setConceded(true);
  };

  const evaluateResult = (s: GameState): string => {
    const cardsLeft = cardsRemaining(s);
    const number = gameNumberRef.current;
    const prev = recordsRef.current[number];
    const current: GameRecord = { cardsLeft, moves: s.moves, won: s.won };
    let message: string;
    if (!prev) {
      message = s.won
        ? `First win for game #${number}!`
        : `First result — ${cardsLeft} cards left.`;
    } else if (s.won && !prev.won) {
      message = `First win for game #${number}!`;
    } else if (s.won) {
      message =
        s.moves < prev.moves
          ? `New record — ${s.moves} moves (was ${prev.moves}).`
          : `You won, but not a record (best ${prev.moves} moves).`;
    } else {
      const better =
        cardsLeft < prev.cardsLeft || (cardsLeft === prev.cardsLeft && s.moves < prev.moves);
      message = better
        ? `Best result so far — ${cardsLeft} cards left.`
        : `Not a record (best ${prev.cardsLeft} cards left).`;
    }
    const next = { ...recordsRef.current, [number]: current };
    recordsRef.current = next;
    setRecords(next);
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(next));
    } catch {
      // local storage unavailable; ignore
    }
    return message;
  };

  const apply = (candidate: GameState) => {
    if (candidate === state) return;
    setHistory((h) => [...h, state]);
    setState(candidate);
    if (candidate.won || candidate.lost) {
      setRecordMessage(evaluateResult(candidate));
      setResultOpen(true);
    }
  };

  const undo = () => {
    if (history.length === 0 || state.won || conceded) return;
    const prev = history[history.length - 1]!;
    // Each undo counts as a move.
    setState({ ...prev, moves: prev.moves + 1 });
    setHistory(history.slice(0, -1));
    setRecordMessage(null);
  };

  const animateToWaste = (row: number, col: number) => {
    const before = stateRef.current;
    const slot = before.peaks[row]?.[col];
    if (!slot?.faceUp) return;
    const next = moveToWaste(before, row, col);
    if (next === before) return;
    const sourceEl = peakRefs.current[`${row}-${col}`];
    const destEl = wasteRef.current;
    const sourceRect = sourceEl?.getBoundingClientRect();
    const destRect = destEl?.getBoundingClientRect();
    // Without a measured source or target (e.g. before the board paints) just move.
    if (!sourceRect || !destRect) {
      apply(next);
      return;
    }
    const key = flightKeyRef.current++;
    // Lift the card out of the peak right away so it visibly flies off, then
    // commit the move (recording `before` in history) once it lands.
    setState((cur) => ({
      ...cur,
      peaks: cur.peaks.map((rowSlots, r) =>
        r === row ? rowSlots.map((s, c) => (c === col ? null : s)) : rowSlots,
      ),
    }));
    setFlying((cur) => [
      ...cur,
      {
        key,
        card: slot.card,
        from: { x: sourceRect.left, y: sourceRect.top },
        to: { x: destRect.left, y: destRect.top },
      },
    ]);
    window.setTimeout(() => {
      setFlying((cur) => cur.filter((f) => f.key !== key));
      setHistory((h) => [...h, before]);
      setState(next);
      if (next.won || next.lost) {
        setRecordMessage(evaluateResult(next));
        setResultOpen(true);
      }
    }, FLIGHT_MS);
  };

  const clickPeak = (row: number, col: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    animateToWaste(row, col);
  };

  // --- Drag-and-drop (pointer-based so it also works with touch on mobile) ---
  const dragRef = useRef<{
    row: number;
    col: number;
    card: Card;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragGhost, setDragGhost] = useState<{ card: Card; x: number; y: number } | null>(null);
  // The card currently being dragged, so the original can be hidden while the
  // ghost follows the pointer (avoids a duplicate card left behind at the source).
  const draggingIds = dragGhost ? new Set([dragGhost.card.id]) : null;

  // Click-to-move animation state: cards currently flying onto the waste pile.
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const flightKeyRef = useRef(0);
  const wasteRef = useRef<HTMLDivElement | null>(null);
  const peakRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const beginDrag = (row: number, col: number, card: Card) => (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { row, col, card, startX: e.clientX, startY: e.clientY, moved: false };
    setDragGhost({ card, x: e.clientX, y: e.clientY });
  };

  const moveDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8)
      drag.moved = true;
    setDragGhost({ card: drag.card, x: e.clientX, y: e.clientY });
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragGhost(null);
    if (!drag.moved) return; // it was a tap — let onClick handle it
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    const candidate = moveToWaste(stateRef.current, drag.row, drag.col);
    if (candidate !== stateRef.current) apply(candidate);
  };

  const draw = () => {
    const candidate = drawFromStock(stateRef.current);
    if (candidate !== stateRef.current) apply(candidate);
  };

  const commitNumber = () => {
    const parsed = parseInt(numberInput, 10);
    deal(Number.isFinite(parsed) ? parsed : gameNumberRef.current);
  };

  const gameInProgress = state.moves > 0 && !state.won && !conceded;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : newRandomGame());
  const confirmHome = () => (gameInProgress ? setConfirming("home") : void navigate({ to: "/" }));

  const best = records[gameNumber];
  const bestLabel = best ? (best.won ? `Won in ${best.moves}` : `${best.cardsLeft} left`) : "—";

  const hint = state.won
    ? "You cleared the peaks!"
    : hasAvailableMove(state)
      ? "Click an open card to play it onto the waste — one rank up or down."
      : state.stock.length > 0
        ? "No open card fits — draw from the stock."
        : "No more moves — undo or deal a new game.";
  return (
    <div className="min-h-screen text-cream">
      <div className="relative mx-auto max-w-6xl px-[3px] pb-10 pt-6 sm:px-6">
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
              <h1 className="font-display text-2xl font-bold leading-tight">Tri Peaks</h1>
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
          <Stat label="Cards left" value={`${cardsRemaining(state)} / ${PEAK_CARDS}`} />
          <Stat label="Game" value={`#${gameNumber}`} />
          <Stat label="Best" value={bestLabel} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-center">
          <span className="text-[11px] uppercase tracking-[0.2em] text-ivory/45">
            Numbered game
          </span>
          <button
            type="button"
            onClick={() => deal(gameNumber - 1)}
            disabled={gameNumber <= 1}
            aria-label="Previous game"
            className="grid size-7 cursor-pointer place-items-center rounded-full border border-gold/30 text-gold transition-colors hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ◀
          </button>
          <input
            value={numberInput}
            onChange={(e) => setNumberInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNumber();
            }}
            inputMode="numeric"
            aria-label="Game number"
            className="w-24 rounded-md border border-gold/30 bg-surface/60 px-2 py-1 text-center font-display text-sm text-cream outline-none focus:border-gold"
          />
          <button
            type="button"
            onClick={() => deal(gameNumber + 1)}
            disabled={gameNumber >= MAX_GAMES}
            aria-label="Next game"
            className="grid size-7 cursor-pointer place-items-center rounded-full border border-gold/30 text-gold transition-colors hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={newRandomGame}
            className="cursor-pointer rounded-full border border-gold/30 px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-ivory/70 transition-colors hover:text-gold"
          >
            Random
          </button>
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_260px]">
          <div className="select-none relative rounded-2xl border border-gold/15 bg-[#4c9a2a] p-4 text-black sm:p-6">
            <div className="flex items-start justify-center gap-8">
              <StockPile
                count={state.stock.length}
                disabled={state.won || state.lost}
                onClick={draw}
              />
              <WastePile waste={state.waste} wasteRef={(el) => (wasteRef.current = el)} />
            </div>

            <div className="mt-8 flex justify-center">
              <div className="relative" style={{ width: PEAK_WIDTH, height: PEAK_HEIGHT }}>
                {state.peaks.map((rowSlots, row) =>
                  rowSlots.map((slot, col) => {
                    if (!slot) return null;
                    const open = isOpen(state.peaks, row, col);
                    return (
                      <div
                        key={`${row}-${col}`}
                        className="absolute"
                        style={slotStyle(row, col)}
                        ref={(el) => (peakRefs.current[`${row}-${col}`] = el)}
                      >
                        {slot.faceUp ? (
                          <CardFace
                            card={slot.card}
                            dimmed={!open}
                            hidden={draggingIds?.has(slot.card.id)}
                            {...(open
                              ? {
                                  onClick: () => clickPeak(row, col),
                                  onDoubleClick: () => clickPeak(row, col),
                                  onPointerDown: beginDrag(row, col, slot.card),
                                  onPointerMove: moveDrag,
                                  onPointerUp: endDrag,
                                }
                              : {})}
                          />
                        ) : (
                          <CardBack />
                        )}
                      </div>
                    );
                  }),
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <Button
                variant="parlorGhost"
                className="bg-black text-white border-black hover:bg-black/80"
                onClick={undo}
                disabled={history.length === 0 || state.won || conceded}
              >
                Undo
              </Button>
            </div>

            {conceded && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🏳️</div>
                  <h2 className="font-display text-3xl font-bold text-red-300">You conceded</h2>
                  <p className="mx-auto max-w-sm text-ivory/70">This game is recorded as a loss.</p>
                  <Button variant="parlor" onClick={newRandomGame}>
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
                  disabled={state.won || state.lost || conceded}
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
                <FavouriteSwitch gameId="tripeaks" />
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-6 border-t border-gold/15 pt-4 text-center">
          <p className="text-xs text-ivory/40">{hint}</p>
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
                if (confirming === "home") void navigate({ to: "/" });
                else if (confirming === "new") newRandomGame();
                setConfirming(null);
              }}
            >
              Yes, leave the game
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resultOpen} onOpenChange={setResultOpen}>
        <AlertDialogContent className="border-gold/25 bg-brand text-cream">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">
              {state.won ? "You cleared the peaks!" : "No more moves"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/65">
              {recordMessage ??
                (state.won
                  ? `Game #${gameNumber} won in ${state.moves} moves.`
                  : "No open card fits and the stock is empty.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {state.lost ? (
              <AlertDialogCancel onClick={undo}>Undo</AlertDialogCancel>
            ) : (
              <AlertDialogCancel>View table</AlertDialogCancel>
            )}
            <AlertDialogAction
              onClick={() => {
                setResultOpen(false);
                newRandomGame();
              }}
            >
              Deal again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dragGhost && (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: `calc(${dragGhost.x}px - var(--tripeaks-card-w) / 2)`,
            top: `calc(${dragGhost.y}px - var(--tripeaks-card-h) / 2)`,
          }}
        >
          <CardFace card={dragGhost.card} />
        </div>
      )}

      {flying.map((flight) => (
        <FlyingCardView key={flight.key} flight={flight} />
      ))}
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
  onClick,
  onDoubleClick,
  dimmed = false,
  hidden = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  card: Card;
  onClick?: () => void;
  onDoubleClick?: () => void;
  dimmed?: boolean;
  hidden?: boolean;
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
      disabled={!onClick}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--tripeaks-card-h)] w-[var(--tripeaks-card-w)] touch-none select-none overflow-hidden rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-destructive" : "text-ink"
      } ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:ring-1 hover:ring-gold" : "cursor-default"} ${
        dimmed ? "saturate-50" : ""
      } ${hidden ? "invisible" : ""}`}
    >
      <span className="absolute left-1 top-0.5 flex flex-col items-center font-display text-[8px] font-bold leading-none sm:text-xs">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-[7px] sm:text-[10px]">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span
        aria-hidden
        className={`absolute inset-0 grid place-items-center font-display text-sm sm:text-xl ${
          isFace ? "opacity-90" : "opacity-80"
        }`}
      >
        {isFace ? (
          <span className="flex flex-col items-center leading-none">
            <span className="text-[9px] sm:text-[13px]">{RANK_LABEL[card.rank]}</span>
            <span className="text-[11px] sm:text-base">{SUIT_SYMBOL[card.suit]}</span>
          </span>
        ) : (
          SUIT_SYMBOL[card.suit]
        )}
      </span>
      <span className="absolute bottom-0.5 right-1 flex rotate-180 flex-col items-center font-display text-[8px] font-bold leading-none sm:text-xs">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-[7px] sm:text-[10px]">{SUIT_SYMBOL[card.suit]}</span>
      </span>
    </button>
  );
}

function CardBack() {
  return (
    <div
      aria-label="Face-down card"
      className="relative block h-[var(--tripeaks-card-h)] w-[var(--tripeaks-card-w)] overflow-hidden rounded-lg shadow-md shadow-black/30"
    >
      <img src={cardBackAsset} alt="" aria-hidden className="h-full w-full object-cover" />
    </div>
  );
}

function EmptySlot({ black }: { black?: boolean }) {
  return (
    <div
      className={`grid h-[var(--tripeaks-card-h)] w-[var(--tripeaks-card-w)] place-items-center rounded-md border border-dashed ${
        black ? "border-black" : "border-gold/30"
      } text-gold/30`}
    />
  );
}

function StockPile({
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
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label="Draw from stock"
            className={`relative block rounded-md transition-opacity ${
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:opacity-80"
            }`}
          >
            {count > 1 && (
              <div className="absolute -left-1 -top-1 opacity-60">
                <CardBack />
              </div>
            )}
            <CardBack />
            <span className="absolute -bottom-1 -right-1 z-10 grid size-4 place-items-center rounded-full bg-brand text-[9px] font-bold text-cream ring-1 ring-gold/50">
              {count}
            </span>
          </button>
        ) : (
          <EmptySlot />
        )}
      </div>
      <span className="text-[10px] uppercase tracking-[0.18em] text-black">Stock</span>
    </div>
  );
}

function WastePile({
  waste,
  wasteRef,
}: {
  waste: Card[];
  wasteRef?: (el: HTMLDivElement | null) => void;
}) {
  const top = waste[waste.length - 1];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" ref={wasteRef}>
        {waste.length > 1 && (
          <div className="absolute -left-1 -top-1 opacity-40">
            <CardBack />
          </div>
        )}
        {top ? <CardFace card={top} /> : <EmptySlot black />}
      </div>
      <span className="text-[10px] uppercase tracking-[0.18em] text-black">Waste</span>
    </div>
  );
}
