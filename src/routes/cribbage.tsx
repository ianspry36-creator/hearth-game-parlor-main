import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TableShell } from "@/components/parlor/TableShell";
import { CribBoard, ScoreGrid } from "@/components/parlor/CribBoard";
import { CribBoardOptionsDialog } from "@/components/parlor/CribBoardOptionsDialog";
import { CountdownBadge } from "@/components/parlor/CountdownBadge";
import { TurnOffTimerControl } from "@/components/parlor/TurnOffTimerControl";
import { ConcedeButton } from "@/components/parlor/ConcedeButton";
import { getGame } from "@/lib/games";
import { getNickname, RECONNECT_SECONDS, TURN_WARNING_SECONDS, useMatch, useTurnTimer } from "@/lib/multiplayer";
import { useRecordMatchResult } from "@/lib/stats";
import { useSolitaireStats } from "@/lib/solitaireStats";
import { useGameStarted } from "@/lib/games-started";
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
import { BotAvatar } from "@/components/parlor/BotAvatar";
import { AVATAR_OPTIONS, ADA_AVATAR, ADA_HAPPY, ADA_SAD, readAvatar, readBotAvatar, readBotName } from "@/lib/avatars";
import { readFlag } from "@/lib/flags";
import { FlagPicker } from "@/components/parlor/FlagPicker";
import { PlayerFlag } from "@/components/parlor/PlayerFlag";
import { NicknameDialog } from "@/components/parlor/NicknameDialog";
import { readCribBoardGraphic } from "@/lib/cribbageBoards";
import { SpeechBubble } from "@/components/parlor/SpeechBubble";

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
type ShowBlock = { side: Side; kind: "hand" | "crib"; hand: Card[]; lines: ScoreLine[]; total: number };

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
  /** Index into `pile` where the current pegging run starts; earlier cards
   *  stay on the table for the whole hand but no longer count toward 31. */
  runStart: number;
  turn: Side;
  log: LogEntry[];
  show: ShowBlock[];
  /** Which seats have dismissed their "show" dialog and are ready for the next hand. */
  showReady: { player: boolean; cpu: boolean };
  winner: Side | null;
  /** Which side asked for a rematch; drives the live 2-player handshake. */
  rematch: Side | null;
  /** Cut-for-deal: the spread deck plus each side's drawn card. */
  cutFan: Card[];
  playerCut: Card | null;
  cpuCut: Card | null;
  /** Cut cards from earlier tied cuts, still resting at each seat. */
  cutHistory: { player: Card[]; cpu: Card[] };
  /** Points pegged in the current play, tracked per side so both the player's
   *  and the opponent's score bubbles stay up until the go. */
  lastPeg: {
    player: { points: number; label: string } | null;
    cpu: { points: number; label: string } | null;
  };
  /** Points pegged by a specific card, keyed by card id, so each score bubble
   *  stays attached to the card that earned it instead of drifting to the
   *  latest card in the pile. */
  pegMarks: Record<string, { side: Side; points: number; label: string }>;
  timedOut: boolean;
  timerOff: boolean;
  timerRequest: Side | null;
  timerProposed: boolean;
  timerDeclined: boolean;
  timerAgreed: boolean;
  /** Cards laid to the pegging pile so far (cumulative across hands). */
  moves: number;
};

type FlyingCard = {
  key: number;
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
  fromScale?: number;
  toScale?: number;
  faceDown?: boolean;
  /** Destination variant to render at, so the card lands at the exact same size
   *  as the cards already sitting at its target (defaults to the full-size card). */
  variant?: "table" | "half" | "medium" | "crib" | "cut";
  /** Flight duration in ms (defaults to 500ms, or 1000ms for crib flights). */
  durationMs?: number;
  /** Fly behind the table (below the fan/deck) so the card slides underneath. */
  behind?: boolean;
};

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);

const SUIT_ORDER: Record<Card["suit"], number> = { S: 0, H: 1, D: 2, C: 3 };
/** Cribbage hands read best sorted low to high, grouped by suit. */
const sortHand = (cards: Card[]) =>
  [...cards].sort((a, b) => a.rank - b.rank || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]);

/** Record the current on-screen position of every card tracked in a hand ref map. */
const capturePositions = (els: Map<string, HTMLElement>) => {
  const m = new Map<string, { left: number; top: number }>();
  els.forEach((el, id) => {
    const r = el.getBoundingClientRect();
    m.set(id, { left: r.left, top: r.top });
  });
  return m;
};

/** Width in px of the responsive "half" (crib/opponent), "medium" (hand) and
 * "table" (pegging pile) card variants. */
const responsiveCardWidth = (variant: "half" | "medium" | "table" | "crib") => {
  const desktop =
    typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;
  if (variant === "half") return desktop ? 72 : 30;
  if (variant === "medium") return desktop ? 65 : 50;
  if (variant === "crib") return desktop ? 72 : 30;
  return desktop ? 65 : 53; // table
};

/** Overlap between adjacent fanned cards, in px. Desktop leaves 30% of the
 * 72px card visible (~21.6px); mobile stays at 12px. */
const responsiveCardOverlap = () => {
  const desktop =
    typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;
  return desktop ? 50.4 : 12;
};

function dealHand(
  dealer: Side,
  scores: Record<Side, number>,
  log: LogEntry[],
  moves = 0,
): State {
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
    runStart: 0,
    turn: other(dealer),
    log: note(log, { side: dealer, text: "dealt — discard two to the crib." }),
    show: [],
    showReady: { player: false, cpu: false },
    winner: null,
    rematch: null,
    timedOut: false,
    timerOff: false,
    timerRequest: null,
    timerProposed: false,
    timerDeclined: false,
    timerAgreed: false,
    cutFan: [],
    playerCut: null,
    cpuCut: null,
    cutHistory: { player: [], cpu: [] },
    lastPeg: { player: null, cpu: null },
    pegMarks: {},
    moves,
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
    cutHistory: { player: [], cpu: [] },
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
    rematch: s.rematch ? other(s.rematch) : null,
    timerRequest: s.timerRequest ? other(s.timerRequest) : null,
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
    cutHistory: { player: s.cutHistory.cpu, cpu: s.cutHistory.player },
    lastPeg: { player: s.lastPeg.cpu, cpu: s.lastPeg.player },
    pegMarks: Object.fromEntries(
      Object.entries(s.pegMarks ?? {}).map(([id, mark]) => [id, { ...mark, side: other(mark.side) }]),
    ),

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
    blocks.push({ side: entry.side, kind: entry.kind, hand: entry.hand, lines, total });
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
  const cur = s.lastPeg[side];
  s.lastPeg = {
    ...s.lastPeg,
    [side]: cur
      ? { points: cur.points + points, label: `${cur.label} + ${label}` }
      : { points, label },
  };
}

/** Attach pegged points to the specific card that earned them, so each score
 *  bubble stays on its card as later cards are laid to the pile. */
function markPeg(s: State, cardId: string, side: Side, points: number, label: string) {
  if (points <= 0) return;
  const cur = s.pegMarks[cardId];
  s.pegMarks = {
    ...s.pegMarks,
    [cardId]: cur
      ? { side, points: cur.points + points, label: `${cur.label} + ${label}` }
      : { side, points, label },
  };
}

/** Group the show into player-first reveal screens: your hand, then your crib,
 *  then the opponent's hand (and crib if they dealt). */
function showStepsFor(show: ShowBlock[]): ShowBlock[][] {
  const hand = (side: Side) => show.find((b) => b.kind === "hand" && b.side === side);
  const crib = (side: Side) => show.find((b) => b.kind === "crib" && b.side === side);
  const steps: ShowBlock[][] = [];
  const playerHand = hand("player");
  if (playerHand) steps.push([playerHand]);
  const playerCrib = crib("player");
  if (playerCrib) steps.push([playerCrib]);
  const oppHand = hand("cpu");
  if (oppHand) steps.push([oppHand]);
  const oppCrib = crib("cpu");
  if (oppCrib) steps.push([oppCrib]);
  return steps;
}

