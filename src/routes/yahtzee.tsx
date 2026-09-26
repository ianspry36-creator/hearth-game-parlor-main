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
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { CountdownBadge } from "@/components/parlor/CountdownBadge";
import { TurnOffTimerControl } from "@/components/parlor/TurnOffTimerControl";
import { SpeechBubble } from "@/components/parlor/SpeechBubble";
import { getGame } from "@/lib/games";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
import { readFlag } from "@/lib/flags";
import { FlagPicker } from "@/components/parlor/FlagPicker";
import { PlayerFlag } from "@/components/parlor/PlayerFlag";
import { NicknameDialog } from "@/components/parlor/NicknameDialog";
import { getNickname, RECONNECT_SECONDS, TURN_WARNING_SECONDS, useMatch, useTurnTimer } from "@/lib/multiplayer";
import { useRecordMatchResult } from "@/lib/stats";
import {
  CATEGORY_LABELS,
  DICE_COUNT,
  LOWER,
  MAX_ROLLS,
  UPPER,
  bestCategory,
  bestHold,
  bonusFor,
  cardComplete,
  grandTotal,
  jokerTargets,
  rollFace,
  scoreMove,
  upperTotal,
  type Card,
  type Category,
  type YDie,
} from "@/lib/yahtzee";

export const Route = createFileRoute("/yahtzee")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Play Yahtzee — Cards and Games" },
      {
        name: "description",
        content:
          "Roll five dice against Ada or a live opponent: hold what you need, fill thirteen boxes and chase the fifty-point Yahtzee.",
      },
      { property: "og:title", content: "Play Yahtzee — Cards and Games" },
      {
        property: "og:description",
        content: "Yahtzee in the parlor: three throws a turn, thirteen boxes, one scorecard each.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: YahtzeeTable,
});

type Seat = "human" | "cpu";
type LogEntry = { side: Seat | null; text: string };

type State = {
  phase: "rolloff" | "play" | "over";
  turn: Seat;
  rolloff: { human: number | null; cpu: number | null };
  pendingFirst: Seat | null;
  rolloffSettled: { human: boolean; cpu: boolean };
  dice: YDie[];
  rolls: number;
  cards: { human: Card; cpu: Card };
  log: LogEntry[];
  winner: Seat | null;
  rematch: Seat | null;
  draw: boolean;
  timedOut: boolean;
  timerOff: boolean;
  timerRequest: Seat | null;
  timerProposed: boolean;
  timerDeclined: boolean;
  timerAgreed: boolean;
};

const blankDice = (): YDie[] =>
  Array.from({ length: DICE_COUNT }, () => ({ face: 1, held: false }));

// Deterministic pseudo-random in [0, 1) so each die keeps its landing angle/offset
// across re-renders, but re-rolls (a new face) settle in a fresh scattered position.
const jitter = (n: number) => {
  const x = Math.sin(n) * 43758.5453;
  return x - Math.floor(x);
};

const scatterFor = (index: number, face: number) => {
  const angle = (jitter(index * 7.31 + face * 3.73) - 0.5) * 44; // ±22°
  const dx = (jitter(index * 11.17 + face * 5.11) - 0.5) * 28; // ±14px
  const dy = (jitter(index * 13.9 + face * 7.9) - 0.5) * 24; // ±12px
  return { angle: Math.round(angle), dx: Math.round(dx), dy: Math.round(dy) };
};

// Fixed, well-separated landing slots (percent of the throwing area) so thrown
// dice never overlap, regardless of their faces.
const DICE_SLOTS = [
  { left: 16, top: 30 },
  { left: 50, top: 20 },
  { left: 84, top: 32 },
  { left: 33, top: 76 },
  { left: 67, top: 76 },
];

// Deterministically shuffle the slot indices for a given roll seed so each
// throw scatters the dice into a fresh, still non-overlapping arrangement.
// The seed is the throw number, so a re-roll (2nd/3rd throw) lands the dice in
// different slots, while holding a die (which doesn't change the throw number)
// never disturbs its neighbours.
const shuffledSlots = (seed: number): number[] => {
  const order = DICE_SLOTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const r = Math.floor(jitter(seed * 31.7 + i * 7.13) * (i + 1));
    const tmp = order[i]!;
    order[i] = order[r]!;
    order[r] = tmp;
  }
  return order;
};

// Landing spot for a die: a given slot plus a small face-based jitter and
// rotation. Slots are far enough apart that jittered dice never overlap.
// Deterministic per (index, face, slotIndex).
const scatterSpot = (index: number, face: number, slotIndex: number) => {
  const slot = DICE_SLOTS[slotIndex % DICE_SLOTS.length]!;
  const jx = (jitter(index * 19.73 + face * 3.07) - 0.5) * 10; // ±5%
  const jy = (jitter(index * 27.61 + face * 5.53) - 0.5) * 10; // ±5%
  const angle = (jitter(index * 7.31 + face * 3.73) - 0.5) * 44; // ±22°
  return { left: slot.left + jx, top: slot.top + jy, angle: Math.round(angle) };
};

const freshState = (): State => ({
  phase: "rolloff",
  turn: "human",
  rolloff: { human: null, cpu: null },
  pendingFirst: null,
  rolloffSettled: { human: false, cpu: false },
  dice: blankDice(),
  rolls: 0,
  cards: { human: {}, cpu: {} },
  log: [{ side: null, text: "Highest roll goes first. Roll the dice." }],
  winner: null,
  rematch: null,
  draw: false,
  timedOut: false,
  timerOff: false,
  timerRequest: null,
  timerProposed: false,
  timerDeclined: false,
  timerAgreed: false,
});

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);
const flip = (side: Seat): Seat => (side === "human" ? "cpu" : "human");

