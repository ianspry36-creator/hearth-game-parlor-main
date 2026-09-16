import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TableShell } from "@/components/parlor/TableShell";
import { CribBoard, ScoreGrid } from "@/components/parlor/CribBoard";
import { CribBoardOptionsDialog } from "@/components/parlor/CribBoardOptionsDialog";
import { getGame } from "@/lib/games";
import { getNickname, useMatch } from "@/lib/multiplayer";
import { useRecordMatchResult } from "@/lib/stats";
import {
  cardLabel,
  RANK_LABEL,
  SUIT_SYMBOL,
  canPlay,
  choosePeggingCard,
  chooseDiscards,
  freshDeck,
  peggingCount,
  scoreHand,
  scorePegging,
  totalPoints,
  type Card,
  type ScoreLine,
} from "@/lib/cribbage";
import cardBackAsset from "@/assets/card-back.png";
import skunk from "@/assets/skunk.png";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { AVATAR_OPTIONS, ADA_AVATAR, ADA_HAPPY, ADA_SAD, readAvatar } from "@/lib/avatars";
import { readCribBoardGraphic } from "@/lib/cribbageBoards";

export const Route = createFileRoute("/cribbage")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Play Cribbage — Cards and Games" },
      {
        name: "description",
        content:
          "Play a full game of cribbage to 121 against Ada or a live human opponent: discard to the crib, peg the play, and score the show.",
      },
      { property: "og:title", content: "Play Cribbage — Cards and Games" },
      {
        property: "og:description",
        content: "Cribbage against Ada or a live opponent, with pegging, the crib, and the show.",
      },
    ],
  }),
  component: CribbageTable,
});

type Side = "player" | "cpu";
const other = (s: Side): Side => (s === "player" ? "cpu" : "player");
const WIN = 121;

type LogEntry = { side: Side | null; text: string };
type ShowBlock = { side: Side; kind: "hand" | "crib"; lines: ScoreLine[]; total: number };

type State = {
  phase: "cut" | "discard" | "play" | "between" | "pause" | "show" | "over";
  dealer: Side;
  scores: Record<Side, number>;
  /** Show points that land on the board only once the dialog is dismissed. */
  pendingScores: Record<Side, number> | null;
  playerHand: Card[];
  cpuHand: Card[];
  playerKept: Card[];
  cpuKept: Card[];
  playerDiscards: Card[] | null;
  cpuDiscards: Card[] | null;
  crib: Card[];
  starter: Card | null;
  deck: Card[];
  pile: Card[];
  turn: Side;
  log: LogEntry[];
  show: ShowBlock[];
  /** Which seats have dismissed their "show" dialog and are ready for the next hand. */
  showReady: { player: boolean; cpu: boolean };
  winner: Side | null;
  /** Cut-for-deal: the spread deck plus each side's drawn card. */
  cutFan: Card[];
  playerCut: Card | null;
  cpuCut: Card | null;
  /** Points just pegged in the play, shown as a bubble over the pile. */
  lastPeg: { side: Side; points: number; label: string } | null;
};

type FlyingCard = {
  key: number;
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
  fromScale?: number;
  toScale?: number;
  faceDown?: boolean;
};

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);

const SUIT_ORDER: Record<Card["suit"], number> = { S: 0, H: 1, D: 2, C: 3 };
/** Cribbage hands read best sorted low to high, grouped by suit. */
const sortHand = (cards: Card[]) =>
  [...cards].sort((a, b) => a.rank - b.rank || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]);

function dealHand(dealer: Side, scores: Record<Side, number>, log: LogEntry[]): State {
  const deck = freshDeck();
  return {
    phase: "discard",
    dealer,
    scores,
    pendingScores: null,
    // Cards arrive in the order they were dealt; the table sorts them afterwards.
    playerHand: deck.slice(0, 6),
    cpuHand: deck.slice(6, 12),
    playerKept: [],
    cpuKept: [],
    playerDiscards: null,
    cpuDiscards: null,
    crib: [],
    starter: null,
    deck: deck.slice(12),
    pile: [],
    turn: other(dealer),
    log: note(log, { side: dealer, text: "dealt — discard two to the crib." }),
    show: [],
    showReady: { player: false, cpu: false },
    winner: null,
    cutFan: [],
    playerCut: null,
    cpuCut: null,
    lastPeg: null,
  };
}

/** Spread the deck so both sides can cut for the first deal. */
function cutForDeal(
  scores: Record<Side, number> = { player: 0, cpu: 0 },
  log: LogEntry[] = [],
): State {
  return {
    ...dealHand("cpu", scores, log),
    phase: "cut",
    playerHand: [],
    cpuHand: [],
    deck: [],
    cutFan: freshDeck(),
    playerCut: null,
    cpuCut: null,
    log: note(log, { side: null, text: "Cut the deck — the high card plays first." }),
  };
}

/** Swap the two seats so a guest device can read the host's canonical state. */
function mirror(s: State): State {
  return {
    ...s,
    dealer: other(s.dealer),
    turn: other(s.turn),
    winner: s.winner ? other(s.winner) : null,
    scores: { player: s.scores.cpu, cpu: s.scores.player },
    pendingScores: s.pendingScores
      ? { player: s.pendingScores.cpu, cpu: s.pendingScores.player }
      : null,
    playerHand: s.cpuHand,
    cpuHand: s.playerHand,
    playerKept: s.cpuKept,
    cpuKept: s.playerKept,
    playerDiscards: s.cpuDiscards,
    cpuDiscards: s.playerDiscards,
    playerCut: s.cpuCut,
    cpuCut: s.playerCut,
    lastPeg: s.lastPeg ? { ...s.lastPeg, side: other(s.lastPeg.side) } : null,

    log: s.log.map((entry) => ({ ...entry, side: entry.side ? other(entry.side) : null })),
    show: s.show.map((block) => ({ ...block, side: other(block.side) })),
    showReady: { player: s.showReady.cpu, cpu: s.showReady.player },
  };
}

function award(s: State, side: Side, points: number, label: string) {
  if (points <= 0) return;
  s.scores = { ...s.scores, [side]: s.scores[side] + points };
  s.log = note(s.log, { side, text: `pegged ${points} — ${label}.` });
  if (s.scores[side] >= WIN && !s.winner) {
    s.winner = side;
    s.phase = "over";
    s.log = note(s.log, { side, text: `reached ${WIN}. Game over.` });
  }
}

