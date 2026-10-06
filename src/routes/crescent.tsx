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
import { CardMark } from "@/components/parlor/CardMark";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import {
  foundationTarget,
  freshGame,
  isRed,
  moveFoundationToTableau,
  moveTableauToFoundation,
  moveTableauToTableau,
  nextDifficulty,
  readDifficulty,
  SHUFFLES_BY_DIFFICULTY,
  shuffleTableaus,
  writeDifficulty,
  type Difficulty,
  type GameState,
} from "@/lib/crescent";
import { mulberry32 } from "@/lib/random";
import { startGame, updateGameStatus } from "@/lib/games-started";

export const Route = createFileRoute("/crescent")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Crescent Solitaire — Cards and Games" },
      {
        name: "description",
        content:
          "Crescent Solitaire in the parlor: sixteen piles arranged in a crescent, two decks, and eight foundations built from the King down and the Ace up.",
      },
      { property: "og:title", content: "Play Crescent Solitaire — Cards and Games" },
      {
        property: "og:description",
        content: "A patient game of Crescent Solitaire, dealt fresh every hand with a limited number of shuffles.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CrescentTable,
});

// A fixed seed so the server and the first client render deal the same layout,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20261005;

// How long a card takes to fly between piles on a click/double-click move.
const FLIGHT_MS = 300;

// Shuffle effect timing: each tableau pile animates in turn, from pile 1 to 16.
const SHUFFLE_MS = 450;
const SHUFFLE_STAGGER_MS = 90;

type FlyingCard = {
  key: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  card: Card;
};

// Logical board geometry. Positions are expressed as percentages so the board
// scales with its container while keeping the crescent shape intact.
const BOARD_W = 1240;
const BOARD_H = 850;

// Crescent arch geometry: a half-circle swept from the left endpoint, over the
// apex, down to the right endpoint.
const CX = 620;
const RX = 560;
const RY = 360;
const BASE_Y = 440;
const archX = (i: number) => CX + RX * Math.cos(Math.PI - (i / 15) * Math.PI);
const archY = (i: number) => BASE_Y - RY * Math.sin(Math.PI - (i / 15) * Math.PI);

// The four end piles on each side tuck under the 5th pile (index 4) and the
// 12th pile (index 11), fanning downward so every card stays fully visible.
const SIDE_GAP = 140;
const LEFT_ANCHOR = 4;
const RIGHT_ANCHOR = 11;
const ANCHOR_Y = archY(LEFT_ANCHOR); // == archY(RIGHT_ANCHOR), symmetric
// Nudge the two end groups (their four fanned cards plus the anchor card) away
// from the arch so they stop overlapping the neighbouring arch card.
const SIDE_NUDGE = 24;

/** Sixteen tableau piles arranged in an upside-down-U (crescent) arch. */
const TABLEAU_POSITIONS = Array.from({ length: 16 }, (_, i) => {
  let x = archX(i);
  let y = archY(i);
  if (i <= LEFT_ANCHOR) {
    x = archX(LEFT_ANCHOR) - SIDE_NUDGE;
    if (i < LEFT_ANCHOR) y = ANCHOR_Y + (LEFT_ANCHOR - i) * SIDE_GAP;
  } else if (i >= RIGHT_ANCHOR) {
    x = archX(RIGHT_ANCHOR) + SIDE_NUDGE;
    if (i > RIGHT_ANCHOR) y = ANCHOR_Y + (i - RIGHT_ANCHOR) * SIDE_GAP;
  }
  return { left: `${(x / BOARD_W) * 100}%`, top: `${(y / BOARD_H) * 100}%` };
});

/** Eight foundations in two centred rows: kings on top, aces below. */
// The kings row is levelled with the 3rd crescent card (tableau index 2).
const KING_Y = ANCHOR_Y + 2 * SIDE_GAP;
const FOUNDATION_POSITIONS = Array.from({ length: 8 }, (_, i) => {
  const row = i < 4 ? 0 : 1;
  const col = i % 4;
  const x = 620 + (col - 1.5) * 120;
  const y = KING_Y + row * 150;
  return { left: `${(x / BOARD_W) * 100}%`, top: `${(y / BOARD_H) * 100}%` };
});

