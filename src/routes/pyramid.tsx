import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import {
  ROWS,
  cardsRemaining,
  drawFromStock,
  freshGame,
  hasAvailableMove,
  isOpen,
  matchCovering,
  matchPyramidCards,
  matchWasteToPyramid,
  moveKingToFoundation,
  moveWasteKingToFoundation,
  resetStock,
  type GameState,
} from "@/lib/pyramid";
import { mulberry32 } from "@/lib/random";
import cardBackAsset from "@/assets/card-back.png";

export const Route = createFileRoute("/pyramid")({
  validateSearch: (search: Record<string, unknown>) => ({}),
  head: () => ({
    meta: [
      { title: "Play Pyramid Solitaire — Cards and Games" },
      {
        name: "description",
        content:
          "Pyramid solitaire in the parlour: pair cards that add to thirteen and clear the pyramid.",
      },
      { property: "og:title", content: "Play Pyramid Solitaire — Cards and Games" },
      {
        property: "og:description",
        content: "Twenty-eight cards in a pyramid, one simple sum of thirteen — clear them all.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PyramidTable,
});

// A fixed seed so the server and the first client render deal the same layout.
const SSR_SEED = 20261008;

const RECORDS_KEY = "pyramid-records";

type BestRecord = { moves: number | null; seconds: number | null };

type Flyer = { key: number; card: Card; from: DOMRect; to: DOMRect };

function loadRecords(): BestRecord {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return { moves: null, seconds: null };
    const parsed = JSON.parse(raw) as Partial<BestRecord>;
    return {
      moves: Number.isFinite(parsed.moves) ? (parsed.moves as number) : null,
      seconds: Number.isFinite(parsed.seconds) ? (parsed.seconds as number) : null,
    };
  } catch {
    return { moves: null, seconds: null };
  }
}

const isRed = (suit: Card["suit"]) => suit === "H" || suit === "D";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

// The board's footprint: the base row is seven cards wide and the apex is one.
// Each row is offset half a card to the right of the row below, so the pyramid
// sits symmetrically around the apex.
const PYRAMID_WIDTH = "calc(6 * var(--pyramid-step-x) + var(--pyramid-card-w))";
const PYRAMID_HEIGHT = "calc(6 * var(--pyramid-step-y) + var(--pyramid-card-h))";

// Horizontal position of a card, in column steps, centred over the base row.
function slotX(row: number, col: number): number {
  return col + (ROWS - 1 - row) / 2;
}

function slotStyle(row: number, col: number): CSSProperties {
  return {
    left: `calc(${slotX(row, col)} * var(--pyramid-step-x))`,
    top: `calc(${row} * var(--pyramid-step-y))`,
    // Each lower row sits in front of the row above it, so the base overlaps
    // upward and the apex stays behind everything.
    zIndex: row + 1,
  };
}

function CardFace({
  card,
  dimmed,
  hidden,
  selected,
  dataCard,
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  card: Card;
  dimmed?: boolean;
  hidden?: boolean;
  selected?: boolean;
  dataCard?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
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
      data-card={dataCard}
      data-card-id={card.id}
      aria-label={cardLabel(card)}
      className={`relative block h-[var(--pyramid-card-h)] w-[var(--pyramid-card-w)] touch-none select-none overflow-hidden rounded-lg border border-black/10 bg-white text-left shadow-md shadow-black/30 transition-transform ${
        red ? "text-destructive" : "text-ink"
      } ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:ring-1 hover:ring-gold" : "cursor-default"} ${
        dimmed ? "saturate-50" : ""
      } ${selected ? "ring-2 ring-gold" : ""} ${hidden ? "invisible" : ""}`}
    >
      <span className="absolute left-1 top-0.5 flex flex-col items-center font-display text-[15px] font-bold leading-none sm:text-[23px]">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-[14px] sm:text-[18px]">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span
        aria-hidden
        className={`absolute inset-0 grid place-items-center font-display text-[26px] sm:text-[38px] ${
          isFace ? "opacity-90" : "opacity-80"
        }`}
      >
        {isFace ? (
          <span className="flex flex-col items-center leading-none">
            <span className="text-[17px] sm:text-[24px]">{RANK_LABEL[card.rank]}</span>
            <span className="text-[21px] sm:text-[30px]">{SUIT_SYMBOL[card.suit]}</span>
          </span>
        ) : (
          SUIT_SYMBOL[card.suit]
        )}
      </span>
      <span className="absolute bottom-0.5 right-1 flex rotate-180 flex-col items-center font-display text-[15px] font-bold leading-none sm:text-[23px]">
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        <span className="text-[14px] sm:text-[18px]">{SUIT_SYMBOL[card.suit]}</span>
      </span>
    </button>
  );
}

function CardBack() {
  return (
    <div
      aria-label="Face-down card"
      className="relative block h-[var(--pyramid-card-h)] w-[var(--pyramid-card-w)] overflow-hidden rounded-lg shadow-md shadow-black/30"
    >
      <img src={cardBackAsset} alt="" aria-hidden className="h-full w-full object-cover" />
    </div>
  );
}

function FlyingCard({
  card,
  from,
  to,
  onDone,
}: {
  card: Card;
  from: DOMRect;
  to: DOMRect;
  onDone: () => void;
}) {
  const [started, setStarted] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const id = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    if (!started) return;
    const t = window.setTimeout(() => onDoneRef.current(), 440);
    return () => window.clearTimeout(t);
  }, [started]);
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  return (
    <div
      className="pointer-events-none fixed z-[70]"
      style={{
        left: from.left,
        top: from.top,
        width: "var(--pyramid-card-w)",
        height: "var(--pyramid-card-h)",
        transform: started ? `translate(${dx}px, ${dy}px)` : "translate(0px, 0px)",
        transition: "transform 420ms cubic-bezier(0.22, 0.9, 0.32, 1)",
      }}
    >
      <CardFace card={card} />
    </div>
  );
}

function EmptySlot({ black }: { black?: boolean }) {
  return (
    <div
      className={`grid h-[var(--pyramid-card-h)] w-[var(--pyramid-card-w)] place-items-center rounded-md border border-dashed ${
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
  selected,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  waste: Card[];
  selected: boolean;
  onClick: () => void;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
}) {
  const top = waste[waste.length - 1];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {waste.length > 1 && (
          <div className="absolute -left-1 -top-1 opacity-40">
            <CardBack />
          </div>
        )}
        {top ? (
          <CardFace
            card={top}
            selected={selected}
            dataCard="waste"
            onClick={onClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        ) : (
          <EmptySlot black />
        )}
      </div>
      <span className="text-[10px] uppercase tracking-[0.18em] text-black">Waste</span>
    </div>
  );
}

function FoundationPile({
  cards,
  pillRef,
}: {
  cards: Card[];
  pillRef?: RefObject<HTMLDivElement | null>;
}) {
  const top = cards[cards.length - 1];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" ref={pillRef} data-card="foundation">
        {cards.length > 1 && (
          <div className="absolute -left-1 -top-1 opacity-40">
            <CardBack />
          </div>
        )}
        {top ? (
          <CardFace card={top} />
        ) : (
          <EmptySlot black />
        )}
        {cards.length > 1 && (
          <span className="absolute -bottom-1 -right-1 z-10 grid size-4 place-items-center rounded-full bg-brand text-[9px] font-bold text-cream ring-1 ring-gold/50">
            {cards.length}
          </span>
        )}
      </div>
      <span className="text-[10px] uppercase tracking-[0.18em] text-black">Foundation</span>
    </div>
  );
}

type Selection = { source: "waste" } | { source: "pyramid"; r: number; c: number } | null;

function PyramidTable() {
  const navigate = useNavigate();
  const game = getGame("pyramid");
  const [state, setState] = useState<GameState>(() => freshGame(mulberry32(SSR_SEED)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<Selection>(null);
  const [records, setRecords] = useState<BestRecord>({ moves: null, seconds: null });
  const [recordMessage, setRecordMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"new" | "home" | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const { recordResult } = useSolitaireStats(game.id);
  const { end, beginNew, recordAction } = useGameStarted(game.name);
  const [conceded, setConceded] = useState(false);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const flyerSeq = useRef(0);
  const foundationRef = useRef<HTMLDivElement>(null);
  const removeFlyer = useCallback((key: number) => {
    setFlyers((f) => f.filter((x) => x.key !== key));
  }, []);

  // Timer bookkeeping (declared before the win/loss effects that read `elapsed`).
  const [elapsed, setElapsed] = useState(0);
  const [finishedElapsed, setFinishedElapsed] = useState<number | null>(null);
  const startRef = useRef(0);
  const endedRef = useRef(false);

  const prevWonRef = useRef(false);
  useEffect(() => {
    if (state.won && !prevWonRef.current) {
      recordResult("win");
      end("won");
      setFinishedElapsed(elapsed);
    }
    prevWonRef.current = state.won;
  }, [state.won, recordResult, end, elapsed]);
  const prevLostRef = useRef(false);
  useEffect(() => {
    if (state.lost && !prevLostRef.current) {
      recordResult("loss");
      end("lost");
      setFinishedElapsed(elapsed);
    }
    prevLostRef.current = state.lost;
  }, [state.lost, recordResult, end, elapsed]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const recordsRef = useRef(records);
  recordsRef.current = records;

  useEffect(() => {
    setState(freshGame(mulberry32(SSR_SEED)));
    setHistory([]);
    setSelected(null);
    setConceded(false);
    setRecordMessage(null);
    setFinishedElapsed(null);
    setElapsed(0);
    setResultOpen(false);
    startRef.current = 0;
    endedRef.current = false;
    setRecords(loadRecords());

    const id = window.setInterval(() => {
      if (!endedRef.current && startRef.current !== 0)
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // Start the clock on the first move rather than when the table is dealt.
  useEffect(() => {
    if (startRef.current === 0 && state.moves > 0) startRef.current = Date.now();
  }, [state.moves]);

  useEffect(() => {
    endedRef.current = state.won || state.lost;
  }, [state.won, state.lost]);

  const shownElapsed = finishedElapsed ?? elapsed;

  const apply = (candidate: GameState) => {
    const cur = stateRef.current;
    if (candidate === cur) return;
    // Cards that just landed on the foundation fly there from their source slot.
    const gained = candidate.foundation.slice(cur.foundation.length);
    if (gained.length > 0 && foundationRef.current) {
      const to = foundationRef.current.getBoundingClientRect();
      setFlyers((f) => [
        ...f,
        ...gained.map((card) => {
          const from =
            document.querySelector(`[data-card-id="${card.id}"]`)?.getBoundingClientRect() ?? to;
          return { key: ++flyerSeq.current, card, from, to };
        }),
      ]);
    }
    recordAction("table action");
    setHistory((h) => [...h, cur]);
    setState(candidate);
    if (candidate.won || candidate.lost) {
      setRecordMessage(evaluateResult(candidate));
      setResultOpen(true);
    }
  };

  const evaluateResult = (s: GameState): string => {
    const prev = recordsRef.current;
    const secs = startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0;
    if (s.won) {
      const next: BestRecord = {
        moves: prev.moves === null ? s.moves : Math.min(prev.moves, s.moves),
        seconds: prev.seconds === null ? secs : Math.min(prev.seconds, secs),
      };
      recordsRef.current = next;
      setRecords(next);
      try {
        localStorage.setItem(RECORDS_KEY, JSON.stringify(next));
      } catch {
        // local storage unavailable; ignore
      }
      if (prev.moves === null) return `First win — ${s.moves} moves!`;
      if (s.moves < prev.moves) return `New best — ${s.moves} moves (was ${prev.moves}).`;
      return `Won in ${s.moves} moves — your best is ${prev.moves}.`;
    }
    return `Stuck with ${cardsRemaining(s)} cards left — undo or deal again.`;
  };

  const newGame = () => {
    setState(freshGame());
    setHistory([]);
    setSelected(null);
    setConceded(false);
    setRecordMessage(null);
    setFinishedElapsed(null);
    setElapsed(0);
    setResultOpen(false);
    startRef.current = 0;
    endedRef.current = false;
    recordAction("new game");
    beginNew();
  };

  const concede = () => {
    if (state.won || state.lost || conceded) return;
    recordResult("loss");
    recordAction("concede");
    end("conceded");
    setConceded(true);
  };

  const undo = () => {
    if (history.length === 0 || state.won || conceded) return;
    recordAction("undo");
    const prev = history[history.length - 1]!;
    // Each undo counts as a move.
    setState({ ...prev, moves: prev.moves + 1 });
    setHistory(history.slice(0, -1));
    setSelected(null);
    setRecordMessage(null);
  };

  const clickStock = () => {
    const cur = stateRef.current;
    if (cur.stock.length === 0) {
      const next = resetStock(cur);
      if (next !== cur) apply(next);
      return;
    }
    const next = drawFromStock(cur);
    if (next !== cur) apply(next);
  };

  const clickWaste = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const top = stateRef.current.waste[stateRef.current.waste.length - 1];
    if (!top) return;
    if (top.rank === 13) {
      const next = moveWasteKingToFoundation(stateRef.current);
      if (next !== stateRef.current) {
        setSelected(null);
        apply(next);
      }
      return;
    }
    setSelected((cur) => (cur && cur.source === "waste" ? null : { source: "waste" }));
  };

  const clickPyramid = (r: number, c: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const cur = stateRef.current;
    const card = cur.pyramid[r]?.[c];
    if (!card || !isOpen(cur.pyramid, r, c)) return;
    if (card.rank === 13) {
      const next = moveKingToFoundation(cur, r, c);
      if (next !== cur) {
        setSelected(null);
        apply(next);
      }
      return;
    }
    if (!selected) {
      setSelected({ source: "pyramid", r, c });
      return;
    }
    if (selected.source === "waste") {
      const next = matchWasteToPyramid(cur, r, c);
      if (next !== cur) {
        setSelected(null);
        apply(next);
      } else {
        setSelected({ source: "pyramid", r, c });
      }
      return;
    }
    if (selected.r === r && selected.c === c) {
      // Second click on the same card: try pairing it with the card it covers.
      const next = matchCovering(cur, r, c);
      if (next !== cur) {
        setSelected(null);
        apply(next);
      } else {
        setSelected(null);
      }
      return;
    }
    const next = matchPyramidCards(cur, selected.r, selected.c, r, c);
    if (next !== cur) {
      setSelected(null);
      apply(next);
    } else {
      setSelected({ source: "pyramid", r, c });
    }
  };

  // --- Drag-and-drop (pointer-based, so it also works with touch) ---
  const dragRef = useRef<{
    source: { kind: "waste" } | { kind: "pyramid"; r: number; c: number };
    card: Card;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragGhost, setDragGhost] = useState<{ card: Card; x: number; y: number } | null>(null);
  const draggingIds = dragGhost ? new Set([dragGhost.card.id]) : null;

  const beginDragPyramid = (r: number, c: number, card: Card) => (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      source: { kind: "pyramid", r, c },
      card,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    setDragGhost({ card, x: e.clientX, y: e.clientY });
  };

  const beginDragWaste = (card: Card) => (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      source: { kind: "waste" },
      card,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    setDragGhost({ card, x: e.clientX, y: e.clientY });
  };

  const moveDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8)
      drag.moved = true;
    setDragGhost({ card: drag.card, x: e.clientX, y: e.clientY });
  };

  const endDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragGhost(null);
    if (!drag.moved) return; // it was a tap — let onClick handle it
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-card]");
    if (!targetEl) return;
    const dataCard = targetEl.getAttribute("data-card");
    const cur = stateRef.current;
    if (dataCard === "foundation") {
      if (drag.card.rank !== 13) return;
      const next =
        drag.source.kind === "waste"
          ? moveWasteKingToFoundation(cur)
          : moveKingToFoundation(cur, drag.source.r, drag.source.c);
      if (next !== cur) {
        setSelected(null);
        apply(next);
      }
      return;
    }
    if (!dataCard || !dataCard.startsWith("pyramid:")) return;
    const [, rs, cs] = dataCard.split(":");
    const r = Number(rs);
    const c = Number(cs);
    const next =
      drag.source.kind === "waste"
        ? matchWasteToPyramid(cur, r, c)
        : matchPyramidCards(cur, drag.source.r, drag.source.c, r, c);
    if (next !== cur) {
      setSelected(null);
      apply(next);
    }
  };

  const gameInProgress = state.moves > 0 && !state.won && !conceded;
  const confirmReset = () => (gameInProgress ? setConfirming("new") : newGame());
  const confirmHome = () => {
    if (gameInProgress) {
      setConfirming("home");
    } else {
      recordAction("home");
      void navigate({ to: "/" });
    }
  };

  const hint = state.won
    ? "You cleared the pyramid!"
    : state.lost
      ? "No more moves — undo or deal again."
      : selected
        ? "Now pick the card that adds to thirteen."
        : "Click a card, then another that adds to thirteen — or click a king to send it home.";

  const wasteTop = state.waste[state.waste.length - 1];

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
              <h1 className="font-display text-2xl font-bold leading-tight">Pyramid</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={confirmHome}
              className="cursor-pointer bg-transparent text-xs uppercase tracking-[0.2em] text-white transition-colors hover:text-gold"
            >
              ← RETURN TO GAME ROOM
            </button>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_260px]">
          <div className="select-none relative rounded-2xl border border-gold/15 bg-[#4c9a2a] p-4 text-black sm:p-6">
            <div className="flex items-start justify-center gap-8">
              <StockPile
                count={state.stock.length}
                disabled={state.won || state.lost}
                onClick={clickStock}
              />
              <WastePile
                waste={state.waste}
                selected={selected?.source === "waste"}
                onClick={clickWaste}
                onPointerDown={wasteTop ? beginDragWaste(wasteTop) : undefined}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
              />
              <FoundationPile cards={state.foundation} pillRef={foundationRef} />
            </div>

            <div className="mt-6 flex justify-center">
              <div className="relative" style={{ width: PYRAMID_WIDTH, height: PYRAMID_HEIGHT }}>
                {state.pyramid.map((rowSlots, row) =>
                  rowSlots.map((slot, col) => {
                    if (!slot) return null;
                    const open = isOpen(state.pyramid, row, col);
                    const isSel =
                      selected?.source === "pyramid" && selected.r === row && selected.c === col;
                    return (
                      <div
                        key={`${row}-${col}`}
                        className="absolute"
                        style={slotStyle(row, col)}
                      >
                        <CardFace
                          card={slot}
                          dimmed={!open}
                          selected={isSel}
                          dataCard={`pyramid:${row}:${col}`}
                          hidden={draggingIds?.has(slot.id)}
                          {...(open
                            ? {
                                onClick: () => clickPyramid(row, col),
                                onPointerDown: beginDragPyramid(row, col, slot),
                                onPointerMove: moveDrag,
                                onPointerUp: endDrag,
                              }
                            : {})}
                        />
                      </div>
                    );
                  }),
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <span className="text-xs tabular-nums text-black/80">
                {state.moves} moves · {formatElapsed(shownElapsed)}
              </span>
              <Button
                variant="parlorGhost"
                className="border-black bg-black text-white hover:bg-black/80"
                onClick={undo}
                disabled={history.length === 0 || state.won || conceded}
              >
                Undo
              </Button>
              {state.stock.length === 0 && state.waste.length > 0 && (
                <Button
                  variant="parlorGhost"
                  className="border-black bg-black text-white hover:bg-black/80"
                  onClick={clickStock}
                  disabled={state.won || state.lost}
                >
                  Reset stock
                </Button>
              )}
            </div>

            {conceded && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-brand/80 p-6 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <div className="text-5xl">🏳️</div>
                  <h2 className="font-display text-3xl font-bold text-red-300">You conceded</h2>
                  <p className="mx-auto max-w-sm text-ivory/70">This game is recorded as a loss.</p>
                  <Button variant="parlor" onClick={newGame}>
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
                <FavouriteSwitch gameId="pyramid" />
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
                if (confirming === "home") {
                  recordAction("home");
                  void navigate({ to: "/" });
                } else if (confirming === "new") newGame();
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
              {state.won ? "You cleared the pyramid!" : "No more moves"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/65">
              {recordMessage ??
                (state.won
                  ? `Won in ${state.moves} moves.`
                  : "No cards add to thirteen and the stock is empty.")}
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
                newGame();
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
            left: `calc(${dragGhost.x}px - var(--pyramid-card-w) / 2)`,
            top: `calc(${dragGhost.y}px - var(--pyramid-card-h) / 2)`,
          }}
        >
          <CardFace card={dragGhost.card} />
        </div>
      )}

      {flyers.map((flyer) => (
        <FlyingCard
          key={flyer.key}
          card={flyer.card}
          from={flyer.from}
          to={flyer.to}
          onDone={() => removeFlyer(flyer.key)}
        />
      ))}
    </div>
  );
}