// Truncate a long nickname for the narrow scorecard column to three characters.
const shortName = (name: string) => (name.length > 3 ? name.slice(0, 3) : name);

// Ordinal suffix for Ada's throw announcements ("2nd throw", "3rd throw").
const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : "3rd");

function rollOff(current: State, solo: boolean): State {
  const human = rollFace();
  const cpu = solo ? rollFace() : current.rolloff.cpu;
  const logged = note(current.log, {
    side: "human",
    text: `throw a ${human} for the first turn.`,
  });
  return {
    ...current,
    rolloff: { human, cpu },
    log: solo
      ? note(logged, { side: "cpu", text: `throw a ${cpu} for the first turn.` })
      : logged,
  };
}

function mirror(state: State): State {
  return {
    ...state,
    rolloff: { human: state.rolloff.cpu, cpu: state.rolloff.human },
    rolloffSettled: { human: state.rolloffSettled.cpu, cpu: state.rolloffSettled.human },
    cards: { human: state.cards.cpu, cpu: state.cards.human },
    turn: flip(state.turn),
    pendingFirst: state.pendingFirst ? flip(state.pendingFirst) : null,
    winner: state.winner ? flip(state.winner) : null,
    rematch: state.rematch ? flip(state.rematch) : null,
    timerRequest: state.timerRequest ? flip(state.timerRequest) : null,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? flip(entry.side) : null })),
  };
}