function resolveAfterPlay(s: State, lastPlayer: Side) {
  // Only the cards since the last 31/go count toward the running total; the
  // earlier cards stay on the table for the rest of the hand.
  const run = s.pile.slice(s.runStart);
  const count = peggingCount(run);
  const handOf = (side: Side) => (side === "player" ? s.playerHand : s.cpuHand);
  const opp = other(lastPlayer);
  const lastCard = s.pile[s.pile.length - 1];

  if (!handOf("player").length && !handOf("cpu").length) {
    if (count !== 31) {
      award(s, lastPlayer, 1, "last card");
      addPeg(s, lastPlayer, 1, "Last card");
      if (lastCard) markPeg(s, lastCard.id, lastPlayer, 1, "Last card");
    }
    if (!s.winner) s.phase = "pause";
    return;
  }

  if (count === 31) {
    s.turn = handOf(opp).length ? opp : lastPlayer;
    // Start a fresh run but keep the laid cards on the table.
    s.runStart = s.pile.length;
    return;
  }

  if (canPlay(handOf(opp), run)) {
    s.turn = opp;
    return;
  }

  if (canPlay(handOf(lastPlayer), run)) {
    s.log = note(s.log, { side: opp, text: "said go." });
    s.turn = lastPlayer;
    return;
  }

  award(s, lastPlayer, 1, "go");
  addPeg(s, lastPlayer, 1, "Go");
  if (lastCard) markPeg(s, lastCard.id, lastPlayer, 1, "Go");
  s.turn = handOf(opp).length ? opp : lastPlayer;
  // Reset the count for the next run without clearing the table.
  s.runStart = s.pile.length;
}