type Selection = { type: "tableau"; index: number } | { type: "foundation"; index: number } | null;

type DragSource = { type: "tableau"; index: number } | { type: "foundation"; index: number };

/**
 * The single card whose pile membership changed between two consecutive states
 * (a tableau/foundation move). Used to animate an undo back to where the card
 * came from. Returns null when nothing changed piles (e.g. a shuffle, which only
 * rotates cards within their own piles).
 */
function findMovedCard(
  current: GameState,
  previous: GameState,
): { card: Card; from: DragSource; to: DragSource } | null {
  const locate = (gs: GameState, id: string): DragSource | null => {
    for (let i = 0; i < gs.tableaus.length; i++)
      if (gs.tableaus[i]!.some((c) => c.id === id)) return { type: "tableau", index: i };
    for (let i = 0; i < gs.foundations.length; i++)
      if (gs.foundations[i]!.some((c) => c.id === id)) return { type: "foundation", index: i };
    return null;
  };
  const topOf = (gs: GameState, loc: DragSource): Card | undefined =>
    loc.type === "tableau" ? gs.tableaus[loc.index]!.slice(-1)[0] : gs.foundations[loc.index]!.slice(-1)[0];
  const ids = new Set<string>();
  current.tableaus.forEach((p) => p.forEach((c) => ids.add(c.id)));
  current.foundations.forEach((p) => p.forEach((c) => ids.add(c.id)));
  for (const id of ids) {
    const from = locate(current, id);
    const to = locate(previous, id);
    if (from && to && (from.type !== to.type || from.index !== to.index)) {
      const card = topOf(current, from);
      if (card) return { card, from, to };
    }
  }
  return null;
}