function runShow(s: State) {
  const nonDealer = other(s.dealer);
  const blocks: ShowBlock[] = [];
  const entries: { side: Side; kind: "hand" | "crib"; hand: Card[] }[] = [
    { side: nonDealer, kind: "hand", hand: nonDealer === "player" ? s.playerKept : s.cpuKept },
    { side: s.dealer, kind: "hand", hand: s.dealer === "player" ? s.playerKept : s.cpuKept },
    { side: s.dealer, kind: "crib", hand: s.crib },
  ];

  // Tally the show into a pending total. It only lands on the board once the
  // dialog is dismissed, so the pegs animate to their new positions then
  // rather than jumping behind the "The show" overlay.
  const scores = { ...s.scores };
  let winner = s.winner;

  for (const entry of entries) {
    if (winner) break;
    const lines = scoreHand(entry.hand, s.starter, entry.kind === "crib");
    const total = totalPoints(lines);
    blocks.push({ side: entry.side, kind: entry.kind, lines, total });
    if (total <= 0) continue;
    scores[entry.side] += total;
    s.log = note(s.log, {
      side: entry.side,
      text: `pegged ${total} — ${entry.kind === "crib" ? "the crib" : "the hand"}.`,
    });
    if (scores[entry.side] >= WIN && !winner) {
      winner = entry.side;
      s.log = note(s.log, { side: entry.side, text: `reached ${WIN}. Game over.` });
    }
  }

  s.show = blocks;
  s.pendingScores = scores;
  if (winner) {
    s.winner = winner;
    s.phase = "over";
    // Land the final tally on the board immediately so the pegs animate to it
    // and "View Board" shows the true finishing position.
    s.scores = scores;
  } else {
    s.phase = "show";
  }
}

/** Record pegged points so the table can show a score bubble over the pile. */
function addPeg(s: State, side: Side, points: number, label: string) {
  if (points <= 0) return;
  s.lastPeg =
    s.lastPeg && s.lastPeg.side === side
      ? { side, points: s.lastPeg.points + points, label: `${s.lastPeg.label} + ${label}` }
      : { side, points, label };
}

function resolveAfterPlay(s: State, lastPlayer: Side) {
  const count = peggingCount(s.pile);
  const handOf = (side: Side) => (side === "player" ? s.playerHand : s.cpuHand);
  const opp = other(lastPlayer);

  if (!handOf("player").length && !handOf("cpu").length) {
    if (count !== 31) {
      award(s, lastPlayer, 1, "last card");
      addPeg(s, lastPlayer, 1, "Last card");
    }
    if (!s.winner) s.phase = "pause";
    return;
  }

  if (count === 31) {
    s.turn = handOf(opp).length ? opp : lastPlayer;
    if (!s.winner) s.phase = "between";
    return;
  }

  if (canPlay(handOf(opp), s.pile)) {
    s.turn = opp;
    return;
  }

  if (canPlay(handOf(lastPlayer), s.pile)) {
    s.log = note(s.log, { side: opp, text: "said go." });
    s.turn = lastPlayer;
    return;
  }

  award(s, lastPlayer, 1, "go");
  addPeg(s, lastPlayer, 1, "Go");
  s.turn = handOf(opp).length ? opp : lastPlayer;
  if (!s.winner) s.phase = "between";
}

function playCard(state: State, side: Side, card: Card): State {
  const s: State = { ...state };
  const lines = scorePegging(s.pile, card);
  s.pile = [...s.pile, card];
  s.lastPeg = null;
  if (side === "player") s.playerHand = s.playerHand.filter((c) => c.id !== card.id);
  else s.cpuHand = s.cpuHand.filter((c) => c.id !== card.id);
  s.log = note(s.log, {
    side,
    text: `laid ${cardLabel(card)} — count ${peggingCount(s.pile)}.`,
  });
  for (const line of lines) {
    award(s, side, line.points, line.label.toLowerCase());
    addPeg(s, side, line.points, line.label);
  }
  if (!s.winner) resolveAfterPlay(s, side);
  return s;
}

/** Cut the starter and open the play once both players have discarded. */
function startPlay(current: State): State {
  const s: State = { ...current };
  s.crib = [...(s.playerDiscards ?? []), ...(s.cpuDiscards ?? [])];
  s.playerHand = [...s.playerKept];
  s.cpuHand = [...s.cpuKept];
  s.starter = s.deck[0] ?? null;
  s.deck = s.deck.slice(1);
  s.pile = [];
  s.phase = "play";
  s.turn = other(s.dealer);
  s.log = note(s.log, {
    side: null,
    text: `Starter cut: ${s.starter ? cardLabel(s.starter) : "—"}.`,
  });
  if (s.starter?.rank === 11) award(s, s.dealer, 2, "his heels");
  return s;
}