function playCard(state: State, side: Side, card: Card): State {
  const s: State = { ...state };
  const run = s.pile.slice(s.runStart);
  const lines = scorePegging(run, card);
  s.pile = [...s.pile, card];
  s.moves += 1;
  if (side === "player") s.playerHand = s.playerHand.filter((c) => c.id !== card.id);
  else s.cpuHand = s.cpuHand.filter((c) => c.id !== card.id);
  s.log = note(s.log, {
    side,
    text: `laid ${cardLabel(card)} — count ${peggingCount([...run, card])}.`,
  });
  for (const line of lines) {
    award(s, side, line.points, line.label.toLowerCase());
    addPeg(s, side, line.points, line.label);
    markPeg(s, card.id, side, line.points, line.label);
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
  s.runStart = 0;
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
  playAgainDisabled = false,
  hidePlayAgain = false,
  detail,
  timedOut = false,
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
  playAgainDisabled?: boolean;
  hidePlayAgain?: boolean;
  detail?: string;
  timedOut?: boolean;
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
            {timedOut
              ? winner === "player"
                ? `You won - ${opponentName} timed out!`
                : `${opponentName} won - You timed out!`
              : winner === "player"
                ? `${playerName} won!`
                : `${opponentName} won!`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-ivory/70">
            {detail ??
              (isSkunk
                ? `A skunk! ${loserName === "You" ? "You were" : `${loserName} was`} well and truly beaten.`
                : `The game is over — here is how the table finished.`)}
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
          {!hidePlayAgain && (
            <AlertDialogAction asChild>
              <Button variant="parlor" onClick={onPlayAgain} disabled={playAgainDisabled}>
                {playAgainLabel}
              </Button>
            </AlertDialogAction>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CribbageTable() {
  const game = getGame("cribbage");
  const navigate = useNavigate();
  const { opponent, match: matchId } = Route.useSearch();
  const [state, setState] = useState<State>(() => cutForDeal());
  const {
    match,
    isHost,
    opponentName: liveOpponent,
    opponentAvatar,
    opponentFlag,
    opponentConnected,
    remoteState,
    publish,
    opponentDisconnected,
    opponentLeft,
    disconnectSecondsLeft,
    disconnectExpired,
  } = useMatch<State>(matchId, state.phase === "over");
  const isMulti = Boolean(matchId);
  const freshGame = () => cutForDeal();
  const [selected, setSelected] = useState<string[]>([]);
  const [back, setBack] = useState<Record<Side, number>>({ player: 0, cpu: 0 });
  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]!.url);
  const [flag, setFlag] = useState<string | null>(readFlag);
  const [flagOpen, setFlagOpen] = useState(false);
  const [boardGraphic, setBoardGraphic] = useState<string>(readCribBoardGraphic);
  const [viewingBoard, setViewingBoard] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  useEffect(() => setAvatar(readAvatar()), []);
  const [adaAvatar, setAdaAvatar] = useState<string>(() => readBotAvatar("ada"));
  // Number of cards dealt so far (0..12): cards are dealt one at a time,
  // alternating seats starting with the non-dealer, then sorted.
  const [dealStep, setDealStep] = useState(12);
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
  // Replays the deck-spread animation each time a fresh 52-card fan is dealt.
  // Bumping the key in a layout effect (before paint) avoids a visible double-run
  // where the fresh fan paints once, then remounts and re-animates a frame later.
  const [spreadNonce, setSpreadNonce] = useState(0);
  const prevCutFanLen = useRef(state.cutFan.length);
  useLayoutEffect(() => {
    const len = state.cutFan.length;
    if (len === 52 && prevCutFanLen.current !== 52) setSpreadNonce((n) => n + 1);
    prevCutFanLen.current = len;
  }, [state.cutFan.length]);

  // Which seat laid the newest card on the pile, so it animates from that side.
  const [laidBy, setLaidBy] = useState<Side | null>(null);
  const pendingLay = useRef<Side | null>(null);
  const pileLength = useRef(state.pile.length);
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  /** Card currently in flight from the hand to the pile (hidden in hand until it lands). */
  const [layingId, setLayingId] = useState<string | null>(null);
  /** Cards in flight from a hand to the crib (hidden in hand until they land). */
  const [discardingIds, setDiscardingIds] = useState<string[]>([]);
  /** Which screen of the step-by-step "show" reveal is currently displayed. */
  const [showStep, setShowStep] = useState(0);
  const pileRef = useRef<HTMLDivElement>(null);
  const cribRef = useRef<HTMLDivElement>(null);
  const handEls = useRef(new Map<string, HTMLElement>());
  const cpuHandEls = useRef(new Map<string, HTMLElement>());
  const fanEls = useRef(new Map<string, HTMLButtonElement>());
  const playerSeatRef = useRef<HTMLDivElement>(null);
  const cpuSeatRef = useRef<HTMLDivElement>(null);
  /** Centre of the table (the spread deck), where cards sweep into the deck. */
  const tableRef = useRef<HTMLDivElement>(null);
  /** The face-down deck stack in the play view, where the cut cards sweep home. */
  const deckRef = useRef<HTMLDivElement>(null);
  /** Last recorded on-screen position of each player hand card, for FLIP reflow. */
  const handPositions = useRef(new Map<string, { left: number; top: number }>());
  /** Last recorded on-screen position of each opponent hand card, for FLIP reflow. */
  const cpuHandPositions = useRef(new Map<string, { left: number; top: number }>());
  /** Pre-sort positions of each hand, captured just before the sort reorder so
   *  the cards can FLIP-animate into their new fan order. */
  const sortBeforeRef = useRef<{
    player: Map<string, { left: number; top: number }>;
    cpu: Map<string, { left: number; top: number }>;
  } | null>(null);
  /** Card ids already flown from the deck in the current deal, so each flies once. */
  const flownCardsRef = useRef(new Set<string>());

  // Stable across the sort animation so the deal only plays once per hand.
  const handKey = [...state.playerHand.map((c) => c.id)].sort().join("-");
  const isFreshDeal = state.phase === "discard" && !state.playerDiscards;
  // The non-dealer receives the first card, then the deal alternates seats.
  const firstSeat: Side = state.turn;
  const prevScores = useRef(state.scores);
  const stateRef = useRef(state);
  stateRef.current = state;
  // True once the local player has proposed switching the clock off this hand,
  // so a later "declined" note is shown only to the player who asked.
  const proposedTimerOffRef = useRef(false);
  // Defer the "completed" write while the end-of-game dialog is up, so the two
  // players aren't bounced back to the game room before they can see the final
  // score. A rematch resets the winner and cancels the pending write.
  useRecordMatchResult(
    match,
    isHost,
    state.rematch ? null : state.winner,
    matchId ? RECONNECT_SECONDS * 1000 : 0,
  );

  const opponentName = liveOpponent ?? opponent ?? readBotName("ada");
  // Ada is the built-in CPU opponent: she has no country, so her seat shows no
  // flag (and no globe placeholder) unless a live human opponent is present.
  const opponentIsCpu = !isMulti;
  const [playerName, setPlayerName] = useState(() => getNickname() ?? "You");

  // Solo games against Ada are recorded locally so they show in Statistics
  // alongside the multiplayer leaderboard; live matches are handled by
  // useRecordMatchResult above instead.
  const { recordResult: recordSoloResult } = useSolitaireStats(game.id);
  const { end, beginNew, recordAction } = useGameStarted(game.name);
  const prevSoloWinnerRef = useRef<Side | null>(null);
  useEffect(() => {
    if (!isMulti && state.winner && state.winner !== prevSoloWinnerRef.current) {
      recordSoloResult(state.winner === "player" ? "win" : "loss");
    }
    prevSoloWinnerRef.current = state.winner;
  }, [state.winner, isMulti, recordSoloResult]);

  const prevGameWinnerRef = useRef<string | null>(null);
  useEffect(() => {
    const w = state.winner;
    if (w && w !== prevGameWinnerRef.current) {
      end(w === "player" ? "won" : "lost");
    }
    prevGameWinnerRef.current = w;
  }, [state.winner, end]);

  /** Commit a move: locally always, and to the shared table in a live match. */
  const apply = (fn: (current: State) => State) => {
    recordAction("table action");
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (isMulti) void publish(isHost ? next : mirror(next));
  };

  // Concede the game: award the win to the opponent (Ada or the live player).
  const concede = () => {
    recordAction("concede");
    apply((current) => ({
      ...current,
      phase: "over",
      winner: "cpu",
      log: note(current.log, { side: "player", text: `${playerName} conceded.` }),
    }));
  };

  // Live matches run a 1-minute clock on the active seat; running out forfeits
  // the game to the other player.
  const turnSecondsLeft = useTurnTimer({
    // The clock starts the moment the hand begins — while cutting for the deal
    // and discarding to the crib, not just once pegging starts.
    enabled:
      isMulti &&
      opponentConnected &&
      !state.winner &&
      !state.timerOff &&
      (state.phase === "cut" || state.phase === "discard" || state.phase === "play"),
    turn: state.turn,
    paused: state.timerRequest !== null,
    onTimeout: () =>
      apply((current) => ({
        ...current,
        phase: "over",
        winner: other(current.turn),
        timedOut: true,
        log: note(current.log, {
          side: current.turn,
          text: `${current.turn === "player" ? playerName : opponentName} ran out of time.`,
        }),
      })),
  });
  const countdown = turnSecondsLeft > 0 && turnSecondsLeft <= TURN_WARNING_SECONDS ? turnSecondsLeft : 0;

  const reset = (fresh: State) => {
    proposedTimerOffRef.current = false;
    stateRef.current = fresh;
    setState(fresh);
    setSelected([]);
    setBack({ player: 0, cpu: 0 });
    setDealStep(0);
    // Reset the peg trail too, so a fresh game doesn't leave the back peg at the old score.
    prevScores.current = fresh.scores;
    setCutSeated({ player: false, cpu: false });
    setViewingBoard(false);
    if (isMulti) void publish(isHost ? fresh : mirror(fresh));
    recordAction("new game");
    beginNew();
  };

  // Rematch: the local player asks the opponent to play another game.
  const requestRematch = () => {
    if (!isMulti) return;
    apply((current) => ({ ...current, rematch: "player" }));
  };

  // The opponent declined our rematch — both players return to the final score.
  const declineRematch = () => {
    if (!isMulti) return;
    apply((current) => ({ ...current, rematch: null }));
  };

  // The opponent accepted — start a fresh game for both players.
  const acceptRematch = () => {
    if (!isMulti) return;
    reset(freshGame());
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
        // advancing by its width minus the 27px overlap. Land with the card's
        // left edge exactly on the next empty slot.
        to: {
          x: pileRect.left + state.pile.length * (responsiveCardWidth("table") - 27),
          y: pileRect.top,
        },
        fromScale: responsiveCardWidth("medium") / responsiveCardWidth("table"),
        variant: "table",
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

  /** Lay a card from the opponent's hand, animating it from the hand to the pile. */
  const layCpuCard = (card: Card) => {
    if (layingId) return;
    pendingLay.current = "cpu";
    const pileRect = pileRef.current?.getBoundingClientRect();
    const el = cpuHandEls.current.get(card.id);
    const rect = el?.getBoundingClientRect();
    setLayingId(card.id);
    if (pileRect && rect) {
      const flight: FlyingCard = {
        key: Date.now(),
        card,
        from: { x: rect.left, y: rect.top },
        // Land on the next empty pile slot, matching the player-side animation.
        to: {
          x: pileRect.left + stateRef.current.pile.length * (responsiveCardWidth("table") - 27),
          y: pileRect.top,
        },
        fromScale: responsiveCardWidth("half") / responsiveCardWidth("table"),
        variant: "table",
      };
      setFlying((current) => [...current, flight]);
      window.setTimeout(() => {
        setFlying((current) => current.filter((f) => f.key !== flight.key));
      }, 600);
      window.setTimeout(() => {
        apply((current) => playCard(current, "cpu", card));
        setLayingId(null);
      }, 500);
      return;
    }
    apply((current) => playCard(current, "cpu", card));
    setLayingId(null);
  };

  /** Fly a cut card from the spread deck to its seat during the cut for deal. */
  const flyCutCard = (card: Card, side: Side) => {
    const fan = fanEls.current.get(card.id);
    const seat = side === "player" ? playerSeatRef.current : cpuSeatRef.current;
    if (!fan || !seat) return;
    const fanRect = fan.getBoundingClientRect();
    const seatRect = seat.getBoundingClientRect();
    const offset = stateRef.current.cutHistory[side].length * 11;
    const flight: FlyingCard = {
      key: Date.now(),
      card,
      from: { x: fanRect.left, y: fanRect.top },
      to: { x: seatRect.left + offset, y: seatRect.top },
      // Render at the cut-card variant so it matches both the source fan card and
      // the destination seat card exactly (same 68×99 frame and internal 0.9215
      // scale), landing dead-centre with no snap-back.
      variant: "cut",
      durationMs: 750,
    };
    setFlying((current) => [...current, flight]);
    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== flight.key));
    }, 800);
  };

  /** Sweep the spread deck and both cut cards together into the deck, then deal. */
  const sweepToDeck = (onDone: () => void) => {
    const cur = stateRef.current;
    // Capture the seat positions before the cut view unmounts, so the cut cards
    // can still fly home to the deck once the play view has taken over.
    const playerFrom = playerSeatRef.current?.getBoundingClientRect();
    const cpuFrom = cpuSeatRef.current?.getBoundingClientRect();

    // Gather the spread fan into the deck's final position (the deck stack that
    // appears once the play view mounts), so the fan becomes the deck in place.
    const deckRect = deckRef.current?.getBoundingClientRect();
    if (deckRect) {
      const cx = deckRect.left + deckRect.width / 2;
      const cy = deckRect.top + deckRect.height / 2;
      fanEls.current.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const dx = cx - (rect.left + rect.width / 2);
        const dy = cy - (rect.top + rect.height / 2);
        el.style.transition = "transform 1.65s cubic-bezier(0.4, 0, 0.2, 1)";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });
    }

    // While the fan gathers, the two cut cards turn face down and fly home to the
    // deck at the same time (rather than after it), then their seats clear.
    const fly = (card: Card, from: DOMRect | undefined, offset: number) => {
      if (!from || !deckRect) return;
      const flight: FlyingCard = {
        key: Date.now() + Math.random(),
        card,
        from: { x: from.left + offset, y: from.top },
        to: { x: deckRect.left, y: deckRect.top },
        variant: "cut",
        faceDown: true,
        durationMs: 750,
        behind: true,
      };
      setFlying((f) => [...f, flight]);
      window.setTimeout(() => setFlying((f) => f.filter((x) => x.key !== flight.key)), 800);
    };
    const playerCuts = [...cur.cutHistory.player, ...(cur.playerCut ? [cur.playerCut] : [])];
    const cpuCuts = [...cur.cutHistory.cpu, ...(cur.cpuCut ? [cur.cpuCut] : [])];
    playerCuts.forEach((card, i) => fly(card, playerFrom, i * 11));
    cpuCuts.forEach((card, i) => fly(card, cpuFrom, i * 11));
    setCutSeated({ player: false, cpu: false });

    // Switch to the play view once the fan has gathered, so the deck appears.
    window.setTimeout(() => {
      onDone();
    }, 1800);
  };

  // Cards are dealt one at a time, alternating seats starting with the non-dealer,
  // turning face-up as they land, then slide into sorted order.
  useEffect(() => {
    if (!isFreshDeal) {
      setDealStep(12);
      setSorting(false);
      return;
    }
    setDealStep(0);
    setSorting(false);
    flownCardsRef.current.clear();
    const timers: number[] = [];
    for (let k = 1; k <= 12; k += 1) {
      timers.push(window.setTimeout(() => setDealStep(k), 300 + k * 320));
    }
    const sortAt = window.setTimeout(
      () => {
        // Capture where each card sits now, before the reorder, so the sort can
        // FLIP-animate the cards into their new slots instead of jumping.
        sortBeforeRef.current = {
          player: capturePositions(handEls.current),
          cpu: capturePositions(cpuHandEls.current),
        };
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
      300 + 12 * 320 + 500,
    );
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(sortAt);
    };
  }, [handKey, isFreshDeal]);

  // Fly each dealt card from the deck stack to its hand slot, so the cards come
  // from the deck rather than materialising from the centre of the table.
  useEffect(() => {
    if (dealStep < 1 || dealStep > 12) return;
    const s = stateRef.current;
    if (s.phase !== "discard" || s.playerDiscards) return;
    const firstSeatNow: Side = s.turn;
    const seat: Side = dealStep % 2 === 1 ? firstSeatNow : other(firstSeatNow);
    const index = Math.floor((dealStep - 1) / 2);
    const hand = seat === "player" ? s.playerHand : s.cpuHand;
    const card = hand[index];
    if (!card || flownCardsRef.current.has(card.id)) return;
    flownCardsRef.current.add(card.id);
    const deckRect = deckRef.current?.getBoundingClientRect();
    const el = (seat === "player" ? handEls.current : cpuHandEls.current).get(card.id);
    const rect = el?.getBoundingClientRect();
    if (!deckRect || !rect) return;
    const variant = seat === "player" ? "medium" : "half";
    const flight: FlyingCard = {
      key: Date.now() + Math.random(),
      card,
      from: { x: deckRect.left, y: deckRect.top },
      to: { x: rect.left, y: rect.top },
      fromScale: responsiveCardWidth("table") / responsiveCardWidth(variant),
      variant,
      faceDown: seat === "cpu",
      durationMs: 300,
    };
    setFlying((current) => [...current, flight]);
    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => f.key !== flight.key));
    }, 320);
  }, [dealStep]);

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
      const used = new Set([
        ...current.cutHistory.player.map((c) => c.id),
        ...current.cutHistory.cpu.map((c) => c.id),
        ...(current.playerCut ? [current.playerCut.id] : []),
        ...(current.cpuCut ? [current.cpuCut.id] : []),
      ]);
      const remaining = current.cutFan.filter((c) => c.id !== card.id && !used.has(c.id));
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
    // Against a live opponent their card is flown by the reveal effect below
    // (it arrives through the shared state rather than the local ceremony), so
    // only my own card flies from here in a live match.
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
          750,
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
      if (mine === theirs) {
        // On a tie keep the spread deck and the cards already resting at each
        // seat; both sides simply cut again and the new cards land to the right.
        apply((current) => ({
          ...current,
          cutHistory: {
            player: [...current.cutHistory.player, current.playerCut!],
            cpu: [...current.cutHistory.cpu, current.cpuCut!],
          },
          playerCut: null,
          cpuCut: null,
          log: note(current.log, { side: null, text: "Tie — cut again." }),
        }));
        return;
      }
      const first: Side = mine > theirs ? "player" : "cpu";
      const dealer = other(first);
      const dealt = dealHand(dealer, state.scores, state.log);
      dealt.log = note(dealt.log, { side: first, text: "cut high and play first." });
      // Sweep the spread deck and both cut cards together into the deck, then deal.
      sweepToDeck(() => {
        setCutStage("idle");
        reset(dealt);
      });
    }, 2400);
    return () => clearTimeout(timer);
  }, [state.phase, state.playerCut, state.cpuCut, cutStage, isMulti, isHost]);

  // In a live match, the opponent draws their cut on their own device, so fly
  // it here from the fan to their seat (the same way Ada's card flies in solo
  // play) instead of letting it pop in, and clear the seat when a fresh
  // cut-for-deal begins.
  useEffect(() => {
    if (!isMulti) return;
    if (state.cpuCut) {
      flyCutCard(state.cpuCut, "cpu");
      const timer = window.setTimeout(
        () => setCutSeated((s) => ({ ...s, cpu: true })),
        750,
      );
      return () => clearTimeout(timer);
    }
    setCutSeated((s) => ({ ...s, cpu: false }));
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

  // Slide the remaining hand cards into their new fan positions when a card
  // leaves the hand, instead of letting them jump. The deal and sort animations
  // handle their own reflow, so this only kicks in when the hand shrinks.
  useLayoutEffect(() => {
    const prev = handPositions.current;
    const next = new Map<string, { left: number; top: number }>();
    const moves: { el: HTMLElement; dx: number; dy: number }[] = [];

    state.playerHand.forEach((card) => {
      const el = handEls.current.get(card.id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const before = prev.get(card.id);
      next.set(card.id, { left: rect.left, top: rect.top });
      if (before && (before.left !== rect.left || before.top !== rect.top)) {
        moves.push({ el, dx: before.left - rect.left, dy: before.top - rect.top });
      }
    });

    handPositions.current = next;

    if (state.playerHand.length >= prev.size || moves.length === 0) return;

    // Invert: snap each moved card back to its old spot before transitioning.
    moves.forEach(({ el, dx, dy }) => {
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    // Force a reflow so the browser registers the inverted positions.
    void document.body.offsetHeight;
    // Play: transition back to the natural position.
    moves.forEach(({ el }) => {
      el.style.transition = "transform 0.3s ease";
      el.style.transform = "translate(0, 0)";
    });
    const cleanup = window.setTimeout(() => {
      moves.forEach(({ el }) => {
        el.style.transition = "";
        el.style.transform = "";
      });
    }, 320);
    return () => clearTimeout(cleanup);
  }, [state.playerHand]);

  // Mirror of the player-hand reflow above, for the opponent's hand. The CPU
  // hand only ever shrinks on screen (it never sorts into view), so the same
  // "hand shrank" guard is enough to skip the deal-in animation.
  useLayoutEffect(() => {
    const prev = cpuHandPositions.current;
    const next = new Map<string, { left: number; top: number }>();
    const moves: { el: HTMLElement; dx: number; dy: number }[] = [];

    state.cpuHand.forEach((card) => {
      const el = cpuHandEls.current.get(card.id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const before = prev.get(card.id);
      next.set(card.id, { left: rect.left, top: rect.top });
      if (before && (before.left !== rect.left || before.top !== rect.top)) {
        moves.push({ el, dx: before.left - rect.left, dy: before.top - rect.top });
      }
    });

    cpuHandPositions.current = next;

    if (state.cpuHand.length >= prev.size || moves.length === 0) return;

    moves.forEach(({ el, dx, dy }) => {
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    void document.body.offsetHeight;
    moves.forEach(({ el }) => {
      el.style.transition = "transform 0.3s ease";
      el.style.transform = "translate(0, 0)";
    });
    const cleanup = window.setTimeout(() => {
      moves.forEach(({ el }) => {
        el.style.transition = "";
        el.style.transform = "";
      });
    }, 320);
    return () => clearTimeout(cleanup);
  }, [state.cpuHand]);

  // When the dealt hands are sorted, slide each card from its dealt slot into
  // its sorted slot instead of letting the fan jump.
  useLayoutEffect(() => {
    if (!sorting || !sortBeforeRef.current) return;
    const before = sortBeforeRef.current;
    sortBeforeRef.current = null;
    const timeouts: number[] = [];
    const animate = (els: Map<string, HTMLElement>, prev: Map<string, { left: number; top: number }>) => {
      const moves: { el: HTMLElement; dx: number; dy: number }[] = [];
      prev.forEach((pos, id) => {
        const el = els.get(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const dx = pos.left - rect.left;
        const dy = pos.top - rect.top;
        if (dx !== 0 || dy !== 0) moves.push({ el, dx, dy });
      });
      if (moves.length === 0) return;
      // Invert: snap each card back to its dealt position before transitioning.
      moves.forEach(({ el, dx, dy }) => {
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      void document.body.offsetHeight;
      // Play: transition back to the natural (sorted) position.
      moves.forEach(({ el }) => {
        el.style.transition = "transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)";
        el.style.transform = "translate(0, 0)";
      });
      timeouts.push(
        window.setTimeout(() => {
          moves.forEach(({ el }) => {
            el.style.transition = "";
            el.style.transform = "";
          });
        }, 500),
      );
    };
    animate(handEls.current, before.player);
    animate(cpuHandEls.current, before.cpu);
    return () => timeouts.forEach(clearTimeout);
  }, [sorting]);

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
      const current = stateRef.current;
      if (current.phase !== "play" || current.turn !== "cpu" || current.winner) return;
      const card = choosePeggingCard(current.cpuHand, current.pile.slice(current.runStart));
      if (!card) {
        apply((cur) => {
          const next = { ...cur };
          resolveAfterPlay(next, "player");
          return next;
        });
        return;
      }
      layCpuCard(card);
    }, 850);
    return () => clearTimeout(timer);
  }, [isMulti, state.phase, state.turn, state.pile.length, state.runStart, state.winner]);

  // Brief pause between pegging sub-plays so the score bubble stays above the last card.
  useEffect(() => {
    if (state.phase !== "between" || state.winner) return;
    const timer = setTimeout(() => {
      apply((current) => {
        const s = { ...current };
        s.pile = [];
        s.lastPeg = { player: null, cpu: null };
        s.pegMarks = {};
        s.phase = "play";
        return s;
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [state.phase, state.winner]);

  // The show is revealed by the player's "Display Show" button (rendered in the
  // player seat) rather than an automatic timer, so the crib stays turned over
  // until the player is ready.

  // Deal the next hand once both seats have dismissed their "show" dialogs.
  useEffect(() => {
    if (!isMulti || !isHost) return;
    if (state.phase !== "show" || !state.showReady.player || !state.showReady.cpu) return;
    apply((current) => ({
      ...dealHand(
        other(current.dealer),
        current.pendingScores ?? current.scores,
        current.log,
        current.moves,
      ),
      lastPeg: { player: null, cpu: null },
      timerOff: current.timerOff,
      timerProposed: current.timerProposed,
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
          // Each crib card advances by its width minus the 12px overlap, so the
          // pair lands side by side instead of stacked on the first slot.
          to: { x: cribRect.left + index * (responsiveCardWidth("crib") - responsiveCardOverlap()), y: cribRect.top },
          fromScale: responsiveCardWidth("medium") / responsiveCardWidth("crib"),
          faceDown: true,
          variant: "crib",
        });
      });
    }
    // Hide the chosen cards in the hand while they fly to the crib.
    setDiscardingIds(discardIds);
    setSelected([]);
    // Fly each discard to the crib one at a time so the pair reads as two
    // separate moves instead of a single blob (which reads like a pack deal).
    const FLIGHT_MS = 1000;
    const STAGGER_MS = 320;
    flights.forEach((flight, index) => {
      window.setTimeout(() => {
        setFlying((current) => [...current, flight]);
      }, index * STAGGER_MS);
    });
    // The flight transition is 1000ms but only starts once the unmoved card has
    // painted (a frame or two later). Commit on the same tick the last flying
    // copy is removed so every card settles exactly where it landed instead of
    // popping a few pixels early.
    const commitDelay = Math.max(0, flights.length - 1) * STAGGER_MS + FLIGHT_MS + 100;
    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => !flights.some((fl) => fl.key === f.key)));
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
    }, commitDelay);
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
          to: { x: cribRect.left + (offset + index) * (responsiveCardWidth("crib") - responsiveCardOverlap()), y: cribRect.top },
          fromScale: responsiveCardWidth("half") / responsiveCardWidth("crib"), // CPU hand (half) to smaller crib
          faceDown: true,
          variant: "crib",
        });
      });
    }
    // Hide the chosen cards in the CPU hand while they fly to the crib.
    setDiscardingIds(cpuDiscards.map((c) => c.id));
    // Fly each CPU discard to the crib one at a time so they clearly leave the
    // opponent's hand rather than looking like two cards dealt from the pack.
    const FLIGHT_MS = 1000;
    const STAGGER_MS = 320;
    flights.forEach((flight, index) => {
      window.setTimeout(() => {
        setFlying((current) => [...current, flight]);
      }, index * STAGGER_MS);
    });
    // Commit on the same tick the last flying copy is removed, then cut the starter.
    const commitDelay = Math.max(0, flights.length - 1) * STAGGER_MS + FLIGHT_MS + 100;
    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => !flights.some((fl) => fl.key === f.key)));
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
    }, commitDelay);
  };

  /** Dismiss my own "show" dialog; the host deals once both seats have dismissed. */
  const dismissShow = () =>
    apply((current) => {
      const ready = { ...current.showReady, player: true };
      // Solo (or a single human seat): no opponent to wait for — deal straight away.
      if (!isMulti) {
        return {
          ...dealHand(
            other(current.dealer),
            current.pendingScores ?? current.scores,
            current.log,
            current.moves,
          ),
          lastPeg: { player: null, cpu: null },
          timerOff: current.timerOff,
          timerProposed: current.timerProposed,
        };
      }
      return { ...current, showReady: ready };
    });

  const count = peggingCount(state.pile.slice(state.runStart));
  // A transient "chat cloud" above the pile that calls out the running total
  // each time a card is laid during pegging.
  const [countBubble, setCountBubble] = useState<{ key: number; text: string } | null>(null);
  const lastMovesRef = useRef(state.moves);
  useEffect(() => {
    if (state.moves === lastMovesRef.current) return;
    lastMovesRef.current = state.moves;
    if (state.phase !== "play" && state.phase !== "between") return;
    setCountBubble({ key: Date.now(), text: `${count}` });
    const timer = window.setTimeout(() => setCountBubble(null), 1800);
    return () => clearTimeout(timer);
  }, [state.moves, state.phase, count]);
  const revealed = state.phase === "pause" || state.phase === "show" || state.phase === "over";
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

  // Player-first show reveal: your hand, then your crib, then the opponent's.
  const showSteps = state.phase === "show" ? showStepsFor(state.show) : [];
  const showStepIndex = Math.min(showStep, Math.max(0, showSteps.length - 1));
  const currentStep = showSteps[showStepIndex];
  // Score shown on the board: during the show it advances as each screen is
  // revealed, so the pegs crawl to their new holes one hand at a time.
  const displayScores =
    state.phase === "show"
      ? (() => {
          const scores = { ...state.scores };
          for (let i = 0; i <= showStepIndex && i < showSteps.length; i += 1) {
            for (const block of showSteps[i]) {
              scores[block.side] += Math.max(0, block.total);
            }
          }
          return scores;
        })()
      : state.scores;
  const nextShow = () => {
    if (showStep < showSteps.length - 1) setShowStep(showStep + 1);
    else {
      dismissShow();
    }
  };
  const prevShow = () => {
    if (showStep > 0) setShowStep(showStep - 1);
  };
  const prevShowBlock: ShowBlock | undefined = showStep > 0 ? showSteps[showStep - 1]?.[0] : undefined;
  const nextShowBlock: ShowBlock | undefined =
    showStep < showSteps.length - 1 ? showSteps[showStep + 1]?.[0] : undefined;

  // Reset the reveal step whenever a new phase (and thus a new show) begins.
  useEffect(() => {
    setShowStep(0);
  }, [state.phase]);

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
              : "Select two cards to send to the crib, and then click the Send to Crib button"
            : state.phase === "between"
              ? "End of the play — clearing the board next"
              : state.phase === "pause"
                ? "The crib is turned over — click Display Show to score"
                : state.phase === "show"
                  ? isMulti && state.showReady.player && !state.showReady.cpu
                    ? `${opponentName} is still looking at the cards.`
                    : "Hands are shown — check the scores, then deal the next hand"
                  : state.turn === "player"
                    ? "Your turn — lay a card on the count"
                    : `${opponentName} is thinking…`;

  const CribPile = () => (
    <div className="text-center">
      <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-black">Crib</p>
      <div
        ref={cribRef}
        className="flex w-[84px] justify-start [&>*:not(:first-child)]:-ml-3 sm:w-[136.8px] sm:[&>*:not(:first-child)]:-ml-[50.4px]"
      >
        {state.crib.length === 0 ? (
          <div className="h-[43px] w-full rounded-lg border border-dotted border-black sm:h-[105px]" aria-hidden="true" />
        ) : revealed ? (
          state.crib.map((card) => <PlayingCard key={card.id} card={card} crib />)
        ) : (
          state.crib.map((card) => <FaceDownCard key={card.id} crib />)
        )}
      </div>
    </div>
  );

  // Rematch flow: "player" means we asked, "cpu" means the opponent asked us.
  const rematchOutgoing = isMulti && state.rematch === "player";
  const rematchIncoming = isMulti && state.rematch === "cpu";

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus={turnLabel}
      showChat={isMulti}
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
      onNewGame={() => (isMulti ? navigate({ to: "/cribbage" }) : reset(freshGame()))}
      onAbandon={() => {
        if (!isMulti) recordSoloResult("abandoned");
      }}
      menuExtra={
        <>
          <CribBoardOptionsDialog boardGraphic={boardGraphic} onSelect={setBoardGraphic} />
          <TurnOffTimerControl
            showButton={
              isMulti && state.phase === "play" && !state.winner && !state.timerOff && !state.timerProposed
            }
            showPrompt={state.timerRequest === "cpu"}
            opponentName={opponentName}
            declined={proposedTimerOffRef.current && state.timerDeclined}
            agreed={proposedTimerOffRef.current && state.timerAgreed}
            onRequest={() => {
              proposedTimerOffRef.current = true;
              apply((current) => ({ ...current, timerProposed: true, timerRequest: "player" }));
            }}
            onAccept={() => apply((current) => ({ ...current, timerOff: true, timerAgreed: true, timerRequest: null }))}
            onDecline={() =>
              apply((current) => ({ ...current, timerRequest: null, timerDeclined: true }))
            }
          />
          {!state.winner && state.phase !== "over" && (
            <ConcedeButton
              moves={state.moves}
              onConcede={concede}
              size="sm"
              className="w-full h-6"
              description={
                isMulti
                  ? `You'll forfeit the match and ${opponentName} will win.`
                  : "You'll forfeit the game and Ada will win."
              }
            />
          )}
        </>
      }
      containerClassName="px-3 sm:px-6"
      boxClassName="bg-[#4c9a2a] text-black py-[2.4px] sm:py-[4.8px]"
      gridClassName="grid gap-1.5"
      containerMaxWidth="max-w-[76rem]"
      below={
        <div className="space-y-3">
          <ScoreGrid
            playerName={playerName}
            opponentName={opponentName}
            playerAvatar={avatar}
            cpuAvatar={opponentAvatar ?? adaAvatar}
            playerFlag={flag}
            cpuFlag={opponentFlag}
            hideCpuFlag={opponentIsCpu}
            playerScore={displayScores.player}
            cpuScore={displayScores.cpu}
          />
          <Dialog open={boardOpen} onOpenChange={setBoardOpen}>
            <DialogTrigger asChild>
              <Button variant="parlor" size="sm" className="w-full">
                Show board
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto border-gold/30 bg-brand text-cream sm:max-w-md">
              <CribBoard
                graphic={boardGraphic}
                playerScore={displayScores.player}
                cpuScore={displayScores.cpu}
                playerBack={back.player}
                cpuBack={back.cpu}
                opponentName={opponentName}
                playerName={playerName}
                playerAvatar={avatar}
                cpuAvatar={opponentAvatar ?? adaAvatar}
                playerFlag={flag}
                cpuFlag={opponentFlag}
                hideCpuFlag={opponentIsCpu}
              />
            </DialogContent>
          </Dialog>
        </div>
      }
      middle={
        <CribBoard
          graphic={boardGraphic}
          playerScore={displayScores.player}
          cpuScore={displayScores.cpu}
          playerBack={back.player}
          cpuBack={back.cpu}
          opponentName={opponentName}
          playerName={playerName}
          playerAvatar={avatar}
          cpuAvatar={opponentAvatar ?? adaAvatar}
          playerFlag={flag}
          cpuFlag={opponentFlag}
          hideCpuFlag={opponentIsCpu}
        />
      }
    >
      <FlagPicker open={flagOpen} onOpenChange={setFlagOpen} onSelect={setFlag} />
      <GameOverDialog
        open={state.phase === "over" && state.winner !== null && !viewingBoard}
        winner={state.winner ?? "player"}
        timedOut={state.timedOut}
        scores={state.pendingScores ?? state.scores}
        playerAvatar={avatar}
        opponentName={opponentName}
        playerName={playerName}
        onPlayAgain={() => (isMulti ? requestRematch() : reset(freshGame()))}
        playAgainLabel={isMulti ? "Rematch" : "Play again"}
        playAgainDisabled={isMulti && state.rematch !== null}
        hidePlayAgain={isMulti && opponentLeft}
        detail={
          rematchOutgoing
            ? opponentLeft
              ? `${opponentName} has rejected the rematch.`
              : `Rematch request sent — waiting for ${opponentName} to respond…`
            : undefined
        }
        onViewBoard={() => setViewingBoard(true)}
        onBackToGameRoom={() => {
          recordAction("home");
          navigate({ to: "/" });
        }}
      />
      <AlertDialog open={rematchIncoming}>
        <AlertDialogContent className="border-gold/30 bg-brand text-cream sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center font-display text-2xl">
              Rematch?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-ivory/70">
              {opponentName} wants to play again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-center">
            <AlertDialogAction asChild>
              <Button variant="parlor" onClick={acceptRematch}>
                Rematch
              </Button>
            </AlertDialogAction>
            <AlertDialogCancel asChild>
              <Button variant="parlorOutline" onClick={declineRematch}>
                Decline
              </Button>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="space-y-[18px]">
        {/* Opponent seat: crib sits top-left when the opponent deals */}
        <div className="relative flex flex-wrap items-start justify-center gap-8">
          {state.dealer === "cpu" && state.phase !== "cut" ? (
            <div className="absolute left-0 top-0">
              <CribPile />
            </div>
          ) : null}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <Seat
                name={opponentName}
                isDealer={state.dealer === "cpu" && state.phase !== "cut"}
                flag={opponentFlag}
                hideFlag={opponentIsCpu}
                avatar={
                  opponentAvatar ? (
                    <span className="relative grid size-[45px] place-items-center overflow-hidden rounded-full bg-gold/20 ring-1 ring-gold/40 sm:size-[72px]">
                      <img
                        src={opponentAvatar}
                        alt={`${opponentName}'s avatar`}
                        width={64}
                        height={64}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                      {state.turn === "cpu" && countdown > 0 && <CountdownBadge seconds={countdown} />}
                    </span>
                  ) : (
                    <BotAvatar
                      bot="ada"
                      name={readBotName("ada")}
                      avatar={adaAvatar}
                      onSelect={setAdaAvatar}
                      width={64}
                      height={64}
                      imgClassName="size-full object-contain"
                      buttonClassName="relative grid size-[45px] place-items-center overflow-hidden rounded-full bg-gold/20 ring-1 ring-gold/40 sm:size-[72px]"
                    >
                      {state.turn === "cpu" && countdown > 0 && <CountdownBadge seconds={countdown} />}
                    </BotAvatar>
                  )
                }
              />
              {countBubble && laidBy === "cpu" ? (
                <div className="animate-scale-in pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2">
                  <SpeechBubble text={countBubble.text} tail="down-left" textClassName="font-display text-lg" />
                </div>
              ) : null}
            </div>
            {state.phase === "cut" && (
              <CutSeat
                cards={[
                  ...state.cutHistory.cpu,
                  ...(cutSeated.cpu && state.cpuCut ? [state.cpuCut] : []),
                ]}
                seatRef={cpuSeatRef}
              />
            )}
            <div className={`flex justify-center [&>*:not(:first-child)]:-ml-3 sm:[&>*:not(:first-child)]:-ml-[50.4px]${state.phase === "cut" ? "" : " min-h-[43px] sm:min-h-[105px]"}`}>
              {state.cpuHand.map((card, index) => {
                if (layingId === card.id) {
                  return (
                    <span key={card.id} className="invisible block">
                      <FaceDownCard half />
                    </span>
                  );
                }
                if (!revealed && discardingIds.includes(card.id)) {
                  return (
                    <span key={card.id} className="invisible block">
                      <FaceDownCard half />
                    </span>
                  );
                }
                const order = firstSeat === "cpu" ? index * 2 + 1 : index * 2 + 2;
                const notDealt = isFreshDeal && order > dealStep;
                const dealAnimating = isFreshDeal && !sorting && order === dealStep;
                if (notDealt || dealAnimating) {
                  return (
                    <span
                      key={card.id}
                      ref={(el) => {
                        if (el) cpuHandEls.current.set(card.id, el);
                        else cpuHandEls.current.delete(card.id);
                      }}
                      className="invisible block"
                    >
                      <FaceDownCard half />
                    </span>
                  );
                }
                return (
                  <span
                    key={card.id}
                    ref={(el) => {
                      if (el) cpuHandEls.current.set(card.id, el);
                      else cpuHandEls.current.delete(card.id);
                    }}
                    className={`${revealed ? "animate-turn-over" : ""} block`}
                  >
                    {revealed ? <PlayingCard card={card} half /> : <FaceDownCard half />}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Centre: deck, starter, pile and count */}
        {state.phase === "cut" ? (
          <div className="relative">
            {/* Invisible anchor marking where the deck stack will sit once the play
                view mounts, so the spread can gather into it during the cut. */}
            <div
              aria-hidden
              className="pointer-events-none invisible absolute left-0 right-0 top-0 flex items-center justify-between gap-2 sm:justify-center sm:gap-8"
            >
              <DeckStack remaining={0} starter={null} deckRef={deckRef} />
              <div className="flex items-center gap-3">
                <div className="h-[77px] w-[234px] sm:h-[95px] sm:w-72" />
                <p className="font-display text-xl text-cream">0</p>
              </div>
            </div>
            <div ref={tableRef} className="overflow-x-auto pt-4">
              <div key={spreadNonce} className="relative z-10 mx-auto flex w-max flex-col items-center gap-2 px-2 sm:flex-row sm:gap-0">
                {[0, 26].map((start) => (
                  <div
                    key={start}
                    className={`flex justify-center [&>*:not(:first-child)]:-ml-[57px] ${
                      start === 26 ? "sm:-ml-[57px]" : ""
                    }`}
                  >
                    {state.cutFan.slice(start, start + 26).map((card, index) => {
                      const globalIndex = start + index;
                      const isMine = state.playerCut?.id === card.id;
                      const isTheirs = state.cpuCut?.id === card.id;
                      const isHistory =
                        state.cutHistory.player.some((c) => c.id === card.id) ||
                        state.cutHistory.cpu.some((c) => c.id === card.id);
                      const flipping =
                        (isMine && cutStage === "flipMine") ||
                        (isTheirs && !isMulti && cutStage === "flipTheirs");
                      const gone =
                        isHistory ||
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
                          aria-label={`Cut card ${globalIndex + 1}`}
                          disabled={Boolean(state.playerCut) || (isMulti && isTheirs) || isHistory}
                          onClick={() => cutDeck(card)}
                          style={{ animationDelay: `${globalIndex * 21}ms` }}
                          className={`relative animate-spread transition-transform ${
                            state.playerCut
                              ? ""
                              : "hover:z-10 hover:-translate-y-2 focus-visible:z-10 focus-visible:-translate-y-2"
                          } ${
                            flipping ? "z-20 -translate-y-3" : ""
                          } ${gone ? "opacity-0" : flipping ? "" : "disabled:opacity-60"}`}
                        >
                          {flipping ? (
                            <span className="animate-turn-over block">
                              <PlayingCard card={card} cut />
                            </span>
                          ) : (
                            <FaceDownCard cut />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-w-[359px] items-center justify-between gap-2 sm:min-w-[645px] sm:justify-center sm:gap-8">
            <DeckStack remaining={state.deck.length} starter={state.starter} deckRef={deckRef} />
            <div className="flex items-center gap-3">
              <div
                ref={pileRef}
                className="relative flex h-[77px] w-[234px] items-center justify-start [&>*:not(:first-child)]:-ml-[27px] sm:h-[95px] sm:w-72"
              >
                {state.pile.map((card, index) => {
                  const isLast = index === state.pile.length - 1;
                  const mark = state.pegMarks[card.id];
                  return (
                    <span
                      key={card.id}
                      className={`relative ${
                        isLast && laidBy
                          ? laidBy === "player"
                            ? "block"
                            : isMulti
                              ? "animate-lay-cpu block"
                              : "block"
                          : "block"
                      }`}
                    >
                      <PlayingCard card={card} table />
                      {mark?.side === "cpu" ? (
                        <span
                          className="animate-scale-in pointer-events-none absolute top-0 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 select-none"
                          title={`${mark.label} — ${mark.points} to ${opponentName}`}
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-brand bg-cream font-display text-xs leading-none text-brand shadow-lg shadow-black/40">
                            {mark.points}
                          </span>
                        </span>
                      ) : null}
                      {mark?.side === "player" ? (
                        <span
                          className="animate-scale-in pointer-events-none absolute bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-1/2 select-none"
                          title={`${mark.label} — ${mark.points} to you`}
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-brand bg-cream font-display text-xs leading-none text-brand shadow-lg shadow-black/40">
                            {mark.points}
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
          <AlertDialogContent overlayClassName="bg-transparent" className="max-h-[85vh] overflow-y-auto border-ink/30 bg-yellow-400 text-ink sm:max-w-[26.4rem] lg:-ml-[133px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-center font-display text-2xl text-ink">
                The show
              </AlertDialogTitle>
              <AlertDialogDescription className="text-center text-ink/70">
                {`Screen ${showStep + 1} of ${showSteps.length}`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid min-h-[24rem] gap-3">
              {currentStep?.map((block, index) => (
                <div
                  key={`${block.side}-${block.kind}-${index}`}
                  className="rounded-xl border border-ink/20 bg-[#4c9a2a] p-4 text-sm text-ink"
                >
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <p className="font-display text-lg text-ink">{blockLabel(block)}</p>
                    <img
                      src={block.side === "player" ? avatar : (opponentAvatar ?? adaAvatar)}
                      alt={`${block.side === "player" ? playerName : opponentName}'s avatar`}
                      className="size-12 shrink-0 rounded-full object-cover ring-1 ring-ink/40"
                    />
                  </div>
                  <div className="mb-3 flex items-end justify-center">
                    <span className="flex gap-1">
                      {sortHand(block.hand).map((c) => (
                        <PlayingCard key={c.id} card={c} tiny />
                      ))}
                    </span>
                    {block.kind === "hand" && state.starter ? (
                      <span className="ml-3 flex gap-1">
                        <PlayingCard card={state.starter} tiny />
                      </span>
                    ) : null}
                  </div>
                  <p className="mb-3 text-2xl font-semibold">{block.total}</p>
                  <ul className="space-y-2 text-xs text-ink/70">
                    {block.lines.length ? (
                      block.lines.map((line) => (
                        <li key={line.label} className="space-y-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-ink/80">{line.label}</span>
                            <span className="font-semibold text-ink">{line.points}</span>
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
                                <span className="whitespace-nowrap font-semibold text-ink">
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
              <Button variant="parlor" disabled={!prevShowBlock} onClick={prevShow}>
                {prevShowBlock ? `← ${blockLabel(prevShowBlock)}` : "Previous"}
              </Button>
              <AlertDialogAction asChild>
                <Button variant="parlor" onClick={nextShow}>
                  {nextShowBlock ? `${blockLabel(nextShowBlock)} →` : "Deal the next hand"}
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
            <div className={`flex justify-center [&>*:not(:first-child)]:-ml-7${state.phase === "cut" ? "" : " min-h-[95px]"}`}>
              {state.playerHand.map((card, index) => {
                const isSelected = selected.includes(card.id);
                const order = firstSeat === "player" ? index * 2 + 1 : index * 2 + 2;
                const notDealt = isFreshDeal && order > dealStep;
                const dealAnimating = isFreshDeal && !sorting && order === dealStep;
                const playable =
                  !notDealt &&
                  ((state.phase === "discard" && !waitingForDiscard) ||
                    (state.phase === "play" &&
                      state.turn === "player" &&
                      count + Math.min(card.rank, 10) <= 31));
                if (notDealt || dealAnimating) {
                  return (
                    <span
                      key={card.id}
                      ref={(el) => {
                        if (el) handEls.current.set(card.id, el);
                        else handEls.current.delete(card.id);
                      }}
                      className="invisible relative block"
                    >
                      <PlayingCard card={card} medium />
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
                    className="relative hover:z-10 focus-visible:z-10"
                    onClick={() => {
                      if (!playable) return;
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
                {state.phase === "pause" && (
                  <Button
                    variant="parlor"
                    onClick={() =>
                      apply((current) => {
                        const s = { ...current };
                        runShow(s);
                        return s;
                      })
                    }
                  >
                    Display Show
                  </Button>
                )}
                {state.phase === "play" &&
                  state.turn === "player" &&
                  !canPlay(state.playerHand, state.pile.slice(state.runStart)) && (
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
              {state.phase === "cut" && (
                <CutSeat
                  cards={[
                    ...state.cutHistory.player,
                    ...(cutSeated.player && state.playerCut ? [state.playerCut] : []),
                  ]}
                  seatRef={playerSeatRef}
                />
              )}
              <div className="relative">
                <Seat
                  name={playerName}
                  isDealer={state.dealer === "player" && state.phase !== "cut"}
                  flag={flag}
                  onFlagClick={() => setFlagOpen(true)}
                  nameTrigger={
                    <NicknameDialog
                      onSaved={setPlayerName}
                      trigger={
                        <button type="button" className="text-sm text-cream hover:text-gold">
                          {playerName}
                        </button>
                      }
                    />
                  }
                  avatar={
                    <PlayerAvatar
                      avatar={avatar}
                      onSelect={setAvatar}
                      size="size-[45px] sm:size-[72px]"
                      countdown={state.turn === "player" ? countdown : 0}
                    />
                  }
                />
                {countBubble && laidBy === "player" ? (
                  <div className="animate-scale-in pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2">
                    <SpeechBubble text={countBubble.text} tail="down-left" textClassName="font-display text-lg" />
                  </div>
                ) : null}
              </div>
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
  // Render the card at its destination variant so it lands at the exact same
  // size as the cards already sitting there (all variants are 72px on desktop).
  const v = flight.variant;
  const half = v === "half";
  const medium = v === "medium";
  const table = v === "table";
  const crib = v === "crib";
  const cut = v === "cut";
  const duration = flight.durationMs ?? (crib ? 1000 : 500);
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed transition-transform ease-out ${flight.behind ? "z-0" : "z-50"}`}
      style={{
        left: flight.from.x,
        top: flight.from.y,
        transformOrigin: "top left",
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        transitionDuration: `${duration}ms`,
      }}
    >
      {flight.faceDown ? (
        <FaceDownCard half={half} medium={medium} table={table} crib={crib} cut={cut} />
      ) : (
        <PlayingCard card={flight.card} half={half} medium={medium} table={table} crib={crib} cut={cut} />
      )}
    </div>
  );
}

/** Stack of face-down cards representing the deck, with the cut card sitting on top. */
function DeckStack({ remaining, starter, deckRef }: { remaining: number; starter: Card | null; deckRef?: React.RefObject<HTMLDivElement | null> }) {
  const layers = Math.min(4, Math.max(1, Math.ceil(remaining / 10)));
  return (
    <div className="text-center">
      <div ref={deckRef} className="relative h-[77px] w-[53px] sm:h-[95px] sm:w-[65px]">
        {Array.from({ length: layers }).map((_, index) => (
          <span
            key={index}
            className="absolute inset-0"
            style={{ transform: `translate(${index * 2}px, ${-index * 2}px)` }}
          >
            <FaceDownCard table />
          </span>
        ))}
        {starter ? (
          <span
            className="animate-turn-over absolute inset-0"
            style={{ transform: "translate(11px, -11px)" }}
          >
            <PlayingCard card={starter} table />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A seat's drawn card during the cut for deal. */
function CutSeat({
  cards,
  seatRef,
}: {
  cards: Card[];
  seatRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={seatRef} className="flex h-[99px] min-w-[68px]">
      {cards.map((card) => (
        <span key={card.id} className="block [&:not(:first-child)]:-ml-[57px]">
          <PlayingCard card={card} cut />
        </span>
      ))}
    </div>
  );
}

function Seat({
  name,
  isDealer,
  avatar,
  flag,
  nameTrigger,
  onFlagClick,
  hideFlag = false,
}: {
  name: string;
  isDealer: boolean;
  avatar?: React.ReactNode;
  flag?: string | null;
  nameTrigger?: React.ReactNode;
  onFlagClick?: () => void;
  hideFlag?: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="relative">
        {avatar ?? (
          <span className="grid size-8 place-items-center rounded-full bg-gold/20 font-display text-sm text-gold ring-1 ring-gold/40">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        {isDealer && (
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-brand ring-1 ring-brand/30">
            Dealer
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {nameTrigger ?? <span className="text-sm text-cream">{name}</span>}
        <PlayerFlag flag={flag} onClick={onFlagClick} hide={hideFlag} />
      </div>
    </div>
  );
}

function FaceDownCard({
  small = false,
  tiny = false,
  half = false,
  crib = false,
  medium = false,
  xs = false,
  opp = false,
  table = false,
  cut = false,
  deck = false,
}: {
  small?: boolean;
  tiny?: boolean;
  half?: boolean;
  crib?: boolean;
  medium?: boolean;
  xs?: boolean;
  opp?: boolean;
  table?: boolean;
  cut?: boolean;
  deck?: boolean;
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
                : table
                  ? "h-[77px] w-[53px] sm:h-[95px] sm:w-[65px]"
                  : cut
                    ? "h-[99px] w-[68px] scale-[0.9215]"
                    : deck
                      ? "h-[95px] w-[65px] sm:h-[105px] sm:w-[72px]"
                      : crib
                      ? "h-[43px] w-[30px] sm:h-[105px] sm:w-[72px]"
                      : half
                      ? "h-[43px] w-[30px] sm:h-[105px] sm:w-[72px]"
                      : medium
                      ? "h-[74px] w-[50px] sm:h-[95px] sm:w-[65px]"
                      : "h-24 w-16"
      }`}
    />
  );
}

function CardChip({ card }: { card: Card }) {
  const red = card.suit === "H" || card.suit === "D";
  return (
    <span className="inline-flex items-center rounded border border-black/10 bg-white px-1.5 py-0.5 font-display text-xs font-bold leading-none shadow-sm">
      <span className={red ? "text-destructive" : "text-ink"}>
        <span className="font-[Times_New_Roman,serif]">{RANK_LABEL[card.rank]}</span>
        {SUIT_SYMBOL[card.suit]}
      </span>
    </span>
  );
}

function PlayingCard({
  card,
  small = false,
  tiny = false,
  half = false,
  crib = false,
  medium = false,
  xs = false,
  opp = false,
  table = false,
  cut = false,
  deck = false,
  selected = false,
}: {
  card: Card;
  small?: boolean;
  tiny?: boolean;
  half?: boolean;
  crib?: boolean;
  medium?: boolean;
  xs?: boolean;
  opp?: boolean;
  table?: boolean;
  cut?: boolean;
  deck?: boolean;
  selected?: boolean;
}) {
  const red = card.suit === "H" || card.suit === "D";
  const rank = RANK_LABEL[card.rank];
  const suit = SUIT_SYMBOL[card.suit];
  const isFace = card.rank > 10;
  return (
    <span
      className={`relative block overflow-hidden rounded-lg border bg-white shadow-md shadow-black/30 transition-transform ${
        tiny
          ? "h-12 w-8"
          : xs
            ? "h-[58px] w-10"
            : opp
              ? "h-[62px] w-[42px]"
              : small
                ? "h-[77px] w-[53px]"
                : table
                  ? "h-[77px] w-[53px] sm:h-[95px] sm:w-[65px]"
                  : cut
                    ? "h-[99px] w-[68px] scale-[0.9215]"
                    : deck
                      ? "h-[95px] w-[65px] sm:h-[105px] sm:w-[72px]"
                      : crib
                      ? "h-[43px] w-[30px] sm:h-[105px] sm:w-[72px]"
                      : half
                      ? "h-[43px] w-[30px] sm:h-[105px] sm:w-[72px]"
                      : medium
                      ? "h-[74px] w-[50px] sm:h-[95px] sm:w-[65px]"
                      : "h-24 w-16 hover:-translate-y-1"
      } ${selected ? "animate-float-selected border-gold ring-2 ring-gold" : "border-black/10"} ${
        red ? "text-destructive" : "text-ink"
      }`}
    >
      {/* corner index */}
      <span
        className={`absolute left-1 top-0.5 flex flex-col items-center leading-none font-display font-bold ${
          tiny
            ? "text-[8px]"
            : half || crib
              ? "text-[8px] sm:text-[16px]"
              : xs
                ? "text-[9px]"
                : opp
                  ? "text-[10px]"
                  : small
                    ? "text-xs"
                    : table || cut || deck
                      ? "text-[15px]"
                      : medium
                        ? "text-[15px] sm:text-[16px]"
                        : "text-xs"
        }`}
      >
        <span className="font-[Times_New_Roman,serif]">{rank}</span>
        <span
          className={
            tiny
              ? "text-[7px]"
              : half || crib
                ? "text-[7px] sm:text-[15px]"
                : xs
                  ? "text-[8px]"
                  : opp
                    ? "text-[9px]"
                    : small
                      ? "text-[11px]"
                      : table || cut || deck
                        ? "text-[14px]"
                        : medium
                          ? "text-[14px] sm:text-[15px]"
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
            : half || crib
              ? "text-lg sm:text-[39px]"
            : xs
              ? "text-xl"
              : opp
                ? "text-[22px]"
                : small
                  ? "text-[28px]"
                  : table || cut || deck
                    ? "text-[35px]"
                    : medium
                      ? "text-[35px] sm:text-[39px]"
                      : "text-4xl"
        } ${isFace ? "opacity-90" : "opacity-80"}`}
      >
        {isFace ? (
          <span className="flex flex-col items-center leading-none">
            <span
              className={
                tiny
                  ? "text-xs"
                  : half || crib
                    ? "text-xs sm:text-[28px]"
                  : xs
                    ? "text-sm"
                    : opp
                      ? "text-[14px]"
                      : small
                        ? "text-lg"
                        : table || cut || deck
                          ? "text-[23px]"
                          : medium
                            ? "text-[23px] sm:text-[28px]"
                            : "text-xl"
              }
            >
              {rank}
            </span>
            <span
              className={
                tiny
                  ? "text-sm"
                  : half || crib
                    ? "text-sm sm:text-[30px]"
                  : xs
                    ? "text-base"
                    : opp
                      ? "text-[18px]"
                      : small
                        ? "text-[22px]"
                        : table || cut || deck
                          ? "text-[28px]"
                          : medium
                            ? "text-[28px] sm:text-[30px]"
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
            : half || crib
              ? "text-[8px] sm:text-[16px]"
              : xs
                ? "text-[9px]"
                : opp
                  ? "text-[10px]"
                  : small
                    ? "text-xs"
                    : table || cut || deck
                      ? "text-[15px]"
                      : medium
                        ? "text-[15px] sm:text-[16px]"
                        : "text-xs"
        }`}
      >
        <span className="font-[Times_New_Roman,serif]">{rank}</span>
        <span
          className={
            tiny
              ? "text-[7px]"
              : half || crib
                ? "text-[7px] sm:text-[15px]"
                : xs
                  ? "text-[8px]"
                  : opp
                    ? "text-[9px]"
                    : small
                      ? "text-[11px]"
                      : table || cut || deck
                        ? "text-[14px]"
                        : medium
                          ? "text-[14px] sm:text-[15px]"
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
