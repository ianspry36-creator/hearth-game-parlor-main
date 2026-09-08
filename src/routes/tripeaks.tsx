import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import { useSolitaireStats } from "@/lib/solitaireStats";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import {
  PEAK_CARDS,
  ROW_LENGTHS,
  cardsRemaining,
  drawFromStock,
  freshGame,
  hasAvailableMove,
  isOpen,
  moveToWaste,
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
  const offset = (ROW_LENGTHS[0]! - ROW_LENGTHS[row]!) / 2;
  return {
    left: `calc(${col + offset} * var(--tripeaks-step-x))`,
    bottom: `calc(${row} * var(--tripeaks-step-y))`,
  };
}
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
    startRef.current = Date.now();
    endedRef.current = false;
    setRecords(loadRecords());

    const id = window.setInterval(() => {
      if (!endedRef.current) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, []);

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
    setRecordMessage(null);
    setFinishedElapsed(null);
    setElapsed(0);
    startRef.current = Date.now();
    endedRef.current = false;
  };

  const newRandomGame = () => deal(Math.floor(Math.random() * MAX_GAMES) + 1);

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
    if (candidate.won || candidate.lost) setRecordMessage(evaluateResult(candidate));
  };

  const undo = () => {
    if (history.length === 0 || state.won) return;
    const prev = history[history.length - 1]!;
    // Each undo counts as a move.
    setState({ ...prev, moves: prev.moves + 1 });
    setHistory(history.slice(0, -1));
    setRecordMessage(null);
  };

  const clickPeak = (row: number, col: number) => {
    const candidate = moveToWaste(stateRef.current, row, col);
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

  const gameInProgress = state.moves > 0;
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
    <div className="min-h-screen bg-brand text-cream">
      <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6">
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
          <div className="relative rounded-2xl border border-gold/15 bg-surface/40 p-4 sm:p-6">
            <div className="flex items-start justify-center gap-8">
              <StockPile
                count={state.stock.length}
                disabled={state.won || state.lost}
                onClick={draw}
              />
              <WastePile waste={state.waste} />
            </div>

            <div className="mt-8 flex justify-center">
              <div className="relative" style={{ width: PEAK_WIDTH, height: PEAK_HEIGHT }}>
                {state.peaks.map((rowSlots, row) =>
                  rowSlots.map((slot, col) => {
                    if (!slot) return null;
                    const open = isOpen(state.peaks, row, col);
                    return (
                      <div key={`${row}-${col}`} className="absolute" style={slotStyle(row, col)}>
                        {slot.faceUp ? (
                          <CardFace
                            card={slot.card}
                            dimmed={!open}
                            {...(open ? { onClick: () => clickPeak(row, col) } : {})}
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
            {state.lost && (
              <div className="mt-6 rounded-xl border border-gold/40 bg-surface/70 p-4 text-center">
                <p className="font-display text-lg font-bold text-gold">No more moves</p>
                <p className="mt-1 text-sm text-ivory/80">
                  {recordMessage ?? "No open card fits and the stock is empty."}
                </p>
                <p className="mt-1 text-xs text-ivory/50">
                  Undo to try another path, or deal a new game.
                </p>
              </div>
            )}

            {state.won && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🎉</div>
                  <h2 className="font-display text-3xl font-bold text-gold">
                    You cleared the peaks!
                  </h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    {recordMessage ?? `Game #${gameNumber} won in ${state.moves} moves.`}
                  </p>
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
                  disabled={history.length === 0 || state.won}
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
  dimmed = false,
}: {
  card: Card;
  onClick?: () => void;
  dimmed?: boolean;
}) {
  const red = isRed(card.suit);
  const isFaceCard = card.rank === 1 || card.rank > 10;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--tripeaks-card-h)] w-[var(--tripeaks-card-w)] select-none rounded-md border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-[#c0392b]" : "text-brand"
      } ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:ring-1 hover:ring-gold" : "cursor-default"} ${
        dimmed ? "opacity-75" : ""
      }`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-[8px] font-bold leading-none sm:left-1 sm:top-1 sm:text-xs">
        <span>{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[7px] sm:text-[10px]">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-sm sm:text-xl">
        {isFaceCard ? RANK_LABEL[card.rank] : SUIT_SYMBOL[card.suit]}
      </span>
    </button>
  );
}

function CardBack() {
  return (
    <div
      aria-label="Face-down card"
      className="relative block h-[var(--tripeaks-card-h)] w-[var(--tripeaks-card-w)] overflow-hidden rounded-md shadow-md shadow-black/30"
    >
      <img src={cardBackAsset} alt="" aria-hidden className="h-full w-full object-cover" />
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="grid h-[var(--tripeaks-card-h)] w-[var(--tripeaks-card-w)] place-items-center rounded-md border border-dashed border-gold/30 text-gold/30" />
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
      <span className="text-[10px] uppercase tracking-[0.18em] text-ivory/45">Stock</span>
    </div>
  );
}

function WastePile({ waste }: { waste: Card[] }) {
  const top = waste[waste.length - 1];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {waste.length > 1 && (
          <div className="absolute -left-1 -top-1 opacity-40">
            <CardBack />
          </div>
        )}
        {top ? <CardFace card={top} /> : <EmptySlot />}
      </div>
      <span className="text-[10px] uppercase tracking-[0.18em] text-ivory/45">Waste</span>
    </div>
  );
}