function YahtzeeTable() {
  const game = getGame("yahtzee");
  const navigate = useNavigate();
  const { opponent, match: matchId } = Route.useSearch();
  const [state, setState] = useState<State>(freshState);
  const {
    match,
    isHost,
    opponentName: liveOpponent,
    opponentAvatar,
    opponentConnected,
    remoteState,
    publish,
    opponentDisconnected,
    disconnectSecondsLeft,
    disconnectExpired,
  } = useMatch<State>(matchId, Boolean(state.winner));
  const stateRef = useRef(state);
  const proposedTimerOffRef = useRef(false);
  stateRef.current = state;
  // While a rematch is being negotiated the match row must stay open: treat the
  // game as unfinished so the delayed "completed" write doesn't fire and bounce
  // both players back to the game room mid-rematch.
  useRecordMatchResult(
    match,
    isHost,
    state.rematch ? null : state.winner,
    matchId ? RECONNECT_SECONDS * 1000 : 0,
  );

  const isMulti = Boolean(matchId);
  const opponentName = liveOpponent ?? opponent ?? "Ada";
  const [playerName, setPlayerName] = useState(() => getNickname() ?? "You");

  const apply = (fn: (current: State) => State) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (isMulti) void publish(isHost ? next : mirror(next));
  };

  // Live matches run a 1-minute clock on the active seat; running out forfeits
  // the game to the other player.
  const turnSecondsLeft = useTurnTimer({
    enabled: isMulti && opponentConnected && state.phase === "play" && !state.winner && !state.timerOff,
    turn: state.turn,
    paused: state.timerRequest !== null,
    onTimeout: () =>
      apply((current) => ({
        ...current,
        phase: "over",
        winner: flip(current.turn),
        timedOut: true,
        log: note(current.log, {
          side: current.turn,
          text: `${current.turn === "human" ? playerName : opponentName} ran out of time.`,
        }),
      })),
  });
  const countdown = turnSecondsLeft > 0 && turnSecondsLeft <= TURN_WARNING_SECONDS ? turnSecondsLeft : 0;

  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);
  const [flag, setFlag] = useState<string | null>(readFlag);
  const [flagOpen, setFlagOpen] = useState(false);
  const [viewingScorecard, setViewingScorecard] = useState(false);

  const reset = () => {
    proposedTimerOffRef.current = false;
    const fresh = freshState();
    stateRef.current = fresh;
    setState(fresh);
    setViewingScorecard(false);
    if (isMulti) void publish(isHost ? fresh : mirror(fresh));
  };

  // Rematch: the local player asks the opponent to play another game.
  const requestRematch = () => {
    if (!isMulti) return;
    apply((current) => ({ ...current, rematch: "human" }));
  };

  // The opponent declined our rematch — both players return to the final score.
  const declineRematch = () => {
    if (!isMulti) return;
    apply((current) => ({ ...current, rematch: null }));
  };

  // The opponent accepted — start a fresh game for both players.
  const acceptRematch = () => {
    if (!isMulti) return;
    reset();
  };

  // The host opens a fresh live table.
  useEffect(() => {
    if (!isMulti || !match || match.state || !isHost) return;
    const fresh = freshState();
    stateRef.current = fresh;
    setState(fresh);
    void publish(fresh);
  }, [isMulti, match, isHost, publish]);

  // Read the shared table from our own seat.
  useEffect(() => {
    if (!isMulti || !remoteState) return;
    const view = isHost ? remoteState : mirror(remoteState);
    stateRef.current = view;
    setState(view);
  }, [isMulti, isHost, match?.version, remoteState]);

  const throwDice = (current: State, side: Seat): State => {
    const dice = current.dice.map((d) => (d.held ? d : { face: rollFace(), held: false }));
    return {
      ...current,
      dice,
      rolls: current.rolls + 1,
      log: note(current.log, {
        side,
        text: `throw ${dice.map((d) => d.face).join(" · ")}.`,
      }),
    };
  };

  const takeBox = (current: State, side: Seat, category: Category): State => {
    const faces = current.dice.map((d) => d.face);
    const prevCard = current.cards[side];
    const { score, yahtzeeBonus } = scoreMove(category, faces, prevCard);
    const card: Card = { ...prevCard, [category]: score };
    if (yahtzeeBonus > 0) card.yahtzee = (prevCard.yahtzee ?? 0) + yahtzeeBonus;
    const cards = { ...current.cards, [side]: card };
    const logged: State = {
      ...current,
      cards,
      log: note(current.log, {
        side,
        text:
          yahtzeeBonus > 0
            ? `take ${CATEGORY_LABELS[category]} for ${score} (+100 Yahtzee bonus).`
            : `take ${CATEGORY_LABELS[category]} for ${score}.`,
      }),
    };
    if (cardComplete(cards.human) && cardComplete(cards.cpu)) {
      const mine = grandTotal(cards.human);
      const theirs = grandTotal(cards.cpu);
      return {
        ...logged,
        phase: "over",
        dice: blankDice(),
        rolls: 0,
        winner: mine === theirs ? null : mine > theirs ? "human" : "cpu",
        draw: mine === theirs,
      };
    }
    return { ...logged, turn: flip(current.turn), dice: blankDice(), rolls: 0 };
  };

  const myTurn = state.turn === "human" && state.phase === "play";
  const faces = state.dice.map((d) => d.face);
  const canRoll = myTurn && state.rolls < MAX_ROLLS;

  // Dice land in the middle of the table for a beat, then settle into the seat's box.
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    if (state.rolls === 0 || state.phase !== "play") {
      setRolling(false);
      return;
    }
    setRolling(true);
    const timer = setTimeout(() => setRolling(false), 900);
    return () => clearTimeout(timer);
  }, [state.rolls, state.turn, state.phase]);


  const roll = () => {
    if (!canRoll) return;
    apply((current) => throwDice(current, "human"));
  };

  // Chat cloud prompting the player to throw for first turn, shown beside their avatar.
  const [bubble, setBubble] = useState<{ side: Seat; text: string } | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showBubble = (side: Seat, text: string, duration = 5000) => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    setBubble({ side, text });
    bubbleTimer.current = setTimeout(() => setBubble(null), duration);
  };
  useEffect(
    () => () => {
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    },
    [],
  );

  // First seat to render for the roll-off. Both players throw at the same time,
  // so this only orders the settle animation and the solo throw gate.
  const rolloffFirst: Seat = isMulti && !isHost ? "cpu" : "human";
  const rolloffSecond: Seat = flip(rolloffFirst);

  const rolloffWinner: Seat | null =
    state.rolloff.human !== null && state.rolloff.cpu !== null && state.rolloff.human !== state.rolloff.cpu
      ? state.rolloff.human > state.rolloff.cpu
        ? "human"
        : "cpu"
      : null;

  // Whose die is up: the first roller until their die flies to their seat, then
  // the second roller until they throw.
  const rolloffTurn: Seat | null =
    state.phase !== "rolloff"
      ? null
      : !state.rolloffSettled[rolloffFirst]
        ? rolloffFirst
        : (rolloffSecond === "human" ? state.rolloff.human : state.rolloff.cpu) === null
          ? rolloffSecond
          : null;

  // The local player may throw while their own die is still blank. Both
  // players throw at once to decide who goes first.
  const canRollOff =
    state.phase === "rolloff" &&
    state.rolloff.human === null &&
    (isMulti || rolloffTurn === "human");

  // Before the opening roll-off, prompt the active player to throw.
  useEffect(() => {
    if (state.phase === "rolloff" && canRollOff) {
      showBubble("human", "Throw dice to decide who goes first");
    }
  }, [state.phase, canRollOff]);

  // Label for the rolloff button: prompt the active player, show their die in
  // flight, and a waiting state while the opponent throws.
  const rolloffLabel =
    state.rolloff.human !== null && !state.rolloffSettled.human
      ? "Rolling…"
      : canRollOff
        ? "Roll for first turn"
        : "Waiting…";
  const rollForFirst = () => {
    if (!canRollOff) return;
    apply((current) => rollOff(current, !isMulti));
  };

  // Each rolloff die lands scattered in the throwing area, then after a beat flies
  // to its owner's seat. Once the second die has flown, the rolloff resolves: a
  // tie clears both dice for a re-roll, otherwise the higher roller goes first.
  useEffect(() => {
    if (isMulti && !isHost) return;
    if (state.phase !== "rolloff") return;
    const pending: Seat | null =
      state.rolloff.human !== null && !state.rolloffSettled.human
        ? "human"
        : state.rolloff.cpu !== null && !state.rolloffSettled.cpu
          ? "cpu"
          : null;
    if (pending === null) return;
    const timer = setTimeout(() => {
      apply((current) => {
        if (current.phase !== "rolloff") return current;
        const value = pending === "human" ? current.rolloff.human : current.rolloff.cpu;
        const alreadySettled =
          pending === "human" ? current.rolloffSettled.human : current.rolloffSettled.cpu;
        if (value === null || alreadySettled) return current;
        const settled = { ...current.rolloffSettled, [pending]: true };
        const hh = current.rolloff.human;
        const cc = current.rolloff.cpu;
        if (settled.human && settled.cpu && hh !== null && cc !== null) {
          if (hh === cc) {
            return {
              ...current,
              rolloff: { human: null, cpu: null },
              rolloffSettled: { human: false, cpu: false },
              log: note(current.log, { side: null, text: `Tie at ${hh} — roll again.` }),
            };
          }
          const first: Seat = hh > cc ? "human" : "cpu";
          return {
            ...current,
            rolloffSettled: settled,
            pendingFirst: first,
            log: note(current.log, {
              side: first,
              text: `win the rolloff ${hh}-${cc} and take the first turn.`,
            }),
          };
        }
        return { ...current, rolloffSettled: settled };
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [isMulti, isHost, state.phase, state.rolloffSettled, state.rolloff.human, state.rolloff.cpu]);

  // The rolloff winner announces they go first, then main play begins after a pause.
  useEffect(() => {
    if (state.phase !== "rolloff" || state.pendingFirst === null) return;
    showBubble(state.pendingFirst, "I win dice roll. I go first", 3000);
  }, [state.phase, state.pendingFirst]);

  useEffect(() => {
    if (isMulti && !isHost) return;
    if (state.phase !== "rolloff" || state.pendingFirst === null) return;
    const first = state.pendingFirst;
    const timer = setTimeout(() => {
      apply((current) => {
        if (current.phase !== "rolloff" || current.pendingFirst !== first) return current;
        return { ...current, phase: "play", turn: first, pendingFirst: null, rolloffSettled: { human: false, cpu: false } };
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [isMulti, isHost, state.phase, state.pendingFirst]);

  // Announce each filled scorecard box in a speech bubble for a moment.
  const prevCardsRef = useRef(state.cards);
  useEffect(() => {
    const prev = prevCardsRef.current;
    (["human", "cpu"] as const).forEach((side) => {
      const card = state.cards[side];
      const before = prev[side];
      for (const category of [...UPPER, ...LOWER]) {
        if (card[category] !== undefined && before[category] === undefined) {
          showBubble(side, `${CATEGORY_LABELS[category]}: ${card[category]}`, 1000);
        }
      }
    });
    prevCardsRef.current = state.cards;
  }, [state.cards]);

  // Once the player has used all their throws and still hasn't scored, nudge
  // them to pick a box, repeating every fifteen seconds until they do.
  useEffect(() => {
    if (!myTurn || state.rolls < MAX_ROLLS) return;
    showBubble("human", "Select your score on the score card", 3000);
    const interval = setInterval(() => {
      showBubble("human", "Select your score on the score card", 3000);
    }, 15000);
    return () => clearInterval(interval);
  }, [myTurn, state.rolls]);

  const toggleHold = (index: number) => {
    if (!myTurn || state.rolls === 0) return;
    apply((current) => ({
      ...current,
      dice: current.dice.map((d, i) => (i === index ? { ...d, held: !d.held } : d)),
    }));
  };

  const take = (category: Category) => {
    if (!myTurn || state.rolls === 0) return;
    if (state.cards.human[category] !== undefined) return;
    const targets = jokerTargets(state.cards.human, faces);
    if (targets !== null && !targets.includes(category)) return;
    apply((current) => takeBox(current, "human", category));
  };

  // Ada's turn, one step at a time (solo play only). Once she has kept her
  // dice she announces the next throw in a speech bubble, then pauses two
  // seconds before the dice actually roll again.
  const adaSelectedRef = useRef(false);
  useEffect(() => {
    if (isMulti) return;
    if (state.phase !== "play" || state.turn !== "cpu") return;
    const timer = setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== "play" || current.turn !== "cpu") return;
      let next: State;
      if (current.rolls === 0) {
        // Opening throw — nothing to "throw again" yet.
        next = throwDice(current, "cpu");
        adaSelectedRef.current = false;
      } else if (!adaSelectedRef.current) {
        // Keep the dice Ada wants, then announce the next throw.
        const currentFaces = current.dice.map((d) => d.face);
        const hold = bestHold(currentFaces, current.cards.cpu);
        if (current.rolls >= MAX_ROLLS || hold.length === DICE_COUNT) {
          next = takeBox(current, "cpu", bestCategory(currentFaces, current.cards.cpu));
          adaSelectedRef.current = false;
        } else {
          next = {
            ...current,
            dice: current.dice.map((d, i) => ({ ...d, held: hold.includes(i) })),
          };
          adaSelectedRef.current = true;
          showBubble("cpu", `Throwing again...${ordinal(current.rolls + 1)} throw.`, 2000);
        }
      } else {
        // Re-throw after the two-second announcement pause.
        next = throwDice(current, "cpu");
        adaSelectedRef.current = false;
      }
      stateRef.current = next;
      setState(next);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isMulti, state.phase, state.turn, state.rolls, state.dice]);

  const logLine = (entry: LogEntry) =>
    entry.side === null
      ? entry.text
      : entry.side === "human"
        ? `You ${entry.text}`
        : `${opponentName} ${entry.text}`;

  const status =
    isMulti && !match
      ? "Opening the shared table…"
      : state.phase === "rolloff"
        ? rolloffWinner !== null
          ? rolloffWinner === "human"
            ? "You go first"
            : `${opponentName} goes first`
          : state.rolloff.human !== null && state.rolloff.cpu !== null
            ? "Tie — roll again"
            : "Highest roll goes first"
        : state.phase === "over"
          ? state.draw
          ? "A dead heat — honours shared"
          : state.winner === "human"
            ? "You take the scorecard — you win"
            : `${opponentName} takes the scorecard`
        : myTurn
          ? state.rolls === 0
            ? ""
            : state.rolls >= MAX_ROLLS
              ? "Last throw — choose a box"
              : `${MAX_ROLLS - state.rolls} throw${
                  MAX_ROLLS - state.rolls === 1 ? "" : "s"
                } left`
          : isMulti
            ? `Waiting for ${opponentName}…`
            : "Rattling the cup…";

  const myCard = state.cards.human;
  const theirCard = state.cards.cpu;

  const canToggle = myTurn && state.rolls > 0 && !rolling;

  // Track which dice just switched between the throwing area and a seat's
  // kept dice, so we can animate the move. The "animating" sets persist across
  // re-renders (e.g. the one the rolling indicator triggers) so an animation
  // isn't cancelled mid-flight, and are cleared once it has finished.
  const animating = useRef<{ released: Set<number> }>({
    released: new Set(),
  });
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDiceRef = useRef<YDie[]>(state.dice);
  const heldOrderRef = useRef<number[]>([]);
  const centerDieElsRef = useRef<Map<number, HTMLElement>>(new Map());
  const seatDieElsRef = useRef<Map<number, HTMLElement>>(new Map());
  const centerRectsRef = useRef<Map<number, DOMRect>>(new Map());
  const justHeldRef = useRef<number[]>([]);
  const rolloffCenterElsRef = useRef<Map<Seat, HTMLElement>>(new Map());
  const rolloffSeatElsRef = useRef<Map<Seat, HTMLElement>>(new Map());
  const rolloffCenterRectsRef = useRef<Map<Seat, DOMRect>>(new Map());
  const justSettledRef = useRef<Seat[]>([]);
  const prevRolloffSettledRef = useRef(state.rolloffSettled);

  const heldNow = new Set<number>();
  const releasedNow = new Set<number>();
  state.dice.forEach((d, i) => {
    const p = prevDiceRef.current[i];
    if (p && p.held !== d.held) (d.held ? heldNow : releasedNow).add(i);
  });
  if (heldNow.size || releasedNow.size) {
    // Track the order dice are kept so newly kept dice join the right-hand
    // end of the seat instead of shoving the existing dice along.
    heldOrderRef.current = heldOrderRef.current.filter((i) => !releasedNow.has(i));
    [...heldNow]
      .sort((a, b) => a - b)
      .forEach((i) => {
        if (!heldOrderRef.current.includes(i)) heldOrderRef.current.push(i);
      });
    // Dice held this render will fly from the throwing area into their seat.
    justHeldRef.current = [...heldNow].sort((a, b) => a - b);
    releasedNow.forEach((i) => animating.current.released.add(i));
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => {
      animating.current.released.clear();
    }, 1900);
  }
  prevDiceRef.current = state.dice;

  // Which rolloff dice just finished scattering and are flying to their seat.
  const settledNow: Seat[] = [];
  (["human", "cpu"] as const).forEach((side) => {
    if (!prevRolloffSettledRef.current[side] && state.rolloffSettled[side]) settledNow.push(side);
  });
  if (settledNow.length) justSettledRef.current = settledNow;
  prevRolloffSettledRef.current = state.rolloffSettled;

  const animReleased = animating.current.released;

  useEffect(
    () => () => {
      if (animTimer.current) clearTimeout(animTimer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    // Record where each centre die currently sits so a held die can fly from
    // that exact landed spot into its seat.
    centerDieElsRef.current.forEach((el, i) => {
      centerRectsRef.current.set(i, el.getBoundingClientRect());
    });

    // Fly freshly held dice from their recorded centre position to the seat.
    const mine = state.turn === "human";
    justHeldRef.current.forEach((i, slot) => {
      const el = seatDieElsRef.current.get(i);
      const from = centerRectsRef.current.get(i);
      if (!el || !from) return;
      const to = el.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const rot = scatterFor(i, state.dice[i]!.face).angle;
      const delay = mine ? 0 : slot * 300;
      el.animate(
        [
          { opacity: 0, transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(0.55)` },
          { opacity: 1, transform: `translate(${dx * 0.1}px, ${dy * 0.1}px) rotate(${rot * 0.1}deg) scale(1.06)`, offset: 0.7 },
          { opacity: 1, transform: "translate(0px, 0px) rotate(0deg) scale(1)" },
        ],
        { duration: 600, easing: "cubic-bezier(0.33, 0, 0.25, 1)", delay, fill: "both" },
      );
    });
    justHeldRef.current = [];
  });

  useLayoutEffect(() => {
    // Record where each rolloff die currently sits in the throwing area so it
    // can fly from that exact landed spot into its owner's seat once settled.
    rolloffCenterElsRef.current.forEach((el, side) => {
      rolloffCenterRectsRef.current.set(side, el.getBoundingClientRect());
    });

    // Fly freshly settled rolloff dice from their throwing-area spot to the seat.
    justSettledRef.current.forEach((side) => {
      const el = rolloffSeatElsRef.current.get(side);
      const from = rolloffCenterRectsRef.current.get(side);
      if (!el || !from) return;
      const to = el.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const spot =
        side === "human"
          ? state.rolloff.human !== null
            ? scatterSpot(4, state.rolloff.human, 4)
            : null
          : state.rolloff.cpu !== null
            ? scatterSpot(0, state.rolloff.cpu, 0)
            : null;
      const rot = spot?.angle ?? 0;
      el.animate(
        [
          { opacity: 0, transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(0.55)` },
          { opacity: 1, transform: `translate(${dx * 0.1}px, ${dy * 0.1}px) rotate(${rot * 0.1}deg) scale(1.06)`, offset: 0.7 },
          { opacity: 1, transform: "translate(0px, 0px) rotate(0deg) scale(1)" },
        ],
        { duration: 600, easing: "cubic-bezier(0.33, 0, 0.25, 1)", fill: "both" },
      );
    });
    justSettledRef.current = [];
  });

  // Slots are shuffled per throw so a re-roll lands the dice in fresh spots.
  const slotOrder = shuffledSlots(state.rolls);

  const dieAt = (index: number, scatter = false, animClass?: string) => {
    const die = state.dice[index]!;
    const face = (
      <DieFace
        face={die.face}
        held={die.held}
        interactive={canToggle}
        onClick={() => toggleHold(index)}
      />
    );
    if (!scatter) {
      // Seat die. The ref lets us measure its resting spot so a held die can
      // fly here from its landed position in the throwing area.
      return (
        <div
          key={index}
          ref={(el) => {
            if (el) seatDieElsRef.current.set(index, el);
            else seatDieElsRef.current.delete(index);
          }}
        >
          {face}
        </div>
      );
    }
    const { left, top, angle } = scatterSpot(index, die.face, slotOrder[index]!);
    return (
      <div
        key={index}
        ref={(el) => {
          if (el) centerDieElsRef.current.set(index, el);
          else centerDieElsRef.current.delete(index);
        }}
        style={{
          position: "absolute",
          left: `${left}%`,
          top: `${top}%`,
          transform: `translate(-50%, -50%) rotate(${angle}deg)`,
        }}
      >
        {animClass ? <span className={`inline-block ${animClass}`}>{face}</span> : face}
      </div>
    );
  };

  const showDice = state.phase === "play" && state.rolls > 0;
  const indexes = state.dice.map((_, i) => i);
  const centreDice = showDice ? indexes.filter((i) => !state.dice[i]!.held) : [];
  const keptDice = showDice ? indexes.filter((i) => state.dice[i]!.held) : [];

  const rolloffHumanSpot = state.rolloff.human !== null ? scatterSpot(4, state.rolloff.human, 4) : null;
  const rolloffCpuSpot = state.rolloff.cpu !== null ? scatterSpot(0, state.rolloff.cpu, 0) : null;

  const seatBox = (side: Seat) => {
    const mine = side === "human";
    const active = state.turn === side && state.phase === "play";
    const rolloffValue = side === "human" ? state.rolloff.human : state.rolloff.cpu;
    const kept = active
      ? [
          ...heldOrderRef.current.filter((i) => state.dice[i]!.held),
          ...keptDice.filter((i) => !heldOrderRef.current.includes(i)),
        ]
      : [];
    return (
      <section
        className={`rounded-2xl border p-3 transition-colors lg:p-5 ${
          active ? "border-gold/50 bg-brand/70" : "border-gold/15 bg-brand/40"
        }`}
      >
        <div className="flex justify-center lg:justify-start">
          <div className="flex flex-col items-center gap-1.5 lg:flex-row lg:gap-3">
            {mine ? (
              <PlayerAvatar
                avatar={playerAvatar}
                onSelect={setPlayerAvatar}
                size="size-12"
                countdown={state.turn === "human" ? countdown : 0}
                {...(bubble?.side === "human" ? { message: bubble.text } : {})}
              />
            ) : (
              <div className="relative inline-block">
                <img
                  src={opponentAvatar ?? ADA_AVATAR}
                  alt={`${opponentName}'s avatar`}
                  width={64}
                  height={64}
                  className="size-[3.75rem] rounded-full border-2 border-gold/40 object-cover"
                />
                {state.turn === "cpu" && countdown > 0 && <CountdownBadge seconds={countdown} />}
                {bubble?.side === "cpu" && (
                  <div className="absolute bottom-full left-full z-10 mb-2 ml-2">
                    <SpeechBubble text={bubble.text} />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              {mine ? (
                <NicknameDialog
                  onSaved={setPlayerName}
                  trigger={
                    <button type="button" className="font-display text-base hover:text-gold">
                      {playerName}
                    </button>
                  }
                />
              ) : (
                <p className="font-display text-base">{opponentName}</p>
              )}
              {mine && <PlayerFlag flag={flag} onClick={() => setFlagOpen(true)} />}
            </div>
          </div>
        </div>
        <div className="mt-4 min-h-[3.04rem] grid place-items-center">
          {kept.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-3">
              {kept.map((i) => dieAt(i, false))}
            </div>
          ) : state.phase === "rolloff" && state.rolloffSettled[side] && rolloffValue !== null ? (
            <div>
              <span
                ref={(el) => {
                  if (el) rolloffSeatElsRef.current.set(side, el);
                  else rolloffSeatElsRef.current.delete(side);
                }}
                className="inline-block"
              >
                <DieFace face={rolloffValue} />
              </span>
            </div>
          ) : (
            <p className="text-xs text-ivory/40">
              {active
                ? "Dice you keep will sit here"
                : state.phase === "rolloff" && rolloffValue !== null
                  ? "Rolling Dice"
                  : "Waiting"}
            </p>
          )}
        </div>
        {mine && (
          <div className="mt-4 flex h-9 flex-wrap items-center gap-3">
            {state.phase === "rolloff" ? (
              state.pendingFirst === null ? (
                <Button variant="parlor" size="sm" onClick={rollForFirst} disabled={!canRollOff}>
                  {rolloffLabel}
                </Button>
              ) : null
            ) : (
              canRoll && !rolling && (
                <Button variant="parlor" size="sm" onClick={roll}>
                  {state.rolls === 0 ? "Throw Dice" : "Throw again"}
                </Button>
              )
            )}
          </div>
        )}
      </section>
    );
  };


  const Row = ({ category }: { category: Category }) => {
    const taken = myCard[category] !== undefined;
    const targets = jokerTargets(myCard, faces);
    const allowed = targets === null || targets.includes(category);
    const score =
      !taken && myTurn && state.rolls > 0 && allowed
        ? scoreMove(category, faces, myCard).score
        : null;
    return (
      <tr>
        <td className="border-b border-r border-gold/40 py-0.5 pr-2 font-bold text-neutral-700 lg:py-2">
          {CATEGORY_LABELS[category]}
        </td>
        <td className="relative h-[1.65rem] border-b border-r border-gold/40 px-2 text-center lg:h-[2.2rem]">
          {taken ? (
            myCard[category] === 0 ? (
              <span className="font-display text-[13px] font-bold text-neutral-900 lg:text-[16px]">0</span>
            ) : (
              <span className="font-display text-[13px] font-bold text-neutral-900 lg:text-[16px]">{myCard[category]}</span>
            )
          ) : score !== null ? (
            score > 0 ? (
              <button
                type="button"
                onClick={() => take(category)}
                className="absolute inset-0 grid cursor-pointer place-items-center font-display text-[13px] font-bold text-red-600 transition-colors hover:text-red-700 lg:text-[16px]"
              >
                {score}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => take(category)}
                aria-label={`Score 0 in ${CATEGORY_LABELS[category]}`}
                className="absolute inset-0 grid cursor-pointer place-items-center transition-colors hover:bg-red-50"
              >
                {/* A score of 0 is left blank until it is selected. */}
              </button>
            )
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </td>
        <td className="h-[1.65rem] border-b border-gold/40 pl-2 text-center lg:h-[2.2rem]">
          {theirCard[category] !== undefined ? (
            theirCard[category] === 0 ? (
              <span className="font-display text-[13px] font-bold text-neutral-700 lg:text-[16px]">0</span>
            ) : (
              <span className="font-display text-[13px] font-bold text-neutral-700 lg:text-[16px]">{theirCard[category]}</span>
            )
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </td>
      </tr>
    );
  };

  const Totals = ({ label, mine, theirs }: { label: string; mine: number; theirs: number }) => (
    <tr className="bg-gold/5">
      <td className="border-b border-r border-gold/50 py-0.5 pr-2 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500 lg:py-2 lg:text-[12px]">
        {label}
      </td>
      <td className="border-b border-r border-gold/50 px-2 py-0.5 text-center font-display text-[13px] font-bold text-neutral-900 lg:py-2 lg:text-[16px]">
        {mine}
      </td>
      <td className="border-b border-gold/50 py-0.5 pl-2 text-center font-display text-[13px] font-bold text-neutral-700 lg:py-2 lg:text-[16px]">
        {theirs}
      </td>
    </tr>
  );

  const scorecard = (
    <div className="origin-top rounded-xl border border-gold/20 bg-white px-1 py-4 lg:p-5">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-ink/70 lg:text-[12px]">Scorecard</p>
      <table className="w-full border-collapse table-fixed text-[11px] lg:table-auto lg:text-[14px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 lg:text-[11px]">
            <th className="w-[52%] border-b border-r border-gold/50 pb-1 pr-2 text-left font-bold lg:w-auto" />
            <th className="w-[23%] border-b border-r border-gold/50 px-2 pb-1 text-center font-bold lg:w-auto">{shortName(playerName)}</th>
            <th className="w-[25%] border-b border-gold/50 pb-1 pl-2 text-center font-bold lg:w-auto">{shortName(opponentName)}</th>
          </tr>
        </thead>
        <tbody>
          {UPPER.map((category) => (
            <Row key={category} category={category} />
          ))}
          <Totals label="Sum" mine={upperTotal(myCard)} theirs={upperTotal(theirCard)} />
          <Totals label="Bonus" mine={bonusFor(myCard)} theirs={bonusFor(theirCard)} />
          {LOWER.map((category) => (
            <Row key={category} category={category} />
          ))}
          <Totals
            label="Total"
            mine={grandTotal(myCard)}
            theirs={grandTotal(theirCard)}
          />
        </tbody>
      </table>
    </div>
  );

  // Rematch flow: "human" means we asked, "cpu" means the opponent asked us.
  const rematchOutgoing = state.rematch === "human";
  const rematchIncoming = state.rematch === "cpu";

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus={status}
      showChat={isMulti}
      opponentDisconnected={opponentDisconnected}
      disconnectSecondsLeft={disconnectSecondsLeft}
      disconnectExpired={disconnectExpired}
      hideOpponent
      gameInProgress={
        state.phase === "play" && (state.rolls > 0 || Object.keys(myCard).length > 0)
      }
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/yahtzee", search: { opponent: nickname, match: newMatchId } });
        reset();
      }}
      onNewGame={() => (isMulti ? navigate({ to: "/yahtzee" }) : reset())}
      middle={scorecard}
      middleGridClassName="lg:grid-cols-[1fr_241px_260px]"
      containerClassName="px-1.5 sm:px-3"
      boxClassName="pt-2.5 pl-1.5 pr-[5px] sm:pt-4 sm:pl-4 sm:pr-2"
      menuExtra={
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
            apply((current) => ({ ...current, timerProposed: true, timerRequest: "human" }));
          }}
          onAccept={() => apply((current) => ({ ...current, timerOff: true, timerAgreed: true, timerRequest: null }))}
          onDecline={() => apply((current) => ({ ...current, timerRequest: null, timerDeclined: true }))}
        />
      }
    >
      <FlagPicker open={flagOpen} onOpenChange={setFlagOpen} onSelect={setFlag} />
      <GameOverDialog
        open={state.phase === "over" && !viewingScorecard}
        result={state.winner === "human" ? "win" : state.winner === "cpu" ? "loss" : "draw"}
        playerScore={grandTotal(myCard)}
        opponentScore={grandTotal(theirCard)}
        scoreLabel="Final scorecard total"
        opponentName={opponentName}
        playerAvatar={playerAvatar}
        timedOut={state.timedOut}
        onPlayAgain={isMulti ? requestRematch : reset}
        playAgainLabel={isMulti ? "Rematch" : "Play again"}
        playAgainDisabled={isMulti && state.rematch !== null}
        {...(rematchOutgoing
          ? { detail: `Rematch request sent — waiting for ${opponentName} to respond…` }
          : {})}
        footerExtra={
          <>
            <Button
              variant="parlorOutline"
              onClick={() => setViewingScorecard(true)}
            >
              View scorecard
            </Button>
            <Button variant="parlorOutline" onClick={() => navigate({ to: "/" })}>
              Back to game room
            </Button>
          </>
        }
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
      <div className="space-y-2.5">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {state.phase === "over" && (
              <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Card full</p>
            )}
          </div>
          {state.phase === "over" && (
            <Button variant="parlor" onClick={isMulti ? requestRematch : reset}>
              Rematch
            </Button>
          )}
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-1.5 lg:block">
          <div className="min-w-0 space-y-2.5">
            {seatBox("cpu")}

            <section className="relative grid h-[11.14rem] place-items-center rounded-2xl border border-dashed border-gold/20 bg-brand/20 p-3 lg:h-[12.77rem] lg:p-6">
              {state.phase === "rolloff" ? (
                <>
                  {state.rolloff.human !== null && !state.rolloffSettled.human && rolloffHumanSpot && (
                    <div
                      ref={(el) => {
                        if (el) rolloffCenterElsRef.current.set("human", el);
                        else rolloffCenterElsRef.current.delete("human");
                      }}
                      style={{
                        position: "absolute",
                        left: `${rolloffHumanSpot.left}%`,
                        top: `${rolloffHumanSpot.top}%`,
                        transform: `translate(-50%, -50%) rotate(${rolloffHumanSpot.angle}deg)`,
                      }}
                    >
                      <span className="inline-block animate-die-to-center-from-below">
                        <DieFace face={state.rolloff.human} />
                      </span>
                    </div>
                  )}
                  {state.rolloff.cpu !== null && !state.rolloffSettled.cpu && rolloffCpuSpot && (
                    <div
                      ref={(el) => {
                        if (el) rolloffCenterElsRef.current.set("cpu", el);
                        else rolloffCenterElsRef.current.delete("cpu");
                      }}
                      style={{
                        position: "absolute",
                        left: `${rolloffCpuSpot.left}%`,
                        top: `${rolloffCpuSpot.top}%`,
                        transform: `translate(-50%, -50%) rotate(${rolloffCpuSpot.angle}deg)`,
                      }}
                    >
                      <span className="inline-block animate-die-to-center-from-above">
                        <DieFace face={state.rolloff.cpu} />
                      </span>
                    </div>
                  )}
                  {state.rolloff.human !== null && state.rolloff.cpu !== null && rolloffWinner === null && (
                    <p className="text-sm text-ivory/55">Tie at {state.rolloff.human} — roll again.</p>
                  )}
                </>
              ) : centreDice.length > 0 ? (
                <div className="absolute inset-0">
                  {centreDice.map((i) =>
                    dieAt(
                      i,
                      true,
                      animReleased.has(i)
                        ? state.turn === "human"
                          ? "animate-die-to-center-from-below"
                          : "animate-die-to-center-from-above"
                        : undefined,
                    )
                  )}
                </div>
              ) : (
                <p className="text-[10px] uppercase tracking-[0.22em] text-ivory/35">
                  {state.rolls === 0 ? "Throwing area" : "Tap a kept die to send it back"}
                </p>
              )}
            </section>

            {seatBox("human")}
          </div>

          <div className="min-w-0 lg:hidden">{scorecard}</div>
        </div>
      </div>
    </TableShell>
  );
}


const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DieFace({
  face,
  held = false,
  interactive = false,
  dim = false,
  rotate,
  onClick,
}: {
  face: number;
  held?: boolean;
  interactive?: boolean;
  dim?: boolean;
  rotate?: number;
  onClick?: () => void;
}) {
  const pips = PIPS[face] ?? [];
  return (
    <button
      type="button"
      aria-label={`Die showing ${face}${held ? ", held" : ""}`}
      aria-pressed={held}
      disabled={!interactive}
      onClick={onClick}
      style={rotate != null ? { transform: `rotate(${rotate}deg)` } : undefined}
      className={`grid size-[1.6rem] lg:size-[2.88rem] rounded-lg border lg:border-2 bg-cream p-1 lg:p-1.5 transition-all ${
        held ? "-translate-y-1.5 border-gold shadow-lg shadow-black/40" : "border-cream/40"
      } ${dim ? "opacity-40" : ""} ${
        interactive ? "cursor-pointer hover:-translate-y-1 hover:border-gold" : "cursor-default"
      }`}
    >
      <span className="grid size-full grid-cols-3 grid-rows-3 gap-px">
        {Array.from({ length: 9 }, (_, cell) => (
          <span
            key={cell}
            className={`m-auto size-[0.2rem] lg:size-[0.36rem] rounded-full ${pips.includes(cell) ? "bg-brand" : ""}`}
          />
        ))}
      </span>
    </button>
  );
}