function GameOverDialog({
  open,
  winner,
  scores,
  playerAvatar,
  opponentName,
  playerName,
  onPlayAgain,
  onViewBoard,
  onBackToGameRoom,
  playAgainLabel = "Play again",
}: {
  open: boolean;
  winner: Side;
  scores: Record<Side, number>;
  playerAvatar: string;
  opponentName: string;
  playerName: string;
  onPlayAgain: () => void;
  onViewBoard: () => void;
  onBackToGameRoom: () => void;
  playAgainLabel?: string;
}) {
  const loser = other(winner);
  const margin = scores[winner] - scores[loser];
  const isSkunk = margin > 30;
  const winnerName = winner === "player" ? playerName : opponentName;
  const loserName = loser === "player" ? playerName : opponentName;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="border-gold/30 bg-brand text-cream sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center font-display text-3xl">
            {winner === "player" ? `${playerName} won!` : `${opponentName} won!`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-ivory/70">
            {isSkunk
              ? `A skunk! ${loserName === "You" ? "You were" : `${loserName} was`} well and truly beaten.`
              : `The game is over — here is how the table finished.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center justify-center gap-6 py-4">
          {/* Winner */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <img
                src={winner === "player" ? playerAvatar : ADA_HAPPY}
                alt={winnerName}
                width={96}
                height={96}
                className="size-24 rounded-full border-2 border-gold object-cover shadow-lg shadow-black/30"
              />
              <span className="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full bg-gold text-sm text-brand shadow-md">
                🏆
              </span>
            </div>
            <p className="font-display text-lg text-gold">{winnerName}</p>
            <p className="text-2xl font-bold">{scores[winner]}</p>
            <p className="text-xs text-ivory/70">Congratulations!</p>
          </div>

          <div className="font-display text-2xl text-ivory/40">vs</div>

          {/* Loser */}
          <div className="relative flex flex-col items-center gap-2">
            {isSkunk ? (
              <img
                src={skunk}
                alt="Skunk"
                width={96}
                height={96}
                className="pointer-events-none absolute -top-2 left-1/2 z-10 size-24 -translate-x-1/2 animate-bounce"
              />
            ) : null}
            <img
              src={loser === "player" ? playerAvatar : ADA_SAD}
              alt={loserName}
              width={96}
              height={96}
              className={`size-24 rounded-full border-2 border-ivory/40 object-cover shadow-lg shadow-black/30 ${
                loser === "player" ? "grayscale brightness-90" : ""
              }`}
            />
            <p className="font-display text-lg text-ivory/80">{loserName}</p>
            <p className="text-2xl font-bold">{scores[loser]}</p>
            <p className="text-xs text-ivory/70">Commiserations.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="parlorOutline" onClick={onViewBoard}>
            View Board
          </Button>
          <Button variant="parlorOutline" onClick={onBackToGameRoom}>
            Back to game room
          </Button>
          <AlertDialogAction asChild>
            <Button variant="parlor" onClick={onPlayAgain}>
              {playAgainLabel}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CribbageTable() {
  const game = getGame("cribbage");
  const navigate = useNavigate();
  const { opponent, match: matchId } = Route.useSearch();
  const {
    match,
    isHost,
    opponentName: liveOpponent,
    opponentAvatar,
    remoteState,
    publish,
    opponentDisconnected,
    disconnectSecondsLeft,
    disconnectExpired,
  } = useMatch<State>(matchId);
  const isMulti = Boolean(matchId);
  const freshGame = () => cutForDeal();
  const [state, setState] = useState<State>(() => cutForDeal());
  const [selected, setSelected] = useState<string[]>([]);
  const [back, setBack] = useState<Record<Side, number>>({ player: 0, cpu: 0 });
  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]!.url);
  const [boardGraphic, setBoardGraphic] = useState<string>(readCribBoardGraphic);
  const [viewingBoard, setViewingBoard] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  useEffect(() => setAvatar(readAvatar()), []);
  // Cards land face down, then turn over one at a time.
  const [faceUpCount, setFaceUpCount] = useState(6);
  const [sorting, setSorting] = useState(false);
  // Cut ceremony: my card flips and floats to my seat, then Ada's follows.
  const [cutStage, setCutStage] = useState<
    "idle" | "flipMine" | "seatMine" | "flipTheirs" | "seated"
  >("idle");
  // Which cut cards have finished flying and are now resting at their seats.
  const [cutSeated, setCutSeated] = useState<{ player: boolean; cpu: boolean }>({
    player: false,
    cpu: false,
  });

  // Which seat laid the newest card on the pile, so it animates from that side.
  const [laidBy, setLaidBy] = useState<Side | null>(null);
  const pendingLay = useRef<Side | null>(null);
  const pileLength = useRef(state.pile.length);
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  /** Card currently in flight from the hand to the pile (hidden in hand until it lands). */
  const [layingId, setLayingId] = useState<string | null>(null);
  /** Cards in flight from a hand to the crib (hidden in hand until they land). */
  const [discardingIds, setDiscardingIds] = useState<string[]>([]);
  const pileRef = useRef<HTMLDivElement>(null);
  const cribRef = useRef<HTMLDivElement>(null);
  const handEls = useRef(new Map<string, HTMLButtonElement>());
  const cpuHandEls = useRef(new Map<string, HTMLElement>());
  const fanEls = useRef(new Map<string, HTMLButtonElement>());
  const playerSeatRef = useRef<HTMLDivElement>(null);
  const cpuSeatRef = useRef<HTMLDivElement>(null);

  // Stable across the sort animation so the deal only plays once per hand.
  const handKey = [...state.playerHand.map((c) => c.id)].sort().join("-");
  const isFreshDeal = state.phase === "discard" && !state.playerDiscards;
  const prevScores = useRef(state.scores);
  const stateRef = useRef(state);
  stateRef.current = state;
  useRecordMatchResult(match, isHost, state.winner);

  const opponentName = liveOpponent ?? opponent ?? "Ada";
  const playerName = getNickname() ?? "You";

  /** Commit a move: locally always, and to the shared table in a live match. */
  const apply = (fn: (current: State) => State) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (isMulti) void publish(isHost ? next : mirror(next));
  };

  const reset = (fresh: State) => {
    stateRef.current = fresh;
    setState(fresh);
    setSelected([]);
    setBack({ player: 0, cpu: 0 });
    // Reset the peg trail too, so a fresh game doesn't leave the back peg at the old score.
    prevScores.current = fresh.scores;
    setCutSeated({ player: false, cpu: false });
    setViewingBoard(false);
    if (isMulti) void publish(isHost ? fresh : mirror(fresh));
  };

  /** Lay a card from the player's hand, animating it to the pegging pile. */
  const layPlayerCard = (card: Card) => {
    if (layingId) return;
    pendingLay.current = "player";
    const pileRect = pileRef.current?.getBoundingClientRect();
    const el = handEls.current.get(card.id);
    const rect = el?.getBoundingClientRect();
    setLayingId(card.id);
    if (pileRect && rect) {
      const flight: FlyingCard = {
        key: Date.now(),
        card,
        from: { x: rect.left, y: rect.top },
        // The pile grows left-to-right inside a fixed-width slot, each card
        // advancing 29px (53px card minus the 24px overlap). Land with the
        // card's left edge exactly on the next empty slot.
        to: {
          x: pileRect.left + state.pile.length * 29,
          y: pileRect.top,
        },
        fromScale: 58 / 64, // medium hand card (flying card base is full-size)
        toScale: 53 / 64, // small pile card
      };
      setFlying((current) => [...current, flight]);
      window.setTimeout(() => {
        setFlying((current) => current.filter((f) => f.key !== flight.key));
      }, 600);
      // Commit the card to the pile only once the flight has landed, so it
      // doesn't show up at the pile before the animation completes.
      window.setTimeout(() => {
        apply((current) => playCard(current, "player", card));
        setLayingId(null);
      }, 500);
      return;
    }
    apply((current) => playCard(current, "player", card));
    setLayingId(null);
  };

  /** Fly a cut card from the spread deck to its seat during the cut for deal. */
  const flyCutCard = (card: Card, side: Side) => {
    const fan = fanEls.current.get(card.id);
    const seat = side === "player" ? playerSeatRef.current : cpuSeatRef.current;
    if (!fan || !seat) return;
    const fanRect = fan.getBoundingClientRect();
    const seatRect = seat.getBoundingClientRect();
    const flight: FlyingCard = {
      key: Date.now(),
      card,
      from: { x: fanRect.left, y: fanRect.top },
      to: { x: seatRect.left, y: seatRect.top },
      fromScale: 53 / 64, // w-[53px] (small) over w-16 (full)
      toScale: 53 / 64, // land at the small size so it matches the seat card
    };
    setFlying((current) => [...current, flight]);
    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== flight.key));
    }, 600);
  };

  // Cards fly in face down, turn over one at a time, then slide into sorted order.
  useEffect(() => {
    if (!isFreshDeal) {
      setFaceUpCount(6);
      setSorting(false);
      return;
    }
    setFaceUpCount(0);
    setSorting(false);
    const timers = [0, 1, 2, 3, 4, 5].map((i) =>
      setTimeout(() => setFaceUpCount((n) => Math.max(n, i + 1)), 420 + i * 260),
    );
    const sortAt = setTimeout(
      () => {
        setSorting(true);
        setState((current) => {
          const next = {
            ...current,
            playerHand: sortHand(current.playerHand),
            cpuHand: sortHand(current.cpuHand),
          };
          stateRef.current = next;
          return next;
        });
        setTimeout(() => setSorting(false), 700);
      },
      420 + 6 * 260,
    );
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(sortAt);
    };
  }, [handKey, isFreshDeal]);

  /** Cut for the first deal: the high card plays first, so the other seat deals. */
  const cutDeck = (card: Card) => {
    if (state.playerCut) return;
    // In a live match, never cut a card the opponent already took.
    if (isMulti && state.cpuCut?.id === card.id) return;
    setCutStage("flipMine");
    apply((current) => {
      // Against a live opponent there is no auto-cut: wait for their card to
      // arrive through the shared state instead of drawing one locally.
      if (isMulti) {
        const next: State = { ...current, playerCut: card };
        next.log = note(next.log, {
          side: null,
          text: `You cut ${cardLabel(card)} — waiting for ${opponentName} to cut…`,
        });
        return next;
      }
      const remaining = current.cutFan.filter((c) => c.id !== card.id);
      const ada = remaining[Math.floor(Math.random() * remaining.length)]!;
      const next: State = { ...current, playerCut: card, cpuCut: ada };
      next.log = note(next.log, {
        side: null,
        text: `You cut ${cardLabel(card)}, ${opponentName} cut ${cardLabel(ada)}.`,
      });
      return next;
    });
  };

  // Step the ceremony: my flip, my card flies to my seat, her flip, her card flies to hers.
  useEffect(() => {
    if (cutStage === "idle" || cutStage === "seated") return;
    // In a live match, hold at "seatMine" until the opponent's cut has landed.
    if (isMulti && cutStage === "seatMine" && !state.cpuCut) return;
    const nextStage =
      cutStage === "flipMine" ? "seatMine" : cutStage === "seatMine" ? "flipTheirs" : "seated";
    const delay = cutStage === "flipMine" ? 800 : cutStage === "seatMine" ? 1200 : 800;
    // Against a live opponent their card flies on their own device, so only my
    // own card is animated locally; the opponent's appears via the reveal effect.
    const flySide: Side | null =
      nextStage === "seatMine" ? "player" : nextStage === "seated" && !isMulti ? "cpu" : null;
    const timer = setTimeout(() => {
      if (flySide === "player" && stateRef.current.playerCut) {
        flyCutCard(stateRef.current.playerCut, "player");
      } else if (flySide === "cpu" && stateRef.current.cpuCut) {
        flyCutCard(stateRef.current.cpuCut, "cpu");
      }
      // Hide the card in the fan right away (gone), then reveal it at its seat
      // only once the flight has landed, so no copy lingers in the deck.
      setCutStage(nextStage);
      if (flySide) {
        window.setTimeout(
          () =>
            setCutSeated((s) =>
              flySide === "player" ? { ...s, player: true } : { ...s, cpu: true },
            ),
          500,
        );
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [cutStage, isMulti, state.cpuCut]);

  // Resolve the cut once both cards have reached their seats.
  useEffect(() => {
    if (state.phase !== "cut" || !state.playerCut || !state.cpuCut) return;
    if (cutStage !== "seated") return;
    // In a live match only the host resolves the cut and deals the hand; the
    // guest waits for the shared state to arrive.
    if (isMulti && !isHost) return;
    const mine = state.playerCut.rank;
    const theirs = state.cpuCut.rank;
    const timer = setTimeout(() => {
      setCutStage("idle");
      if (mine === theirs) {
        reset(cutForDeal(state.scores, state.log));
        return;
      }
      const first: Side = mine > theirs ? "player" : "cpu";
      const dealer = other(first);
      const dealt = dealHand(dealer, state.scores, state.log);
      dealt.log = note(dealt.log, { side: first, text: "cut high and play first." });
      reset(dealt);
    }, 2400);
    return () => clearTimeout(timer);
  }, [state.phase, state.playerCut, state.cpuCut, cutStage, isMulti, isHost]);

  // In a live match, reveal the opponent's cut at their seat as soon as it
  // lands, and clear it again when a fresh cut-for-deal begins.
  useEffect(() => {
    if (!isMulti) return;
    setCutSeated((s) => (state.cpuCut ? { ...s, cpu: true } : { ...s, cpu: false }));
  }, [isMulti, state.cpuCut]);

  // Reset the cut ceremony whenever a fresh cut-for-deal begins (e.g. a tie or a
  // rematch), so stale seat cards and stages don't linger between hands.
  useEffect(() => {
    if (state.phase !== "cut") return;
    if (state.playerCut || state.cpuCut) return;
    setCutStage("idle");
    setCutSeated({ player: false, cpu: false });
  }, [state.phase, state.playerCut, state.cpuCut]);

  // Note which seat laid the newest pile card so it animates in from that side.
  useEffect(() => {
    if (state.pile.length > pileLength.current) {
      setLaidBy(pendingLay.current ?? "cpu");
      pendingLay.current = null;
    } else if (state.pile.length === 0) {
      setLaidBy(null);
    }
    pileLength.current = state.pile.length;
  }, [state.pile.length]);

  // The host seeds the first deal for a fresh live table.
  useEffect(() => {
    if (!isMulti || !match || match.state || !isHost) return;
    const fresh = cutForDeal();
    stateRef.current = fresh;
    setState(fresh);
    void publish(fresh);
  }, [isMulti, match, isHost, publish]);

  // Pull the shared table into our own seat orientation.
  useEffect(() => {
    if (!isMulti || !remoteState) return;
    const view = isHost ? remoteState : mirror(remoteState);
    stateRef.current = view;
    setState(view);
  }, [isMulti, isHost, match?.version, remoteState]);

  // The host cuts the starter once both players have sent cards to the crib.
  useEffect(() => {
    if (!isMulti || !isHost) return;
    if (state.phase !== "discard" || !state.playerDiscards || !state.cpuDiscards) return;
    const timer = setTimeout(() => apply((current) => startPlay(current)), 400);
    return () => clearTimeout(timer);
  }, [isMulti, isHost, state.phase, state.playerDiscards, state.cpuDiscards]);

  useEffect(() => {
    if (
      prevScores.current.player !== state.scores.player ||
      prevScores.current.cpu !== state.scores.cpu
    ) {
      setBack(prevScores.current);
      prevScores.current = state.scores;
    }
  }, [state.scores]);

  // Ada's pegging turn (solo play only).
  useEffect(() => {
    if (isMulti) return;
    if (state.phase !== "play" || state.turn !== "cpu" || state.winner) return;
    const timer = setTimeout(() => {
      setState((current) => {
        if (current.phase !== "play" || current.turn !== "cpu") return current;
        const card = choosePeggingCard(current.cpuHand, current.pile);
        if (!card) {
          const next = { ...current };
          resolveAfterPlay(next, "player");
          stateRef.current = next;
          return next;
        }
        const next = playCard(current, "cpu", card);
        stateRef.current = next;
        return next;
      });
    }, 850);
    return () => clearTimeout(timer);
  }, [isMulti, state.phase, state.turn, state.pile.length, state.winner]);

  // Brief pause between pegging sub-plays so the score bubble stays above the last card.
  useEffect(() => {
    if (state.phase !== "between" || state.winner) return;
    const timer = setTimeout(() => {
      apply((current) => {
        const s = { ...current };
        s.pile = [];
        s.lastPeg = null;
        s.phase = "play";
        return s;
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [state.phase, state.winner]);

  // Brief pause at the end of the play before showing the hands.
  useEffect(() => {
    if (state.phase !== "pause" || state.winner) return;
    const timer = setTimeout(() => {
      apply((current) => {
        const s = { ...current };
        runShow(s);
        return s;
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [state.phase, state.winner]);

  // Deal the next hand once both seats have dismissed their "show" dialogs.
  useEffect(() => {
    if (!isMulti || !isHost) return;
    if (state.phase !== "show" || !state.showReady.player || !state.showReady.cpu) return;
    apply((current) => ({
      ...dealHand(other(current.dealer), current.pendingScores ?? current.scores, current.log),
      lastPeg: null,
    }));
  }, [isMulti, isHost, state.phase, state.showReady.player, state.showReady.cpu]);

  const confirmDiscards = () => {
    if (selected.length !== 2) return;
    // Capture the hand positions before the chosen cards leave the hand.
    const cards = state.playerHand.filter((c) => selected.includes(c.id));
    const discardIds = cards.map((c) => c.id);
    const cribRect = cribRef.current?.getBoundingClientRect();
    const flights: FlyingCard[] = [];
    if (cribRect) {
      cards.forEach((card, index) => {
        const el = handEls.current.get(card.id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        flights.push({
          key: Date.now() + index,
          card,
          from: { x: rect.left, y: rect.top },
          // Each crib card advances 22.4px (40px card less the 17.6px overlap), so
          // the pair lands side by side instead of stacked on the first slot.
          to: { x: cribRect.left + index * 22.4, y: cribRect.top },
          fromScale: 58 / 64, // medium hand card (flying card base is full-size)
          toScale: 5 / 8, // xs crib card (40px / 64px full width)
          faceDown: true,
        });
      });
    }
    // Hide the chosen cards in the hand while they fly to the crib.
    setDiscardingIds(discardIds);
    setSelected([]);
    if (flights.length) {
      setFlying((current) => [...current, ...flights]);
      window.setTimeout(() => {
        setFlying((current) => current.filter((f) => !flights.some((fl) => fl.key === f.key)));
      }, 600);
    }
    // Commit only once the flight has landed, so the cards don't show up in
    // the crib before the animation completes.
    window.setTimeout(() => {
      apply((current) => {
        const s: State = { ...current };
        s.playerDiscards = s.playerHand.filter((c) => discardIds.includes(c.id));
        s.playerKept = s.playerHand.filter((c) => !discardIds.includes(c.id));
        s.playerHand = [...s.playerKept];
        s.crib = [...s.playerDiscards];
        return s;
      });
      setDiscardingIds([]);
      // Solo: pause before the opponent sends its two cards to the crib.
      if (!isMulti) {
        window.setTimeout(cpuDiscardToCrib, 2000);
      }
    }, 500);
  };

  /** The opponent sends its two cards to the crib, then the starter is cut. */
  const cpuDiscardToCrib = () => {
    const current = stateRef.current;
    if (current.phase !== "discard" || !current.playerDiscards) return;
    const cpuDiscards = chooseDiscards(current.cpuHand);
    const cribRect = cribRef.current?.getBoundingClientRect();
    const flights: FlyingCard[] = [];
    if (cribRect) {
      const offset = current.playerDiscards.length;
      cpuDiscards.forEach((card, index) => {
        const el = cpuHandEls.current.get(card.id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        flights.push({
          key: Date.now() + index,
          card,
          from: { x: rect.left, y: rect.top },
          to: { x: cribRect.left + (offset + index) * 22.4, y: cribRect.top },
          fromScale: 53 / 64, // CPU hand shows small face-down cards
          toScale: 5 / 8,
          faceDown: true,
        });
      });
    }
    // Hide the chosen cards in the CPU hand while they fly to the crib.
    setDiscardingIds(cpuDiscards.map((c) => c.id));
    if (flights.length) {
      setFlying((current) => [...current, ...flights]);
      window.setTimeout(() => {
        setFlying((current) => current.filter((f) => !flights.some((fl) => fl.key === f.key)));
      }, 600);
    }
    // Commit only once the flight has landed, then cut the starter.
    window.setTimeout(() => {
      apply((cur) => {
        if (cur.phase !== "discard") return cur;
        const s: State = { ...cur };
        s.cpuDiscards = cpuDiscards;
        s.cpuKept = s.cpuHand.filter((c) => !cpuDiscards.some((d) => d.id === c.id));
        s.cpuHand = [...s.cpuKept];
        s.crib = [...(s.playerDiscards ?? []), ...s.cpuDiscards];
        return s;
      });
      setDiscardingIds([]);
      // Once the cards have landed, cut the starter and open the play.
      apply((cur) => (cur.phase === "discard" ? startPlay(cur) : cur));
    }, 500);
  };

  /** Dismiss my own "show" dialog; the host deals once both seats have dismissed. */
  const dismissShow = () =>
    apply((current) => {
      const ready = { ...current.showReady, player: true };
      // Solo (or a single human seat): no opponent to wait for — deal straight away.
      if (!isMulti) {
        return {
          ...dealHand(other(current.dealer), current.pendingScores ?? current.scores, current.log),
          lastPeg: null,
        };
      }
      return { ...current, showReady: ready };
    });

  const count = peggingCount(state.pile);
  const revealed = state.phase === "show" || state.phase === "over";
  const waitingForDiscard = state.phase === "discard" && Boolean(state.playerDiscards);
  const blockLabel = (block: ShowBlock) =>
    block.kind === "crib"
      ? block.side === "player"
        ? `${playerName}'s crib`
        : `${opponentName}'s crib`
      : block.side === "player"
        ? `${playerName}'s hand`
        : `${opponentName}'s hand`;
  const who = (side: Side) => (side === "player" ? playerName : opponentName);
  const turnLabel = state.winner
    ? `${who(state.winner)} won the game`
    : state.phase === "cut"
      ? "Cutting for the deal"
      : state.phase === "discard"
        ? waitingForDiscard
          ? `Waiting for ${opponentName} to discard…`
          : "Choose two cards for the crib"
        : state.phase === "between" || state.phase === "pause"
          ? "End of the play"
          : state.phase === "show"
            ? "Hands shown"
            : state.turn === "player"
              ? "Your turn to lay a card"
              : `${opponentName} is thinking…`;

  const cutMessage = !state.playerCut
    ? "Pick a card from the spread deck — the high card plays first."
    : cutStage !== "seated"
      ? `Your card is on the table — ${opponentName} is cutting…`
      : state.cpuCut && state.playerCut.rank === state.cpuCut.rank
        ? "A tie — the deck is spread again."
        : state.cpuCut && state.playerCut.rank > state.cpuCut.rank
          ? `You cut high — you play first, ${opponentName} deals.`
          : `${opponentName} cut high — ${opponentName} plays first, you deal.`;

  const message =
    isMulti && !match
      ? "Opening the shared table…"
      : state.phase === "cut"
        ? cutMessage
        : state.winner
          ? `${who(state.winner)} won the game — deal again when you're ready.`
          : state.phase === "discard"
            ? waitingForDiscard
              ? `Cards sent to the crib — waiting for ${opponentName}.`
              : "Select 2 cards to send to the crib, and then click the Send to Crib button"
            : state.phase === "between"
              ? "End of the play — clearing the board next"
              : state.phase === "pause"
                ? "End of the play — showing the hands next"
                : state.phase === "show"
                  ? "Hands are shown — check the scores, then deal the next hand"
                  : state.turn === "player"
                    ? "Your turn — lay a card on the count"
                    : `${opponentName} is thinking…`;

  const CribPile = () => (
    <div className="text-center">
      <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gold">Crib</p>
      <div
        ref={cribRef}
        className="flex w-[128px] justify-start [&>*:not(:first-child)]:-ml-[17.6px]"
      >
        {state.crib.length === 0 ? (
          <div className="grid h-[58px] w-10 place-items-center rounded-lg border border-dashed border-gold/30 text-[10px] text-ivory/40">
            empty
          </div>
        ) : revealed ? (
          state.crib.map((card) => <PlayingCard key={card.id} card={card} xs />)
        ) : (
          state.crib.map((card) => <FaceDownCard key={card.id} xs />)
        )}
      </div>
    </div>
  );

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus={turnLabel}
      opponentDisconnected={opponentDisconnected}
      disconnectSecondsLeft={disconnectSecondsLeft}
      disconnectExpired={disconnectExpired}
      gameInProgress={
        state.phase !== "over" &&
        state.phase !== "cut" &&
        (state.phase !== "discard" || state.playerDiscards !== null || state.cpuDiscards !== null)
      }
      onMatched={(nickname, newMatchId) => {
        // The host seeds the first deal for a fresh live table (see the
        // seeding effect below). Resetting to a fresh random deal here would
        // show one hand, then immediately replace it with the shared deal —
        // which reads as "dealing twice". Just navigate and let the shared
        // state arrive on its own.
        navigate({ to: "/cribbage", search: { opponent: nickname, match: newMatchId } });
      }}
      onNewGame={() => reset(freshGame())}
      menuExtra={<CribBoardOptionsDialog boardGraphic={boardGraphic} onSelect={setBoardGraphic} />}
      containerClassName="px-3 sm:px-6"
      below={
        <div className="space-y-3">
          <ScoreGrid
            playerName={playerName}
            opponentName={opponentName}
            playerAvatar={avatar}
            cpuAvatar={opponentAvatar ?? ADA_AVATAR}
            playerScore={state.scores.player}
            cpuScore={state.scores.cpu}
          />
          <Dialog open={boardOpen} onOpenChange={setBoardOpen}>
            <DialogTrigger asChild>
              <Button variant="parlor" size="sm" className="w-full">
                Show board
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto border-gold/30 bg-brand text-cream sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display text-xl">Peg board</DialogTitle>
              </DialogHeader>
              <CribBoard
                graphic={boardGraphic}
                playerScore={state.scores.player}
                cpuScore={state.scores.cpu}
                playerBack={back.player}
                cpuBack={back.cpu}
                opponentName={opponentName}
                playerName={playerName}
                playerAvatar={avatar}
                cpuAvatar={opponentAvatar ?? ADA_AVATAR}
              />
            </DialogContent>
          </Dialog>
        </div>
      }
      middle={
        <CribBoard
          graphic={boardGraphic}
          playerScore={state.scores.player}
          cpuScore={state.scores.cpu}
          playerBack={back.player}
          cpuBack={back.cpu}
          opponentName={opponentName}
          playerName={playerName}
          playerAvatar={avatar}
          cpuAvatar={opponentAvatar ?? ADA_AVATAR}
        />
      }
    >
      <GameOverDialog
        open={state.phase === "over" && state.winner !== null && !viewingBoard}
        winner={state.winner ?? "player"}
        scores={state.pendingScores ?? state.scores}
        playerAvatar={avatar}
        opponentName={opponentName}
        playerName={playerName}
        onPlayAgain={() => reset(freshGame())}
        playAgainLabel={isMulti ? "Rematch" : "Play again"}
        onViewBoard={() => setViewingBoard(true)}
        onBackToGameRoom={() => navigate({ to: "/" })}
      />
      <div className="space-y-6">
        {/* Opponent seat */}
        <div className="flex flex-wrap items-start justify-center gap-8">
          {state.dealer === "cpu" && state.phase !== "cut" ? <CribPile /> : null}
          <div className="flex flex-col items-center gap-2">
            <Seat
              name={opponentName}
              isDealer={state.dealer === "cpu"}
              avatar={
                <span className="grid size-8 place-items-center overflow-hidden rounded-full bg-gold/20 ring-1 ring-gold/40">
                  <img
                    src={opponentAvatar ?? ADA_AVATAR}
                    alt={`${opponentName}'s avatar`}
                    width={64}
                    height={64}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </span>
              }
            />
            <div className="flex justify-center [&>*:not(:first-child)]:-ml-6">
              {(revealed ? state.cpuKept : state.cpuHand).length === 0 ? (
                <p className="text-xs text-ivory/40">No cards in hand.</p>
              ) : (
                (revealed ? state.cpuKept : state.cpuHand).map((card, index) => {
                  if (!revealed && discardingIds.includes(card.id)) {
                    return (
                      <span key={card.id} className="invisible block">
                        <FaceDownCard opp />
                      </span>
                    );
                  }
                  return revealed ? (
                    <PlayingCard key={card.id} card={card} opp />
                  ) : (
                    <span
                      key={card.id}
                      ref={(el) => {
                        if (el) cpuHandEls.current.set(card.id, el);
                        else cpuHandEls.current.delete(card.id);
                      }}
                      className="animate-deal-out block"
                      style={{ animationDelay: `${index * 90}ms` }}
                    >
                      <FaceDownCard opp />
                    </span>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Centre: deck, starter, pile and count */}
        {state.phase === "cut" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap justify-center gap-6">
              <CutSeat
                label={opponentName}
                card={cutSeated.cpu ? state.cpuCut : null}
                seatRef={cpuSeatRef}
              />
              <CutSeat
                label={playerName}
                card={cutSeated.player ? state.playerCut : null}
                seatRef={playerSeatRef}
              />
            </div>
            <div className="overflow-x-auto">
              <div className="mx-auto flex w-max flex-nowrap justify-center px-2 [&>*:not(:first-child)]:-ml-[100px] sm:[&>*:not(:first-child)]:-ml-[60px]">
                {state.cutFan.map((card, index) => {
                  const isMine = state.playerCut?.id === card.id;
                  const isTheirs = state.cpuCut?.id === card.id;
                  const flipping =
                    (isMine && cutStage === "flipMine") ||
                    (isTheirs && !isMulti && cutStage === "flipTheirs");
                  const gone =
                    (isMine &&
                      (cutStage === "seatMine" ||
                        cutStage === "flipTheirs" ||
                        cutStage === "seated")) ||
                    (isTheirs && (cutStage === "seated" || isMulti));
                  return (
                    <button
                      key={card.id}
                      ref={(el) => {
                        if (el) fanEls.current.set(card.id, el);
                        else fanEls.current.delete(card.id);
                      }}
                      type="button"
                      aria-label={`Cut card ${index + 1}`}
                      disabled={Boolean(state.playerCut) || (isMulti && isTheirs)}
                      onClick={() => cutDeck(card)}
                      className={`relative transition-transform ${
                        state.playerCut
                          ? ""
                          : "hover:z-10 hover:-translate-y-2 focus-visible:z-10 focus-visible:-translate-y-2"
                      } ${
                        flipping ? "z-20 -translate-y-3" : ""
                      } ${gone ? "opacity-0" : flipping ? "" : "disabled:opacity-60"}`}
                    >
                      {flipping ? (
                        <span className="animate-turn-over block">
                          <PlayingCard card={card} small />
                        </span>
                      ) : (
                        <FaceDownCard small />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 sm:justify-center sm:gap-8">
            <DeckStack remaining={state.deck.length} starter={state.starter} />
            <div className="flex items-center gap-3">
              <div
                ref={pileRef}
                className="relative flex h-[77px] w-52 items-center justify-start [&>*:not(:first-child)]:-ml-6 sm:w-64"
              >
                {state.pile.map((card, index) => {
                  const isLast = index === state.pile.length - 1;
                  return (
                    <span
                      key={card.id}
                      className={`relative ${
                        isLast && laidBy
                          ? laidBy === "player"
                            ? "block"
                            : "animate-lay-cpu block"
                          : "block"
                      }`}
                    >
                      <PlayingCard card={card} small />
                      {isLast && state.lastPeg ? (
                        <span
                          className="animate-scale-in pointer-events-none absolute -top-3 right-0 z-20 -translate-y-full select-none"
                          title={`${state.lastPeg.label} — ${state.lastPeg.points} to ${
                            state.lastPeg.side === "player" ? "you" : opponentName
                          }`}
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-brand bg-cream font-display text-xs leading-none text-brand shadow-lg shadow-black/40">
                            {state.lastPeg.points}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
              <div className="flex flex-col items-center justify-center">
                <p className="font-display text-xl text-cream">{count}</p>
              </div>
            </div>
          </div>
        )}

        {/* Message strip */}
        <p className="mx-auto flex h-11 max-w-sm items-center justify-center rounded-lg border border-gold/40 bg-gold/15 px-3 text-center text-xs leading-4 text-cream">
          <span className="line-clamp-2">{message}</span>
        </p>

        <AlertDialog open={state.phase === "show" && !state.showReady.player}>
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto border-gold/30 bg-brand text-cream sm:max-w-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-center font-display text-2xl text-gold">
                The show
              </AlertDialogTitle>
              <AlertDialogDescription className="text-center text-ivory/70">
                Points in each hand and the crib.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-3 sm:grid-cols-3">
              {state.show.map((block, index) => (
                <div
                  key={`${block.side}-${block.kind}-${index}`}
                  className="rounded-xl border border-gold/20 bg-brand/50 p-4 text-sm"
                >
                  <p className="mb-2 font-display text-lg text-gold">{blockLabel(block)}</p>
                  <p className="mb-3 text-2xl font-semibold">{block.total}</p>
                  <ul className="space-y-2 text-xs text-ivory/65">
                    {block.lines.length ? (
                      block.lines.map((line) => (
                        <li key={line.label} className="space-y-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-ivory/85">{line.label}</span>
                            <span className="font-semibold text-ivory">{line.points}</span>
                          </div>
                          {line.cards?.map((group, gi) => {
                            const points = line.cards!.length
                              ? line.points / line.cards!.length
                              : line.points;
                            return (
                              <div key={gi} className="flex items-center justify-between gap-2">
                                <span className="flex flex-wrap gap-1">
                                  {group.map((c) => (
                                    <CardChip key={c.id} card={c} />
                                  ))}
                                </span>
                                <span className="whitespace-nowrap font-semibold text-gold">
                                  +{points}
                                </span>
                              </div>
                            );
                          })}
                        </li>
                      ))
                    ) : (
                      <li>Nothing but a lonely hand.</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
            <AlertDialogFooter className="sm:justify-center">
              <AlertDialogAction asChild>
                <Button variant="parlor" onClick={dismissShow}>
                  Deal the next hand
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Player seat row: crib sits to the left when you deal, hand stays centred */}
        <div className="relative flex items-end justify-center">
          {state.dealer === "player" && state.phase !== "cut" ? (
            <div className="absolute bottom-0 left-0">
              <CribPile />
            </div>
          ) : null}

          <div className="text-center">
            <div className="flex justify-center [&>*:not(:first-child)]:-ml-6">
              {state.playerHand.map((card, index) => {
                const isSelected = selected.includes(card.id);
                const faceDown = isFreshDeal && index >= faceUpCount;
                const playable =
                  !faceDown &&
                  ((state.phase === "discard" && !waitingForDiscard) ||
                    (state.phase === "play" &&
                      state.turn === "player" &&
                      count + Math.min(card.rank, 10) <= 31));
                if (faceDown) {
                  return (
                    <span
                      key={card.id}
                      className="animate-deal-in-player relative block"
                      style={{ animationDelay: `${index * 110}ms` }}
                    >
                      <FaceDownCard medium />
                    </span>
                  );
                }
                if (layingId === card.id) {
                  return (
                    <span key={card.id} className="invisible block">
                      <PlayingCard card={card} medium />
                    </span>
                  );
                }
                if (discardingIds.includes(card.id)) {
                  return (
                    <span key={card.id} className="invisible block">
                      <PlayingCard card={card} medium />
                    </span>
                  );
                }
                return (
                  <button
                    key={card.id}
                    ref={(el) => {
                      if (el) handEls.current.set(card.id, el);
                      else handEls.current.delete(card.id);
                    }}
                    className={`relative hover:z-10 focus-visible:z-10 disabled:opacity-40 ${
                      sorting ? "animate-sort" : isFreshDeal ? "animate-turn-over" : "animate-deal"
                    }`}
                    style={sorting ? { animationDelay: `${index * 70}ms` } : undefined}
                    disabled={!playable}
                    onClick={() => {
                      if (state.phase === "discard") {
                        setSelected((current) =>
                          current.includes(card.id)
                            ? current.filter((id) => id !== card.id)
                            : current.length < 2
                              ? [...current, card.id]
                              : current,
                        );
                      } else {
                        layPlayerCard(card);
                      }
                    }}
                  >
                    <PlayingCard card={card} medium selected={isSelected} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-col items-center gap-3">
              {/* Reserve the action-button slot so the seat (and the crib beside
                  it) does not jump up when the button appears or hides. */}
              <div className="flex h-9 items-center">
                {state.phase === "discard" && !waitingForDiscard && (
                  <Button
                    variant="parlor"
                    disabled={selected.length !== 2}
                    onClick={confirmDiscards}
                  >
                    Send to crib
                  </Button>
                )}
                {state.phase === "play" &&
                  state.turn === "player" &&
                  !canPlay(state.playerHand, state.pile) && (
                    <Button
                      variant="parlorOutline"
                      onClick={() =>
                        apply((current) => {
                          const s = { ...current };
                          resolveAfterPlay(s, "cpu");
                          return s;
                        })
                      }
                    >
                      Say go
                    </Button>
                  )}
              </div>
              <Seat
                name={playerName}
                isDealer={state.dealer === "player"}
                avatar={<PlayerAvatar avatar={avatar} onSelect={setAvatar} />}
              />
            </div>
          </div>
        </div>
      </div>
      {flying.map((flight) => (
        <FlyingCardView key={flight.key} flight={flight} />
      ))}
    </TableShell>
  );
}

/** A card flying across the table: from the hand to the pile, or to the crib. */
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
  const scale = moved ? (flight.toScale ?? 1) : (flight.fromScale ?? 1);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 transition-transform duration-500 ease-out"
      style={{
        left: flight.from.x,
        top: flight.from.y,
        transformOrigin: "top left",
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
      }}
    >
      {flight.faceDown ? <FaceDownCard /> : <PlayingCard card={flight.card} />}
    </div>
  );
}

/** Stack of face-down cards representing the deck, with the cut card sitting on top. */
function DeckStack({ remaining, starter }: { remaining: number; starter: Card | null }) {
  const layers = Math.min(4, Math.max(1, Math.ceil(remaining / 10)));
  return (
    <div className="text-center">
      <div className="relative h-[77px] w-[53px]">
        {Array.from({ length: layers }).map((_, index) => (
          <span
            key={index}
            className="absolute inset-0"
            style={{ transform: `translate(${index * 2}px, ${-index * 2}px)` }}
          >
            <FaceDownCard small />
          </span>
        ))}
        {starter ? (
          <span
            className="animate-turn-over absolute inset-0"
            style={{ transform: "translate(8px, -8px)" }}
          >
            <PlayingCard card={starter} small />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A seat's drawn card during the cut for deal. */
function CutSeat({
  label,
  card,
  seatRef,
}: {
  label: string;
  card: Card | null;
  seatRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="text-center">
      <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-gold">{label}</p>
      <div ref={seatRef} className="grid h-[77px] w-[53px] place-items-center">
        {card ? (
          <span className="block">
            <PlayingCard card={card} small />
          </span>
        ) : (
          <div className="grid size-full place-items-center rounded-lg border border-dashed border-gold/30 text-[10px] text-ivory/40">
            —
          </div>
        )}
      </div>
    </div>
  );
}

function Seat({
  name,
  isDealer,
  avatar,
}: {
  name: string;
  isDealer: boolean;
  avatar?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {avatar ?? (
        <span className="grid size-8 place-items-center rounded-full bg-gold/20 font-display text-sm text-gold ring-1 ring-gold/40">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm text-cream">{name}</span>
      {isDealer && (
        <span className="rounded-full bg-gold px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-brand">
          Dealer
        </span>
      )}
    </div>
  );
}

function FaceDownCard({
  small = false,
  tiny = false,
  medium = false,
  xs = false,
  opp = false,
}: {
  small?: boolean;
  tiny?: boolean;
  medium?: boolean;
  xs?: boolean;
  opp?: boolean;
}) {
  return (
    <img
      src={cardBackAsset}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={`block rounded-lg object-cover shadow-md shadow-black/30 ${
        tiny
          ? "h-12 w-8"
          : xs
            ? "h-[58px] w-10"
            : opp
              ? "h-[62px] w-[42px]"
              : small
                ? "h-[77px] w-[53px]"
                : medium
                  ? "h-[84px] w-[58px]"
                  : "h-24 w-16"
      }`}
    />
  );
}

function CardChip({ card }: { card: Card }) {
  const red = card.suit === "H" || card.suit === "D";
  return (
    <span className="inline-flex items-center rounded border border-black/10 bg-cream px-1.5 py-0.5 font-display text-xs font-bold leading-none shadow-sm">
      <span className={red ? "text-destructive" : "text-brand"}>
        {RANK_LABEL[card.rank]}
        {SUIT_SYMBOL[card.suit]}
      </span>
    </span>
  );
}

function PlayingCard({
  card,
  small = false,
  tiny = false,
  medium = false,
  xs = false,
  opp = false,
  selected = false,
}: {
  card: Card;
  small?: boolean;
  tiny?: boolean;
  medium?: boolean;
  xs?: boolean;
  opp?: boolean;
  selected?: boolean;
}) {
  const red = card.suit === "H" || card.suit === "D";
  const rank = RANK_LABEL[card.rank];
  const suit = SUIT_SYMBOL[card.suit];
  const isFace = card.rank > 10;
  return (
    <span
      className={`relative block overflow-hidden rounded-lg border bg-cream shadow-md shadow-black/30 transition-transform ${
        tiny
          ? "h-12 w-8"
          : xs
            ? "h-[58px] w-10"
            : opp
              ? "h-[62px] w-[42px]"
              : small
                ? "h-[77px] w-[53px]"
                : medium
                  ? "h-[84px] w-[58px]"
                  : "h-24 w-16 hover:-translate-y-1"
      } ${selected ? "animate-float-selected border-gold ring-2 ring-gold" : "border-black/10"} ${
        red ? "text-destructive" : "text-brand"
      }`}
    >
      {/* corner index */}
      <span
        className={`absolute left-1 top-0.5 flex flex-col items-center leading-none font-display font-bold ${
          tiny
            ? "text-[8px]"
            : xs
              ? "text-[9px]"
              : opp
                ? "text-[10px]"
                : small
                  ? "text-xs"
                  : medium
                    ? "text-[13px]"
                    : "text-xs"
        }`}
      >
        <span>{rank}</span>
        <span
          className={
            tiny
              ? "text-[7px]"
              : xs
                ? "text-[8px]"
                : opp
                  ? "text-[9px]"
                  : small
                    ? "text-[11px]"
                    : medium
                      ? "text-xs"
                      : "text-[11px]"
          }
        >
          {suit}
        </span>
      </span>

      {/* graphic */}
      <span
        aria-hidden
        className={`absolute inset-0 grid place-items-center font-display ${
          tiny
            ? "text-lg"
            : xs
              ? "text-xl"
              : opp
                ? "text-[22px]"
                : small
                  ? "text-[28px]"
                  : medium
                    ? "text-[31px]"
                    : "text-4xl"
        } ${isFace ? "opacity-90" : "opacity-80"}`}
      >
        {isFace ? (
          <span className="flex flex-col items-center leading-none">
            <span
              className={
                tiny
                  ? "text-xs"
                  : xs
                    ? "text-sm"
                    : opp
                      ? "text-[14px]"
                      : small
                        ? "text-lg"
                        : medium
                          ? "text-[22px]"
                          : "text-xl"
              }
            >
              {rank}
            </span>
            <span
              className={
                tiny
                  ? "text-sm"
                  : xs
                    ? "text-base"
                    : opp
                      ? "text-[18px]"
                      : small
                        ? "text-[22px]"
                        : medium
                          ? "text-2xl"
                          : "text-2xl"
              }
            >
              {suit}
            </span>
          </span>
        ) : (
          suit
        )}
      </span>

      {/* mirrored bottom-right index */}
      <span
        className={`absolute bottom-0.5 right-1 flex rotate-180 flex-col items-center leading-none font-display font-bold ${
          tiny
            ? "text-[8px]"
            : xs
              ? "text-[9px]"
              : opp
                ? "text-[10px]"
                : small
                  ? "text-xs"
                  : medium
                    ? "text-[13px]"
                    : "text-xs"
        }`}
      >
        <span>{rank}</span>
        <span
          className={
            tiny
              ? "text-[7px]"
              : xs
                ? "text-[8px]"
                : opp
                  ? "text-[9px]"
                  : small
                    ? "text-[11px]"
                    : medium
                      ? "text-xs"
                      : "text-[11px]"
          }
        >
          {suit}
        </span>
      </span>
      <span className="sr-only">{cardLabel(card)}</span>
    </span>
  );
}
