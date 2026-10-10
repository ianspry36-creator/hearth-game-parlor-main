import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
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
import { useDeveloperMode } from "@/lib/dev-mode";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import {
  DIFFICULTY_NAME,
  FOUNDATION_SUITS,
  TOTAL_RUNS,
  autoMove,
  canDeal,
  completedRuns,
  dealStock,
  freshGame,
  moveTableau,
  revealTopCard,
  score,
  topRunStart,
  type GameState,
  type SpiderDifficulty,
  type TableauPile,
} from "@/lib/spider";
import { recordBestScore, readBestScores } from "@/lib/spiderScores";
import { recordSpiderScore } from "@/lib/spiderLeaderboard";
import { mulberry32 } from "@/lib/random";
import cardBackAsset from "@/assets/card-back.png";

export const Route = createFileRoute("/spider")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Spider Solitaire — Cards and Games" },
      {
        name: "description",
        content:
          "Spider solitaire in the parlour: build eight descending same-suit runs from King to Ace with two decks of cards.",
      },
      { property: "og:title", content: "Play Spider Solitaire — Cards and Games" },
      {
        property: "og:description",
        content: "A patient game of Spider solitaire, dealt fresh every hand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SpiderTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20260909;

const isRed = (suit: Card["suit"]) => suit === "H" || suit === "D";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

const DIFFICULTIES: SpiderDifficulty[] = [1, 2, 4];

type Selection = { type: "tableau"; index: number; cardIndex: number } | null;

// A completed run's cards fly to the foundation one at a time, Ace first.
const RUN_FLIGHT_MS = 260;
const RUN_STAGGER_MS = 120;

type FlyingCard = {
  key: number;
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
};

function SpiderTable() {
  const navigate = useNavigate();
  const game = getGame("spider");
  const isDev = useDeveloperMode();
  const [difficulty, setDifficulty] = useState<SpiderDifficulty>(4);
  const [state, setState] = useState<GameState>(() => freshGame(4, mulberry32(SSR_SEED)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [dragOverTarget, setDragOverTarget] = useState<number | null>(null);
  const [dragging, setDragging] = useState<Selection>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const dragPointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    source: { type: "tableau"; index: number; cardIndex: number };
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  // Card DOM nodes keyed by card id, and pending FLIP data for double-click moves.
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const flipRef = useRef<{ ids: string[]; rects: (DOMRect | undefined)[] } | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const stockElRef = useRef<HTMLButtonElement | null>(null);
  const dealRef = useRef<{ ids: string[]; rect: DOMRect | undefined } | null>(null);
  const foundationRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flightKeyRef = useRef(0);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const [conceded, setConceded] = useState(false);
  const [dealingRemaining, setDealingRemaining] = useState(0);
  const [crawl, setCrawl] = useState<CrawlRun | null>(null);
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const [settling, setSettling] = useState<number[]>([]);
  const [stockHintOpen, setStockHintOpen] = useState(false);

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

  // Top-10 best scores for the current difficulty, loaded from local storage.
  const [bestScores, setBestScores] = useState<number[]>([]);

  useEffect(() => {
    setState(freshGame(4));
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

    return () => {
      window.clearInterval(id);
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    try {
      setBestScores(readBestScores(difficulty));
    } catch {
      // local storage unavailable; ignore
    }
  }, [difficulty]);

  // Start the clock on the first move rather than when the hand is dealt.
  useEffect(() => {
    if (startRef.current === 0 && state.moves > 0) startRef.current = Date.now();
  }, [state.moves]);

  // Tick the stock counter down one card at a time as the deal flies out.
  useEffect(() => {
    if (dealingRemaining <= 0) return;
    const id = window.setTimeout(() => setDealingRemaining((n) => n - 1), 90);
    return () => window.clearTimeout(id);
  }, [dealingRemaining]);

  useEffect(() => {
    endedRef.current = state.won;
    if (state.won && finishedElapsed === null) {
      setFinishedElapsed(elapsed);
      const finalScore = score(state);
      try {
        setBestScores(recordBestScore(difficulty, finalScore));
      } catch {
        // ignore
      }
      // Push the win onto the shared online leaderboard as well.
      void recordSpiderScore(difficulty, finalScore);
    }
  }, [state.won, finishedElapsed, elapsed, state, difficulty]);

  const shownElapsed = finishedElapsed ?? elapsed;

  const animateCompletedRuns = (before: GameState, after: GameState) => {
    const gained = after.foundations.length - before.foundations.length;
    if (gained <= 0) return;
    const newFlights: FlyingCard[] = [];
    const newSettling: number[] = [];
    for (let k = 0; k < gained; k += 1) {
      const foundationIndex = before.foundations.length + k;
      const run = after.foundations[foundationIndex];
      if (!run || run.length === 0) continue;
      const dest = foundationRefs.current[foundationIndex]?.getBoundingClientRect();
      // The run is stored King-first; fly Ace-first so the King lands on top.
      [...run].reverse().forEach((card, i) => {
        const src = cardEls.current.get(card.id)?.getBoundingClientRect();
        if (!src || !dest) return;
        newFlights.push({
          key: flightKeyRef.current++,
          card,
          from: { x: src.left, y: src.top },
          to: { x: dest.left, y: dest.top },
          delay: i * RUN_STAGGER_MS,
        });
      });
      newSettling.push(foundationIndex);
    }
    if (newFlights.length === 0) return;
    setFlying((cur) => [...cur, ...newFlights]);
    setSettling((cur) => [...cur, ...newSettling]);
    newFlights.forEach((f) => {
      window.setTimeout(() => {
        setFlying((cur) => cur.filter((x) => x.key !== f.key));
      }, f.delay + RUN_FLIGHT_MS + 30);
    });
    const lastDelay = newFlights[newFlights.length - 1]!.delay;
    window.setTimeout(() => {
      setSettling((cur) => cur.filter((idx) => !newSettling.includes(idx)));
    }, lastDelay + RUN_FLIGHT_MS + 40);
  };

  const apply = (candidate: GameState) => {
    if (candidate === state) return;
    recordAction("table action");
    animateCompletedRuns(state, candidate);
    setHistory((h) => [...h, state]);
    setSelection(null);
    setState(candidate);
  };

  const startFresh = (d: SpiderDifficulty) => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setDifficulty(d);
    setState(freshGame(d));
    setHistory([]);
    setSelection(null);
    setFlying([]);
    setSettling([]);
    setFinishedElapsed(null);
    setElapsed(0);
    startRef.current = 0;
    endedRef.current = false;
    setConceded(false);
    recordAction("new game");
    beginNew();
  };

  const reset = () => startFresh(difficulty);

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

  const cycleDifficulty = () => {
    if (gameInProgress) return;
    const next = DIFFICULTIES[(DIFFICULTIES.indexOf(difficulty) + 1) % DIFFICULTIES.length]!;
    startFresh(next);
  };

  // Send a spider crawling straight across the viewport from a random edge to
  // the opposite edge. Shared by the five-minute timer and the dev trigger.
  const clearCrawl = useCallback(() => setCrawl(null), []);
  const triggerCrawl = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pad = 44;
    const edges = ["top", "bottom", "left", "right"] as const;
    const startEdge = edges[Math.floor(Math.random() * edges.length)];
    let fromX = 0;
    let fromY = 0;
    let toX = 0;
    let toY = 0;
    if (startEdge === "top") {
      fromX = Math.random() * w;
      fromY = -pad;
      toX = Math.random() * w;
      toY = h + pad;
    } else if (startEdge === "bottom") {
      fromX = Math.random() * w;
      fromY = h + pad;
      toX = Math.random() * w;
      toY = -pad;
    } else if (startEdge === "left") {
      fromX = -pad;
      fromY = Math.random() * h;
      toX = w + pad;
      toY = Math.random() * h;
    } else {
      fromX = w + pad;
      fromY = Math.random() * h;
      toX = -pad;
      toY = Math.random() * h;
    }
    const dist = Math.hypot(toX - fromX, toY - fromY);
    const duration = Math.max(4000, Math.round(dist / 0.12));
    setCrawl({ key: Date.now(), from: { x: fromX, y: fromY }, to: { x: toX, y: toY }, duration });
  }, []);

  // A spider crawls across the screen every five minutes.
  useEffect(() => {
    const id = window.setInterval(() => triggerCrawl(), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [triggerCrawl]);

  const undo = () => {
    if (history.length === 0 || state.won || conceded) return;
    recordAction("undo");
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    const prev = history[history.length - 1]!;
    // Each undo counts as a move (deducts one point).
    setState({ ...prev, moves: state.moves + 1 });
    setHistory(history.slice(0, -1));
    setSelection(null);
  };

  const clickTableau = (index: number, cardIndex: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const current = stateRef.current;
    const runStart = topRunStart(current.tableau[index]!.faceUp);
    if (cardIndex < runStart) return; // a card buried below the top run cannot be lifted
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

  const pileFromPoint = (x: number, y: number): number => {
    const el = document.elementFromPoint(x, y);
    const pileEl = el?.closest?.("[data-pile-index]");
    if (!pileEl) return -1;
    return Number(pileEl.getAttribute("data-pile-index"));
  };

  const clearDrag = () => {
    dragPointerRef.current = null;
    setDragOverTarget(null);
    setDragging(null);
    setGhost(null);
  };

  const cardPointerDown = (
    index: number,
    cardIndex: number,
    e: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    suppressClickRef.current = false;
    const pile = stateRef.current.tableau[index];
    if (!pile) return;
    const runStart = topRunStart(pile.faceUp);
    if (cardIndex < runStart) return; // buried cards cannot be lifted
    dragPointerRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.currentTarget.clientWidth / 2,
      offsetY: e.currentTarget.clientHeight / 2,
      source: { type: "tableau", index, cardIndex },
      moved: false,
    };
  };

  const cardPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragPointerRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 8) return;
      d.moved = true;
      setSelection(null);
      setDragging(d.source);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore environments without pointer capture
      }
    }
    setGhost({ x: e.clientX, y: e.clientY, offsetX: d.offsetX, offsetY: d.offsetY });
    setDragOverTarget(pileFromPoint(e.clientX, e.clientY));
  };

  const cardPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragPointerRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const wasMoved = d.moved;
    clearDrag();
    if (!wasMoved) return; // simple tap — let onClick handle selection
    suppressClickRef.current = true;
    const target = pileFromPoint(e.clientX, e.clientY);
    if (target >= 0) {
      const candidate = moveTableau(stateRef.current, d.source.index, d.source.cardIndex, target);
      if (candidate !== stateRef.current) apply(candidate);
    }
  };

  const cardPointerCancel = () => {
    clearDrag();
  };

  const clickStock = () => {
    const current = stateRef.current;
    if (!canDeal(current)) {
      if (current.stock.length > 0) setStockHintOpen(true);
      return;
    }
    const count = Math.min(10, current.stock.length);
    const dealtIds = current.stock
      .slice(current.stock.length - count)
      .map((c) => c.id)
      .reverse();
    const rect = stockElRef.current?.getBoundingClientRect();
    const candidate = dealStock(current);
    if (candidate === current) return;
    dealRef.current = { ids: dealtIds, rect };
    setDealingRemaining(count);
    apply(candidate);
  };

  const registerCard = (id: string, el: HTMLDivElement | null) => {
    if (el) cardEls.current.set(id, el);
    else cardEls.current.delete(id);
  };

  const doubleClickTableau = (index: number) => {
    const current = stateRef.current;
    const from = current.tableau[index];
    if (!from || from.faceUp.length === 0 || current.won) return;
    const runStart = topRunStart(from.faceUp);
    const movingIds = from.faceUp.slice(runStart).map((c) => c.id);
    const rects = movingIds.map((id) => cardEls.current.get(id)?.getBoundingClientRect());
    // Move first without flipping the newly-exposed face-down card, so the
    // reveal can wait until the flight animation has finished.
    const deferred = autoMove(current, index, false);
    if (deferred === current) return;
    flipRef.current = { ids: movingIds, rects };
    apply(deferred);
    if (from.faceDown.length > 0 && runStart === 0) {
      if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        const before = stateRef.current;
        const next = revealTopCard(before, index);
        if (next === before) return;
        animateCompletedRuns(before, next);
        setState(next);
      }, 240);
    }
  };

  // Fly the cards from their old spot to their new one on a double-click move.
  useLayoutEffect(() => {
    const pending = flipRef.current;
    if (!pending) return;
    flipRef.current = null;
    pending.ids.forEach((id, i) => {
      const el = cardEls.current.get(id);
      const from = pending.rects[i];
      if (!el || !from) return;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (dx === 0 && dy === 0) return;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: 240, easing: "ease-out" },
      );
    });
  });

  // Fly each dealt stock card to its new column, one at a time.
  useLayoutEffect(() => {
    const pending = dealRef.current;
    if (!pending) return;
    dealRef.current = null;
    pending.ids.forEach((id, i) => {
      const el = cardEls.current.get(id);
      const from = pending.rect;
      if (!el || !from) return;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
          { transform: "translate(0, 0)", opacity: 1 },
        ],
        { duration: 220, delay: i * 90, easing: "ease-out", fill: "backwards" },
      );
    });
  });

  return (
    <div className="min-h-screen text-cream">
      <div className="relative mx-auto max-w-6xl px-0.5 pb-10 pt-6 sm:px-6">
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
              <h1 className="font-display text-2xl font-bold leading-tight">Spider</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={confirmHome}
              className="cursor-pointer bg-transparent text-xs uppercase tracking-[0.2em] text-white transition-colors hover:text-gold"
            >
              ← BACK TO GAME ROOM
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-center gap-6 border-y border-gold/15 py-4 text-center">
          <Stat label="Score" value={String(score(state))} />
          <Stat label="Moves" value={String(state.moves)} />
          <Stat label="Time" value={formatElapsed(shownElapsed)} />
          <Stat label="Runs" value={`${completedRuns(state)} / ${TOTAL_RUNS}`} />
          <Stat label="Best score" value={bestScores.length > 0 ? String(bestScores[0]) : "—"} />
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_260px]">
          <div className="relative select-none rounded-2xl border border-gold/15 bg-[#4c9a2a] px-0.5 py-[22.4px] text-black sm:px-6 sm:py-[33.6px]">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-6">
              <StockPile
                count={state.stock.length + dealingRemaining}
                disabled={!canDeal(state)}
                onClick={clickStock}
                stockRef={stockElRef}
              />
              <div className="flex flex-wrap gap-[3px] sm:gap-1.5">
                {FOUNDATION_SUITS[difficulty].map((suit, i) => {
                  const done = i < state.foundations.length;
                  const king = done ? state.foundations[i]![0] : undefined;
                  const isSettling = settling.includes(i);
                  return (
                    <div
                      key={i}
                      ref={(el) => {
                        foundationRefs.current[i] = el;
                      }}
                      className={`relative grid h-[var(--spider-card-h)] w-[var(--spider-card-w)] place-items-center rounded-md border border-dashed ${
                        done ? "border-black bg-gold/25" : "border-black/30"
                      }`}
                    >
                      {king && !isSettling ? (
                        <div className="pointer-events-none">
                          <CardFace card={king} />
                        </div>
                      ) : (
                        <span className={`text-4xl ${isRed(suit) ? "text-destructive" : "text-ink"}`}>
                          {SUIT_SYMBOL[suit]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-start justify-center gap-0.5 sm:gap-1">
              {state.tableau.map((pile, index) => (
                <TableauPile
                  key={index}
                  pile={pile}
                  index={index}
                  selection={selection}
                  dragging={dragging}
                  onCardClick={clickTableau}
                  onCardDoubleClick={doubleClickTableau}
                  registerCard={registerCard}
                  onEmptyClick={clickEmpty}
                  onCardPointerDown={cardPointerDown}
                  onCardPointerMove={cardPointerMove}
                  onCardPointerUp={cardPointerUp}
                  onCardPointerCancel={cardPointerCancel}
                  isDropTarget={dragOverTarget === index}
                />
              ))}
            </div>

            {ghost && dragging && (
              <div
                className="pointer-events-none fixed z-50"
                style={{ left: ghost.x - ghost.offsetX, top: ghost.y - ghost.offsetY }}
              >
                {(state.tableau[dragging.index]?.faceUp ?? [])
                  .slice(dragging.cardIndex)
                  .map((card, i) => (
                    <div
                      key={card.id}
                      style={{
                        marginTop:
                          i === 0 ? 0 : "calc(var(--spider-visible) - var(--spider-card-h))",
                      }}
                    >
                      <CardFace card={card} />
                    </div>
                  ))}
              </div>
            )}

            <p className="mt-6 text-center text-xs text-black">
              Build eight descending runs, King to Ace, in a single suit. Move a card onto any card
              one rank higher — a run only clears when all thirteen cards share a suit. Deal from the
              stock only when every column holds a card.
            </p>

            <div className="mt-4 flex justify-center">
              <Button
                variant="parlor"
                onClick={undo}
                disabled={history.length === 0 || state.won || conceded}
              >
                Undo
              </Button>
            </div>

            {state.won && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🎉</div>
                  <h2 className="font-display text-3xl font-bold text-gold">
                    You cleared the table!
                  </h2>
                  <p className="mx-auto max-w-sm text-ivory/70">
                    All eight runs made it home — final score {score(state)}.
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
                {isDev && (
                  <Button variant="parlorGhost" className="w-full" onClick={triggerCrawl}>
                    🕷️ Spawn spider
                  </Button>
                )}
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
                    <span className="text-xs uppercase tracking-[0.2em] text-ivory/50">Difficulty</span>
                    <button
                      type="button"
                      onClick={cycleDifficulty}
                      disabled={gameInProgress}
                      className="rounded-full border border-gold/25 bg-gold/5 px-2.5 py-0.5 text-xs capitalize text-cream transition-colors hover:border-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        gameInProgress
                          ? "Difficulty is locked once the first move has been made"
                          : "Change difficulty"
                      }
                    >
                      {DIFFICULTY_NAME[difficulty]}
                    </button>
                  </div>
                </div>
                <FavouriteSwitch gameId="spider" />
              </div>
            </div>
          </aside>
        </div>
      </div>

      {flying.map((f) => (
        <FlyingCardView key={f.key} flight={f} />
      ))}

      {crawl && <CrawlingSpider key={crawl.key} run={crawl} onDone={clearCrawl} />}

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "home" ? "Leave the table?" : "Start a new game?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "home"
                ? "Leaving for the game room will abandon the hand you're playing."
                : "Starting a new game will abandon the hand you're playing."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming === "home") {
                  recordResult("abandoned");
                  recordAction("home");
                  void navigate({ to: "/" });
                } else if (confirming === "new") {
                  recordResult("abandoned");
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

      <AlertDialog
        open={stockHintOpen}
        onOpenChange={(open) => {
          if (!open) setStockHintOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Can't deal yet</AlertDialogTitle>
            <AlertDialogDescription>
              Every column must hold at least one card before you can deal from the stock. Fill any
              empty columns first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setStockHintOpen(false)}>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type CrawlRun = {
  key: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  duration: number;
};

function FlyingCardView({ flight }: { flight: FlyingCard }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const anim = el.animate(
      [
        { transform: `translate(${flight.from.x}px, ${flight.from.y}px)` },
        { transform: `translate(${flight.to.x}px, ${flight.to.y}px)` },
      ],
      { duration: RUN_FLIGHT_MS, delay: flight.delay, easing: "ease-in", fill: "both" },
    );
    return () => anim.cancel();
  }, [flight]);
  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed left-0 top-0 z-50">
      <CardFace card={flight.card} />
    </div>
  );
}

function CrawlingSpider({ run, onDone }: { run: CrawlRun; onDone: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // The art's head points "up", so add 90° so it points along the direction of travel.
  const angle = (Math.atan2(run.to.y - run.from.y, run.to.x - run.from.x) * 180) / Math.PI + 90;
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const anim = el.animate(
      [
        { transform: `translate(${run.from.x}px, ${run.from.y}px) rotate(${angle}deg)` },
        { transform: `translate(${run.to.x}px, ${run.to.y}px) rotate(${angle}deg)` },
      ],
      { duration: run.duration, easing: "linear", fill: "forwards" },
    );
    anim.onfinish = () => onDone();
    return () => anim.cancel();
  }, [run, onDone, angle]);

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none fixed left-0 top-0 z-[999] will-change-transform"
      style={{
        width: 0,
        height: 0,
        transformOrigin: "0 0",
        transform: `translate(${run.from.x}px, ${run.from.y}px) rotate(${angle}deg)`,
      }}
    >
      <div className="absolute" style={{ left: -22, top: -22 }}>
        <SpiderArt />
      </div>
    </div>
  );
}

function SpiderArt() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" aria-hidden="true" className="drop-shadow-md">
      <g stroke="#151310" strokeWidth="2.2" strokeLinecap="round" fill="none">
        <line className="spider-leg spider-leg-l spider-leg--a" x1="18" y1="17" x2="3" y2="11" />
        <line className="spider-leg spider-leg-l spider-leg--b" x1="18" y1="22" x2="2" y2="23" />
        <line className="spider-leg spider-leg-l spider-leg--a" x1="18" y1="27" x2="2" y2="28" />
        <line className="spider-leg spider-leg-l spider-leg--b" x1="18" y1="32" x2="3" y2="37" />
        <line className="spider-leg spider-leg-r spider-leg--a" x1="30" y1="17" x2="45" y2="11" />
        <line className="spider-leg spider-leg-r spider-leg--b" x1="30" y1="22" x2="46" y2="23" />
        <line className="spider-leg spider-leg-r spider-leg--a" x1="30" y1="27" x2="46" y2="28" />
        <line className="spider-leg spider-leg-r spider-leg--b" x1="30" y1="32" x2="45" y2="37" />
      </g>
      <ellipse cx="24" cy="24" rx="8" ry="10" fill="#151310" />
      <circle cx="24" cy="10" r="4" fill="#151310" />
      <circle cx="22.4" cy="9" r="0.9" fill="#e74c3c" />
      <circle cx="25.6" cy="9" r="0.9" fill="#e74c3c" />
    </svg>
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
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  card: Card;
  selected?: boolean;
  hidden?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: () => void;
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
      onPointerCancel={onPointerCancel}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--spider-card-h)] w-[var(--spider-card-w)] touch-none select-none overflow-hidden rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-destructive" : "text-ink"
      } ${selected ? "-translate-y-1 ring-2 ring-gold" : ""} ${hidden ? "invisible" : ""}`}
    >
      <span className="absolute left-1 top-0.5 flex flex-col items-center font-display text-[13.5px] font-bold leading-none sm:text-lg">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-xs sm:text-[15px]">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span
        aria-hidden
        className={`absolute inset-0 grid place-items-center font-display text-[21px] sm:text-[27px] ${
          isFace ? "opacity-90" : "opacity-80"
        }`}
      >
        {isFace ? (
          <span className="flex flex-col items-center leading-none">
            <span className="text-sm sm:text-lg">{RANK_LABEL[card.rank]}</span>
            <span className="text-[17px] sm:text-[21px]">{SUIT_SYMBOL[card.suit]}</span>
          </span>
        ) : (
          SUIT_SYMBOL[card.suit]
        )}
      </span>
      <span className="absolute bottom-0.5 right-1 flex rotate-180 flex-col items-center font-display text-[13.5px] font-bold leading-none sm:text-lg">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-xs sm:text-[15px]">{SUIT_SYMBOL[card.suit]}</span>
      </span>
    </button>
  );
}

function CardBack() {
  return (
    <div
      aria-label="Face-down card"
      className="relative block h-[var(--spider-card-h)] w-[var(--spider-card-w)] overflow-hidden rounded-lg shadow-md shadow-black/30"
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
      className="grid h-[var(--spider-card-h)] w-[var(--spider-card-w)] place-items-center rounded-md border border-dashed border-gold/30 text-lg text-gold/30"
    >
      ♚
    </button>
  );
}

function StockPile({
  count,
  disabled,
  onClick,
  stockRef,
}: {
  count: number;
  disabled: boolean;
  onClick: () => void;
  stockRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {count > 0 ? (
          <>
            {count > 5 && (
              <div className="absolute -top-4 left-0 opacity-15">
                <CardBack />
              </div>
            )}
            {count > 3 && (
              <div className="absolute -top-3 left-0 opacity-30">
                <CardBack />
              </div>
            )}
            {count > 2 && (
              <div className="absolute -top-2 left-0 opacity-50">
                <CardBack />
              </div>
            )}
            {count > 1 && (
              <div className="absolute -top-1 left-0 opacity-75">
                <CardBack />
              </div>
            )}
            <button
              ref={stockRef}
              type="button"
              onClick={onClick}
              aria-label="Deal from the stock"
              className={`relative block cursor-pointer rounded-md transition-opacity ${
                disabled ? "opacity-60" : "hover:opacity-80"
              }`}
            >
              <CardBack />
            </button>
          </>
        ) : (
          <EmptySlot />
        )}
        <span className="pointer-events-none absolute -right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-black/80">
          {count}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-[0.18em] text-black">Stock</span>
    </div>
  );
}

function TableauPile({
  pile,
  index,
  selection,
  dragging,
  onCardClick,
  onCardDoubleClick,
  registerCard,
  onEmptyClick,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onCardPointerCancel,
  isDropTarget,
}: {
  pile: TableauPile;
  index: number;
  selection: Selection;
  dragging: Selection;
  onCardClick: (index: number, cardIndex: number) => void;
  onCardDoubleClick: (index: number) => void;
  registerCard: (id: string, el: HTMLDivElement | null) => void;
  onEmptyClick: (index: number) => void;
  onCardPointerDown: (
    index: number,
    cardIndex: number,
    e: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onCardPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onCardPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onCardPointerCancel: () => void;
  isDropTarget: boolean;
}) {
  const empty = pile.faceDown.length === 0 && pile.faceUp.length === 0;
  return (
    <div
      data-pile-index={index}
      className={`flex flex-col items-stretch rounded-md ${isDropTarget ? "ring-2 ring-gold" : ""}`}
    >
      {pile.faceDown.map((card, i) => (
        <div
          key={card.id}
          style={{ marginTop: i === 0 ? 0 : "calc(var(--spider-down) - var(--spider-card-h))" }}
        >
          <CardBack />
        </div>
      ))}
      {pile.faceUp.map((card, i) => {
        const isSelected =
          selection?.type === "tableau" && selection.index === index && i >= selection.cardIndex;
        const isDragging =
          dragging?.type === "tableau" && dragging.index === index && i >= dragging.cardIndex;
        const marginTop =
          i === 0
            ? pile.faceDown.length > 0
              ? "calc(var(--spider-down) - var(--spider-card-h))"
              : 0
            : "calc(var(--spider-visible) - var(--spider-card-h))";
        return (
          <div
            key={card.id}
            ref={(el) => registerCard(card.id, el)}
            style={{ marginTop }}
          >
            <CardFace
              card={card}
              selected={isSelected}
              hidden={isDragging}
              onClick={() => onCardClick(index, i)}
              onDoubleClick={() => onCardDoubleClick(index)}
              onPointerDown={(e) => onCardPointerDown(index, i, e)}
              onPointerMove={onCardPointerMove}
              onPointerUp={onCardPointerUp}
              onPointerCancel={onCardPointerCancel}
            />
          </div>
        );
      })}
      {empty && <EmptySlot onClick={() => onEmptyClick(index)} />}
    </div>
  );
}