function CrescentTable() {
  const navigate = useNavigate();
  const game = getGame("crescent");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [state, setState] = useState<GameState>(() => freshGame("medium", mulberry32(SSR_SEED)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const [conceded, setConceded] = useState(false);
  const [dealKey, setDealKey] = useState(0);
  const [shuffleTick, setShuffleTick] = useState(0);
  // During a shuffle each pile keeps its pre-shuffle cards until its own hop in
  // the stagger plays, then swaps to the newly shuffled cards one pile at a time.
  const [shuffleOld, setShuffleOld] = useState<Card[][] | null>(null);
  const [shuffleRevealed, setShuffleRevealed] = useState(0);
  const shuffleTimersRef = useRef<number[]>([]);
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const flightKeyRef = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const gameRowRef = useRef<string | null>(null);
  const { recordResult } = useSolitaireStats(game.id, difficulty);
  const stateRef = useRef(state);
  stateRef.current = state;
  const prevWonRef = useRef(false);

  useEffect(() => {
    if (state.won && !prevWonRef.current) {
      recordResult("win");
      void updateGameStatus(gameRowRef.current, "won");
    }
    prevWonRef.current = state.won;
  }, [state.won, recordResult]);

  useEffect(() => {
    const stored = readDifficulty();
    setDifficulty(stored);
    setState(freshGame(stored));
    setHistory([]);
    setSelection(null);
    setDealKey((k) => k + 1);
    void startGame(game.name).then((id) => {
      gameRowRef.current = id;
    });
  }, [game.name]);

  useEffect(() => {
    return () => {
      shuffleTimersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const apply = (candidate: GameState) => {
    if (candidate === state) return;
    setHistory((h) => [...h, state]);
    setSelection(null);
    setState(candidate);
  };

  const reset = (d?: Difficulty) => {
    const diff = d ?? state.difficulty;
    setState(freshGame(diff));
    setHistory([]);
    setSelection(null);
    setConceded(false);
    setDealKey((k) => k + 1);
    setShuffleTick(0);
    shuffleTimersRef.current.forEach((id) => window.clearTimeout(id));
    shuffleTimersRef.current = [];
    setShuffleOld(null);
    setShuffleRevealed(0);
    void startGame(game.name).then((id) => {
      gameRowRef.current = id;
    });
  };

  // Difficulty is fixed once the game has started (the first card is moved).
  const difficultyLocked = state.moves > 0;
  const cycleDifficulty = () => {
    if (difficultyLocked) return;
    const next = nextDifficulty(difficulty);
    setDifficulty(next);
    writeDifficulty(next);
    // Change the difficulty (and its shuffle allowance) without re-dealing, so
    // the cards already on the table stay exactly where they are.
    setState((s) => ({ ...s, difficulty: next, shufflesLeft: SHUFFLES_BY_DIFFICULTY[next] }));
  };

  const concede = () => {
    if (state.won || conceded) return;
    recordResult("loss");
    void updateGameStatus(gameRowRef.current, "conceded");
    setConceded(true);
  };

  const gameInProgress = state.moves > 0 && !state.won && !conceded;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : reset());
  const confirmHome = () => (gameInProgress ? setConfirming("home") : void navigate({ to: "/" }));

  const undo = () => {
    if (history.length === 0 || conceded || state.won) return;
    const prev = history[history.length - 1]!;
    // Fly the moved card back to where it came from before restoring the state.
    const moved = findMovedCard(state, prev);
    if (moved) flyCard(moved.from, moved.to, moved.card);
    setState(prev);
    setHistory(history.slice(0, -1));
    setSelection(null);
  };

  const shuffle = () => {
    if (state.won || conceded || state.shufflesLeft <= 0) return;
    const candidate = shuffleTableaus(state);
    if (candidate === state) return;
    // Snapshot the current piles so each one can reveal its newly shuffled cards
    // only when its own hop in the stagger plays, instead of all at once.
    const oldTableaus = state.tableaus.map((p) => p.slice());
    shuffleTimersRef.current.forEach((id) => window.clearTimeout(id));
    shuffleTimersRef.current = [];
    setHistory((h) => [...h, state]);
    setSelection(null);
    setState(candidate);
    setShuffleTick((t) => t + 1);
    setShuffleOld(oldTableaus);
    setShuffleRevealed(0);
    for (let i = 0; i < TABLEAU_POSITIONS.length; i++) {
      shuffleTimersRef.current.push(
        window.setTimeout(() => setShuffleRevealed(i + 1), i * SHUFFLE_STAGGER_MS),
      );
    }
    shuffleTimersRef.current.push(
      window.setTimeout(() => {
        setShuffleOld(null);
        setShuffleRevealed(0);
      }, TABLEAU_POSITIONS.length * SHUFFLE_STAGGER_MS + SHUFFLE_MS + 50),
    );
  };

  const clickTableau = (index: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (selection) {
      if (selection.type === "tableau") {
        if (selection.index === index) {
          setSelection(null);
          return;
        }
        const card = state.tableaus[selection.index]!.slice(-1)[0];
        const candidate = moveTableauToTableau(state, selection.index, index);
        if (candidate !== state && card)
          flyCard({ type: "tableau", index: selection.index }, { type: "tableau", index }, card);
        apply(candidate);
      } else if (selection.type === "foundation") {
        const card = state.foundations[selection.index]!.slice(-1)[0];
        const candidate = moveFoundationToTableau(state, selection.index, index);
        if (candidate !== state && card)
          flyCard({ type: "foundation", index: selection.index }, { type: "tableau", index }, card);
        apply(candidate);
      }
      return;
    }
    if (state.tableaus[index]!.length > 0) setSelection({ type: "tableau", index });
  };

  const clickFoundation = (index: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (selection) {
      if (selection.type === "tableau") {
        const card = state.tableaus[selection.index]!.slice(-1)[0];
        const candidate = moveTableauToFoundation(state, selection.index, index);
        if (candidate !== state && card)
          flyCard({ type: "tableau", index: selection.index }, { type: "foundation", index }, card);
        apply(candidate);
      } else if (selection.type === "foundation") {
        setSelection(null);
      }
      return;
    }
    // Only a foundation with a movable (non-seed) top card can be selected.
    if (state.foundations[index]!.length > 1) setSelection({ type: "foundation", index });
  };

  const doubleClickTableau = (index: number) => {
    const pile = state.tableaus[index]!;
    if (pile.length === 0) return;
    setSelection(null);
    const card = pile[pile.length - 1]!;
    const target = foundationTarget(card, state.foundations);
    if (target !== null) {
      const candidate = moveTableauToFoundation(state, index, target);
      if (candidate !== state) flyCard({ type: "tableau", index }, { type: "foundation", index: target }, card);
      apply(candidate);
    }
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
  // Card ids currently being dragged, so the original is hidden while the
  // ghost follows the pointer (avoids a duplicate card left behind at source).
  const draggingIds = dragGhost ? new Set(dragGhost.cards.map((c) => c.id)) : null;
  const flyingIds = new Set(flying.map((f) => f.card.id));

  const cardsFor = (source: DragSource): Card[] => {
    const s = stateRef.current;
    if (source.type === "tableau") return s.tableaus[source.index]!.slice(-1);
    return s.foundations[source.index]!.slice(-1);
  };

  const cardDims = () => {
    const styles = getComputedStyle(document.documentElement);
    const parse = (name: string, fallback: number) => {
      const value = parseFloat(styles.getPropertyValue(name));
      return Number.isFinite(value) ? value : fallback;
    };
    return {
      w: parse("--cr-card-w", 50),
      h: parse("--cr-card-h", 70),
      visible: parse("--cr-visible", 0),
    };
  };

  const beginDrag = (source: DragSource) => (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const cards = cardsFor(source);
    if (cards.length === 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const dims = cardDims();
    dragRef.current = { source, cards, startX: e.clientX, startY: e.clientY, moved: false, ...dims };
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

  const dropOntoTableau = (source: DragSource, index: number) => {
    const s = stateRef.current;
    if (source.type === "tableau") apply(moveTableauToTableau(s, source.index, index));
    else apply(moveFoundationToTableau(s, source.index, index));
  };

  const dropOntoFoundation = (source: DragSource, index: number) => {
    const s = stateRef.current;
    if (source.type === "tableau") apply(moveTableauToFoundation(s, source.index, index));
  };

  const endDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragGhost(null);
    if (!drag.moved) return; // it was a tap — let onClick handle selection
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const drop = target?.closest("[data-drop]");
    if (drop) {
      const kind = drop.getAttribute("data-drop");
      const index = Number(drop.getAttribute("data-index"));
      if (kind === "tableau") dropOntoTableau(drag.source, index);
      else if (kind === "foundation") dropOntoFoundation(drag.source, index);
    }
  };

  const pileCentre = (type: "tableau" | "foundation", index: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const pos = type === "tableau" ? TABLEAU_POSITIONS[index] : FOUNDATION_POSITIONS[index];
    const { w, h } = cardDims();
    const fallback = {
      x: (typeof window === "undefined" ? 0 : window.innerWidth / 2) - w / 2,
      y: (typeof window === "undefined" ? 0 : window.innerHeight / 2) - h / 2,
    };
    if (!rect || !pos) return fallback;
    return {
      x: rect.left + (parseFloat(pos.left) / 100) * rect.width - w / 2,
      y: rect.top + (parseFloat(pos.top) / 100) * rect.height - h / 2,
    };
  };

  const flyCard = (
    from: { type: "tableau" | "foundation"; index: number },
    to: { type: "tableau" | "foundation"; index: number },
    card: Card,
  ) => {
    const key = flightKeyRef.current++;
    setFlying((current) => [
      ...current,
      { key, from: pileCentre(from.type, from.index), to: pileCentre(to.type, to.index), card },
    ]);
    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== key));
    }, FLIGHT_MS);
  };

  return (
    <div className="min-h-screen text-cream">
      <div className="mx-auto max-w-7xl px-1.5 py-8 sm:px-6">
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
              <h1 className="font-display text-2xl font-bold leading-tight">Crescent Solitaire</h1>
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

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_280px]">
          <div className="relative select-none rounded-2xl border border-gold/20 bg-[#4c9a2a] p-2 text-black sm:p-4">
            <div ref={boardRef} className="relative mx-auto w-full" style={{ aspectRatio: `${BOARD_W} / ${BOARD_H}` }}>
              <div key={dealKey} className="absolute inset-0">
                {state.foundations.map((pile, index) => (
                  <FoundationPile
                    key={index}
                    pile={pile}
                    index={index}
                    selection={selection}
                    draggingIds={draggingIds}
                    flyingIds={flyingIds}
                    style={FOUNDATION_POSITIONS[index]!}
                    onClick={() => clickFoundation(index)}
                    onPointerDown={beginDrag({ type: "foundation", index })}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                  />
                ))}
                {state.tableaus.map((pile, index) => (
                  <TableauPile
                    key={index}
                    pile={pile}
                    index={index}
                    selection={selection}
                    draggingIds={draggingIds}
                    flyingIds={flyingIds}
                    style={TABLEAU_POSITIONS[index]!}
                    shuffleTick={shuffleTick}
                    shuffleOld={shuffleOld}
                    shuffleRevealed={shuffleRevealed}
                    onClick={() => clickTableau(index)}
                    onDoubleClick={() => doubleClickTableau(index)}
                    onPointerDown={beginDrag({ type: "tableau", index })}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                  />
                ))}
              </div>

              {state.won && (
                <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
                  <div className="space-y-4 text-center">
                    <div className="text-5xl">🎉</div>
                    <h2 className="font-display text-3xl font-bold text-gold">You cleared the crescent!</h2>
                    <p className="mx-auto max-w-sm text-ivory/70">
                      Every card made it home to the foundations in {state.moves} moves.
                    </p>
                    <Button variant="parlor" onClick={() => reset()}>
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
                    <Button variant="parlor" onClick={() => reset()}>
                      Deal again
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-gold/15 pt-1">
              <span className="text-sm text-black">
                {state.moves} {state.moves === 1 ? "move" : "moves"}
              </span>
              <span className="text-sm text-black">
                {state.shufflesLeft} {state.shufflesLeft === 1 ? "shuffle" : "shuffles"} left
              </span>
              <Button
                variant="parlor"
                onClick={shuffle}
                disabled={state.won || conceded || state.shufflesLeft <= 0}
              >
                Shuffle
              </Button>
              <Button
                variant="parlorGhost"
                onClick={undo}
                disabled={history.length === 0 || conceded || state.won}
              >
                Undo
              </Button>
            </div>
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
                <div className="flex w-full items-center justify-between gap-2.5">
                  <span className="text-xs uppercase tracking-[0.2em] text-ivory/50">Difficulty</span>
                  <button
                    type="button"
                    onClick={cycleDifficulty}
                    disabled={difficultyLocked}
                    className="rounded-full border border-gold/25 bg-gold/5 px-2.5 py-0.5 text-xs capitalize text-cream transition-colors hover:border-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
                    title={
                      difficultyLocked
                        ? "Difficulty is locked once the game has started"
                        : "Change difficulty"
                    }
                  >
                    {difficulty}
                  </button>
                </div>
                <FavouriteSwitch gameId="crescent" />
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
                  void updateGameStatus(gameRowRef.current, "game room");
                  void navigate({ to: "/" });
                } else if (confirming === "new") {
                  void updateGameStatus(gameRowRef.current, "new game");
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

      {dragGhost && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: dragGhost.x - dragGhost.w / 2, top: dragGhost.y - dragGhost.h / 2 }}
        >
          {dragGhost.cards.map((card) => (
            <CardFace key={card.id} card={card} />
          ))}
        </div>
      )}
      {flying.map((flight) => (
        <FlyingCardView key={flight.key} flight={flight} />
      ))}
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
      className={`relative block h-[var(--cr-card-h)] w-[var(--cr-card-w)] touch-none select-none rounded-md border border-black/10 bg-white text-left shadow-sm shadow-black/30 transition-transform ${
        red ? "text-[#c0392b]" : "text-ink"
      } ${selected ? "-translate-y-1 ring-2 ring-gold" : ""} ${hidden ? "opacity-0" : ""}`}
    >
      <span className="absolute left-0.5 top-0.5 flex flex-col items-center font-display text-[15px] font-bold leading-none sm:text-lg">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="mt-0.5 text-[13.5px] sm:text-[16.5px]">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="absolute inset-0 grid place-items-center text-[27px] sm:text-4xl">
        {isFace ? RANK_LABEL[card.rank] : SUIT_SYMBOL[card.suit]}
      </span>
    </button>
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

function EmptySlot({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Empty pile"
      className="grid h-[var(--cr-card-h)] w-[var(--cr-card-w)] place-items-center rounded-md border border-dashed border-gold/30 text-gold/30"
    />
  );
}

function TableauPile({
  pile,
  index,
  selection,
  draggingIds,
  flyingIds,
  shuffleTick,
  shuffleOld,
  shuffleRevealed,
  style,
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  pile: Card[];
  index: number;
  selection: Selection;
  draggingIds?: Set<string> | null;
  flyingIds: Set<string>;
  shuffleTick: number;
  shuffleOld: Card[][] | null;
  shuffleRevealed: number;
  style: { left: string; top: string };
  onClick: () => void;
  onDoubleClick: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}) {
  // Keep showing the pre-shuffle cards until this pile's own hop plays, then
  // swap in the newly shuffled cards.
  const shown = shuffleOld && index >= shuffleRevealed ? (shuffleOld[index] ?? pile) : pile;
  return (
    <div
      className="absolute flex flex-col items-center"
      data-drop="tableau"
      data-index={index}
      style={{
        left: style.left,
        top: style.top,
        transform: "translate(-50%, -50%)",
        animation: `cr-deal 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${Math.abs(index - 7.5) * 28}ms backwards`,
      }}
    >
      <div
        key={shuffleTick}
        className="flex flex-col items-stretch"
        style={
          shuffleTick > 0
            ? {
                animation: `cr-shuffle ${SHUFFLE_MS}ms ease ${index * SHUFFLE_STAGGER_MS}ms backwards`,
              }
            : undefined
        }
      >
        {shown.map((card, i) => {
          const isSelected =
            selection?.type === "tableau" && selection.index === index && i === shown.length - 1;
          return (
            <div
              key={card.id}
              style={{ marginTop: i === 0 ? 0 : "calc(var(--cr-visible) - var(--cr-card-h))" }}
            >
              <CardFace
                card={card}
                selected={isSelected}
                hidden={(draggingIds?.has(card.id) ?? false) || flyingIds.has(card.id)}
                onClick={onClick}
                onDoubleClick={onDoubleClick}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            </div>
          );
        })}
      </div>
      {shown.length === 0 && <EmptySlot onClick={onClick} />}
    </div>
  );
}

function FoundationPile({
  pile,
  index,
  selection,
  draggingIds,
  flyingIds,
  style,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  pile: Card[];
  index: number;
  selection: Selection;
  draggingIds?: Set<string> | null;
  flyingIds: Set<string>;
  style: { left: string; top: string };
  onClick: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}) {
  // A card flying IN is already present in `pile` but stays hidden while its
  // flight overlay crosses the board. Skip it so the foundation keeps showing
  // the card it is about to land on, rather than vanishing until the overlay
  // arrives to cover it.
  let topIndex = pile.length - 1;
  while (topIndex >= 0 && flyingIds.has(pile[topIndex]!.id)) topIndex -= 1;
  const top = topIndex >= 0 ? pile[topIndex] : undefined;
  const isSelected = selection?.type === "foundation" && selection.index === index;
  return (
    <div
      className="absolute flex flex-col items-center"
      data-drop="foundation"
      data-index={index}
      style={{
        left: style.left,
        top: style.top,
        transform: "translate(-50%, -50%)",
        animation: `cr-deal 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${40 + (index % 4) * 28}ms backwards`,
      }}
    >
      {top ? (
        <CardFace
          card={top}
          selected={isSelected}
          hidden={(draggingIds?.has(top.id) ?? false) || flyingIds.has(top.id)}
          onClick={onClick}
          {...(pile.length > 1 ? { onPointerDown } : {})}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      ) : (
        <EmptySlot onClick={onClick} />
      )}
    </div>
  );
}
