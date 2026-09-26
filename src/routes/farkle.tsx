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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { CountdownBadge } from "@/components/parlor/CountdownBadge";
import { TurnOffTimerControl } from "@/components/parlor/TurnOffTimerControl";
import { CryingTears } from "@/components/parlor/CryingTears";
import { SpeechBubble } from "@/components/parlor/SpeechBubble";
import { getGame } from "@/lib/games";
import {
  getNickname,
  RECONNECT_SECONDS,
  TURN_WARNING_SECONDS,
  useMatch,
  useTurnTimer,
} from "@/lib/multiplayer";
import { useRecordMatchResult } from "@/lib/stats";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
import { readFlag } from "@/lib/flags";
import { FlagPicker } from "@/components/parlor/FlagPicker";
import { PlayerFlag } from "@/components/parlor/PlayerFlag";
import { NicknameDialog } from "@/components/parlor/NicknameDialog";
import {
  DICE_COUNT,
  TARGET,
  bestKeep,
  hasScoring,
  rollFace,
  scoreSelection,
  shouldBank,
  type Die,
} from "@/lib/farkle";

export const Route = createFileRoute("/farkle")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Play Farkle — Cards and Games" },
      {
        name: "description",
        content:
          "Throw six dice against Ada or a live opponent: set aside the scorers, press your luck and bank before you farkle.",
      },
      { property: "og:title", content: "Play Farkle — Cards and Games" },
      {
        property: "og:description",
        content: "Farkle in the parlor: six dice, rising piles of points, and the nerve to stop.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FarkleTable,
});

type Seat = "human" | "cpu";
type LogEntry = { side: Seat | null; text: string };

type State = {
  phase: "rolloff" | "play" | "over";
  turn: Seat;
  rolloff: { human: number | null; cpu: number | null };
  scores: { human: number; cpu: number };
  dice: Die[];
  /** Points gathered so far this turn, not yet banked. */
  turnScore: number;
  rolled: boolean;
  farkled: boolean;
  /** True when the current player just cleared all six dice (hot dice). The
   *  re-roll is delayed three seconds so both seats can announce it first. */
  hotDice: boolean;
  /** Dice queued to set aside one at a time during Ada's solo turn. */
  pending: number[];
  /** Points from the queued keep, added once every die has landed. */
  pendingScore: number;
  log: LogEntry[];
  winner: Seat | null;
  rematch: Seat | null;
  timedOut: boolean;
  timerOff: boolean;
  timerRequest: Seat | null;
  timerProposed: boolean;
  timerDeclined: boolean;
  timerAgreed: boolean;
};

const blankDice = (): Die[] => Array.from({ length: DICE_COUNT }, () => ({ face: 1, set: false }));

// Deterministic pseudo-random in [0, 1) so each die keeps its landing angle/offset
// across re-renders, but re-rolls (a new face) settle in a fresh scattered position.
const jitter = (n: number) => {
  const x = Math.sin(n) * 43758.5453;
  return x - Math.floor(x);
};

const scatterFor = (index: number, face: number) => {
  const angle = (jitter(index * 7.31 + face * 3.73) - 0.5) * 44; // ±22°
  // Settle dice on a jittered three-column by two-row grid (percent of the box)
  // so they scatter across the box rather than landing in a single line.
  const col = index % 3;
  const row = Math.floor(index / 3);
  const jx = (jitter(index * 11.17 + face * 5.11) - 0.5) * 16; // ±8%
  const jy = (jitter(index * 13.9 + face * 7.9) - 0.5) * 14; // ±7%
  const x = 18 + col * 32 + jx;
  const y = 28 + row * 44 + jy;
  return { angle: Math.round(angle), x: Math.round(x), y: Math.round(y) };
};

const freshState = (): State => ({
  phase: "rolloff",
  turn: "human",
  rolloff: { human: null, cpu: null },
  scores: { human: 0, cpu: 0 },
  dice: blankDice(),
  turnScore: 0,
  rolled: false,
  farkled: false,
  hotDice: false,
  pending: [],
  pendingScore: 0,
  log: [{ side: null, text: "Highest roll goes first. Throw the dice." }],
  winner: null,
  rematch: null,
  timedOut: false,
  timerOff: false,
  timerRequest: null,
  timerProposed: false,
  timerDeclined: false,
  timerAgreed: false,
});

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);
const flip = (side: Seat): Seat => (side === "human" ? "cpu" : "human");

function rollOff(current: State): State {
  const human = rollFace();
  return {
    ...current,
    rolloff: { ...current.rolloff, human },
    log: note(current.log, { side: "human", text: `throw a ${human} for the first turn.` }),
  };
}

function mirror(state: State): State {
  return {
    ...state,
    rolloff: { human: state.rolloff.cpu, cpu: state.rolloff.human },
    scores: { human: state.scores.cpu, cpu: state.scores.human },
    turn: flip(state.turn),
    rematch: state.rematch ? flip(state.rematch) : null,
    winner: state.winner ? flip(state.winner) : null,
    timerRequest: state.timerRequest ? flip(state.timerRequest) : null,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? flip(entry.side) : null })),
  };
}

const openFaces = (dice: Die[]) => dice.filter((d) => !d.set).map((d) => d.face);

const MELD_VALUES = [
  { meld: "Ones", value: "100 each" },
  { meld: "Fives", value: "50 each" },
  { meld: "Triple ones", value: "1,000" },
  { meld: "Triple twos", value: "200" },
  { meld: "Triple threes", value: "300" },
  { meld: "Triple fours", value: "400" },
  { meld: "Triple fives", value: "500" },
  { meld: "Triple sixes", value: "600" },
  { meld: "Four of a kind", value: "1,000" },
  { meld: "Five of a kind", value: "2,000" },
  { meld: "Six of a kind", value: "3,000" },
  { meld: "Three pairs", value: "1,500" },
  { meld: "Straight 1–6", value: "2,500" },
];

function FarkleTable() {
  const game = getGame("farkle");
  const navigate = useNavigate();
  const { opponent, match: matchId } = Route.useSearch();
  const [state, setState] = useState<State>(freshState);
  const [selected, setSelected] = useState<number[]>([]);
  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);
  const [flag, setFlag] = useState<string | null>(readFlag);
  const [flagOpen, setFlagOpen] = useState(false);
  const [viewingBoard, setViewingBoard] = useState(false);
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
  // Banking animation: while the turn total counts down to zero the running
  // score counts up, and only then is the bank actually committed.
  const [bankAnim, setBankAnim] = useState<{ bank: number; score: number } | null>(null);
  const bankAnimRef = useRef<number | null>(null);
  // Ada's banking animation: counts her score up while her bank counts down.
  const [cpuBankAnim, setCpuBankAnim] = useState<{ bank: number; score: number } | null>(null);
  const cpuBankAnimRef = useRef<number | null>(null);
  // Clears Ada's dice after her "banked" bubble disappears.
  const cpuBankPassTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the rolloff winner while its "I won the throw" bubble plays out;
  // play begins once that bubble clears.
  const [pendingPlay, setPendingPlay] = useState<Seat | null>(null);
  stateRef.current = state;
  // FLIP animation: dice the player picks fly from the throwing tray down to the
  // "Set aside" tray, and fly back when clicked there again. We remember each
  // die's last on-screen rectangle and, whenever it toggles between the two
  // areas, animate the freshly-mounted element from its old spot to its new one.
  const dieRefs = useRef(new Map<number, HTMLDivElement>());
  const lastRects = useRef(new Map<number, DOMRect>());
  const prevLocationRef = useRef<Map<number, string>>(new Map());
  const registerDie = (i: number) => (el: HTMLDivElement | null) => {
    if (el) dieRefs.current.set(i, el);
    else dieRefs.current.delete(i);
  };
  useLayoutEffect(() => {
    const nowLocation = new Map<number, string>();
    state.dice.forEach((die, i) => {
      nowLocation.set(i, die.set ? "cpu" : selected.includes(i) ? "player" : "center");
    });
    const nextRects = new Map<number, DOMRect>();
    dieRefs.current.forEach((el, i) => nextRects.set(i, el.getBoundingClientRect()));
    nextRects.forEach((next, i) => {
      const prev = lastRects.current.get(i);
      if (!prev) return;
      // Only dice that moved between the throwing area and the set-aside tray
      // animate; a re-roll changes a die's face in place and should not fly.
      if (prevLocationRef.current.get(i) === nowLocation.get(i)) return;
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx === 0 && dy === 0) return;
      const el = dieRefs.current.get(i);
      if (!el) return;
      const base = el.style.transform || "none";
      const from =
        base === "none" ? `translate(${dx}px, ${dy}px)` : `translate(${dx}px, ${dy}px) ${base}`;
      el.animate(
        [
          { transform: from, zIndex: 40 },
          { transform: base, zIndex: 40 },
        ],
        { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    });
    lastRects.current = nextRects;
    prevLocationRef.current = nowLocation;
  });
  // While a rematch is being negotiated the match row must stay open: treat the
  // game as unfinished so the delayed "completed" write doesn't fire and bounce
  // both players back to the game room mid-rematch.
  useRecordMatchResult(
    match,
    isHost,
    state.rematch ? null : state.winner,
    matchId ? RECONNECT_SECONDS * 1000 : 0,
  );
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showAvatarMessage = (text: string) => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setAvatarMessage(text);
    messageTimer.current = setTimeout(() => setAvatarMessage(null), 2200);
  };
  const [cpuMessage, setCpuMessage] = useState<string | null>(null);
  const cpuMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCpuMessage = (text: string) => {
    if (cpuMessageTimer.current) clearTimeout(cpuMessageTimer.current);
    setCpuMessage(text);
    cpuMessageTimer.current = setTimeout(() => setCpuMessage(null), 2200);
  };
  const prevCpuScore = useRef(state.scores.cpu);
  const prevHotDice = useRef(false);
  useEffect(() => {
    const gained = state.scores.cpu - prevCpuScore.current;
    if (gained > 0) {
      // Count Ada's score up so her score box doesn't jump when she banks.
      const startScore = prevCpuScore.current;
      const duration = 900;
      const started = performance.now();
      if (cpuBankAnimRef.current) cancelAnimationFrame(cpuBankAnimRef.current);
      // Ada announces the bank before her score starts counting up.
      showCpuMessage(`${gained.toLocaleString()} banked`);
      // Clear Ada's dice once her "banked" bubble disappears.
      if (cpuBankPassTimer.current) clearTimeout(cpuBankPassTimer.current);
      cpuBankPassTimer.current = setTimeout(() => {
        apply((current) => {
          if (current.phase !== "play" || current.turn !== "cpu") return current;
          return passDice(current);
        });
      }, 2200);
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setCpuBankAnim({
          bank: Math.round(gained * (1 - eased)),
          score: Math.round(startScore + gained * eased),
        });
        if (t < 1) {
          cpuBankAnimRef.current = requestAnimationFrame(step);
        } else {
          cpuBankAnimRef.current = null;
          setCpuBankAnim(null);
        }
      };
      cpuBankAnimRef.current = requestAnimationFrame(step);
    }
    prevCpuScore.current = state.scores.cpu;
  }, [state.scores.cpu]);
  // Ada (or the live opponent) announces a farkle in her chat cloud.
  useEffect(() => {
    if (state.farkled && state.turn === "cpu" && state.phase === "play") {
      showCpuMessage("Farkle!");
    }
  }, [state.farkled, state.turn, state.phase]);
  // While a farkle rattles, keep the Bank button visible so it can shake with
  // the dice, then let it disappear once the rattle ends (~0.9s).
  const [farkleRattling, setFarkleRattling] = useState(false);
  const farkleRattleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (state.farkled && state.turn === "human" && state.phase === "play") {
      setFarkleRattling(true);
      if (farkleRattleTimer.current) clearTimeout(farkleRattleTimer.current);
      farkleRattleTimer.current = setTimeout(() => setFarkleRattling(false), 900);
    } else {
      setFarkleRattling(false);
    }
  }, [state.farkled, state.turn, state.phase]);
  // Whoever clears all six dice announces "Hot Dice!" — the active player in
  // their own bubble, the opponent in Ada's (works for both solo and multiplayer).
  useEffect(() => {
    if (state.hotDice && !prevHotDice.current) {
      if (state.turn === "human") showAvatarMessage("HOT DICE!");
      else showCpuMessage("HOT DICE!");
    }
    prevHotDice.current = state.hotDice;
  }, [state.hotDice, state.turn]);
  useEffect(
    () => () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
      if (cpuMessageTimer.current) clearTimeout(cpuMessageTimer.current);
      if (bankAnimRef.current) cancelAnimationFrame(bankAnimRef.current);
      if (cpuBankAnimRef.current) cancelAnimationFrame(cpuBankAnimRef.current);
      if (farkleRattleTimer.current) clearTimeout(farkleRattleTimer.current);
      if (cpuBankPassTimer.current) clearTimeout(cpuBankPassTimer.current);
    },
    [],
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
    enabled:
      isMulti && opponentConnected && state.phase === "play" && !state.winner && !state.timerOff,
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
  const countdown =
    turnSecondsLeft > 0 && turnSecondsLeft <= TURN_WARNING_SECONDS ? turnSecondsLeft : 0;

  const reset = () => {
    proposedTimerOffRef.current = false;
    const fresh = freshState();
    stateRef.current = fresh;
    setSelected([]);
    setViewingBoard(false);
    setState(fresh);
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
    setSelected([]);
  }, [isMulti, isHost, match?.version, remoteState]);

  const rolloffWinner: Seat | null =
    state.rolloff.human !== null &&
    state.rolloff.cpu !== null &&
    state.rolloff.human !== state.rolloff.cpu
      ? state.rolloff.human > state.rolloff.cpu
        ? "human"
        : "cpu"
      : null;

  const canRollOff =
    state.phase === "rolloff" &&
    state.rolloff.human === null &&
    (!isMulti || isHost || state.rolloff.cpu !== null);
  // Label for the rolloff button: prompt the active player, and show a waiting
  // state for whoever rolls second (or while the opponent rolls).
  const rolloffLabel =
    state.rolloff.human === null
      ? canRollOff
        ? "Roll for first turn"
        : "Waiting…"
      : state.rolloff.cpu === null
        ? "Rolling…"
        : "Roll again";
  const rollForFirst = () => {
    if (!canRollOff) return;
    apply(rollOff);
  };

  // Ada's rolloff die (solo play) lands a beat after the player rolls their own.
  useEffect(() => {
    if (isMulti) return;
    if (state.phase !== "rolloff") return;
    if (state.rolloff.human === null || state.rolloff.cpu !== null) return;
    const timer = setTimeout(() => {
      apply((current) => {
        if (current.phase !== "rolloff") return current;
        if (current.rolloff.human === null || current.rolloff.cpu !== null) return current;
        return {
          ...current,
          rolloff: { ...current.rolloff, cpu: rollFace() },
        };
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [isMulti, state.phase, state.rolloff.human, state.rolloff.cpu]);

  // Once both dice have landed, resolve the rolloff: a tie re-rolls, otherwise
  // the higher roller takes the first turn.
  useEffect(() => {
    if (isMulti && !isHost) return;
    if (state.phase !== "rolloff") return;
    const h = state.rolloff.human;
    const c = state.rolloff.cpu;
    if (h === null || c === null) return;
    const timer = setTimeout(() => {
      apply((current) => {
        if (current.phase !== "rolloff") return current;
        const hh = current.rolloff.human;
        const cc = current.rolloff.cpu;
        if (hh === null || cc === null) return current;
        if (hh === cc) {
          showCpuMessage("Roll again");
          return {
            ...current,
            rolloff: { human: null, cpu: null },
            log: note(current.log, { side: null, text: `Tie at ${hh} — throw again.` }),
          };
        }
        const first: Seat = hh > cc ? "human" : "cpu";
        if (first === "human") {
          showAvatarMessage("I won the throw. I will play first.");
        } else {
          showCpuMessage("I won the throw. I will play first.");
        }
        // Keep the rolloff dice on screen until the "I won the throw" bubble
        // clears, then hand over the first turn.
        setPendingPlay(first);
        return current;
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [isMulti, isHost, state.phase, state.rolloff.human, state.rolloff.cpu]);

  // Once the "I won the throw" bubble has cleared, begin play: move the turn to
  // the winner and drop the rolloff dice.
  useEffect(() => {
    if (pendingPlay === null) return;
    if (state.phase !== "rolloff") {
      setPendingPlay(null);
      return;
    }
    const timer = setTimeout(() => {
      apply((current) => {
        if (current.phase !== "rolloff") return current;
        if (current.rolloff.human === null || current.rolloff.cpu === null) return current;
        return {
          ...current,
          turn: pendingPlay,
          phase: "play",
          log: note(current.log, {
            side: pendingPlay,
            text: `win the rolloff ${current.rolloff.human}-${current.rolloff.cpu} and take the first turn.`,
          }),
        };
      });
      setPendingPlay(null);
    }, 2200);
    return () => clearTimeout(timer);
  }, [pendingPlay, state.phase]);

  const rollFor = (current: State, side: Seat): State => {
    const hot = current.dice.every((d) => d.set);
    const base = hot ? blankDice() : current.dice;
    const dice = base.map((d) => (d.set ? d : { face: rollFace(), set: false }));
    const faces = openFaces(dice);
    const label = faces.join(" · ");
    if (!hasScoring(faces)) {
      return {
        ...current,
        dice,
        rolled: true,
        farkled: true,
        turnScore: 0,
        log: note(current.log, {
          side,
          text: `throw ${label} — a farkle. ${current.turnScore.toLocaleString()} points lost.`,
        }),
      };
    }
    // Hot dice: when every die just thrown can be set aside, clear the table and
    // re-roll all six automatically — the player doesn't have to select each die.
    if (side === "human") {
      const allScore = scoreSelection(faces);
      if (allScore !== null) {
        return {
          ...current,
          dice: dice.map((d) => ({ ...d, set: true })),
          rolled: true,
          farkled: false,
          turnScore: current.turnScore + allScore,
          hotDice: true,
          log: note(current.log, {
            side,
            text: `throw hot dice: ${label} — all ${allScore.toLocaleString()} points.`,
          }),
        };
      }
    }
    return {
      ...current,
      dice,
      rolled: true,
      farkled: false,
      log: note(current.log, { side, text: `throw ${hot ? "hot dice: " : ""}${label}.` }),
    };
  };

  const passDice = (current: State): State => ({
    ...current,
    turn: flip(current.turn),
    dice: blankDice(),
    turnScore: 0,
    rolled: false,
    farkled: false,
    hotDice: false,
    pending: [],
    pendingScore: 0,
  });

  const bankFor = (current: State, side: Seat, gained: number): State => {
    const total = current.scores[side] + current.turnScore + gained;
    const scores = { ...current.scores, [side]: total };
    const won = total >= TARGET;
    const banked = (current.turnScore + gained).toLocaleString();
    const logged: State = {
      ...current,
      scores,
      log: note(current.log, {
        side,
        text: `bank ${banked} — now on ${total.toLocaleString()}.`,
      }),
    };
    if (won) {
      return { ...logged, phase: "over", winner: side, turnScore: 0, rolled: false };
    }
    // Ada keeps her dice on screen while her "banked" bubble plays out; a
    // follow-up effect clears them once that bubble disappears.
    if (side === "cpu") {
      // Reset the turn total so Ada's "Bank" box reads zero once her banked
      // dice are counted; the count-down is handled by the cpuBankAnim above.
      return { ...logged, turnScore: 0 };
    }
    return passDice(logged);
  };

  // Hot dice: let the "Hot Dice!" bubble play out for three seconds, then throw
  // all six again. In multiplayer only the seat whose turn it is performs (and
  // publishes) the re-roll; the other seat just watches its mirrored copy.
  useEffect(() => {
    if (!state.hotDice) return;
    if (isMulti && state.turn !== "human") return;
    const timer = setTimeout(() => {
      apply((current) => {
        if (!current.hotDice) return current;
        return rollFor({ ...current, hotDice: false }, current.turn);
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [state.hotDice, isMulti, state.turn]);

  const myTurn = state.turn === "human" && state.phase === "play";
  const farkledOut = myTurn && state.farkled;
  const cpuFarkled = state.farkled && state.turn === "cpu";
  const playerMessage = farkledOut ? "Farkle!" : (avatarMessage ?? undefined);
  const selectedFaces = selected.map((i) => state.dice[i]?.face ?? 0);
  const selectionScore = selected.length ? scoreSelection(selectedFaces) : null;
  // Highest-scoring legal keep available from the current throw, used to let the
  // player bank the best possible score without first selecting dice by hand.
  const bestKeepResult =
    myTurn && state.rolled && !state.farkled ? bestKeep(openFaces(state.dice)) : null;

  // A die can be picked up only when it can actually be made into a meld: a 1
  // or 5 scores on its own, and any other face must appear three or more times
  // to form a three-of-a-kind. Dead dice stay in the tray.
  const canSelect = (index: number): boolean => {
    const face = state.dice[index]?.face;
    if (face === undefined) return false;
    if (face === 1 || face === 5) return true;
    return openFaces(state.dice).filter((f) => f === face).length >= 3;
  };

  const toggle = (index: number) => {
    if (!myTurn || !state.rolled || state.farkled) return;
    if (state.dice[index]?.set) return;
    setSelected((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index);
      return canSelect(index) ? [...prev, index] : prev;
    });
  };

  const roll = () => {
    if (!myTurn) return;
    if (state.rolled && !state.farkled) return;
    apply((current) => rollFor(current, "human"));
    setSelected([]);
  };

  const keepAndRoll = () => {
    if (!myTurn || selectionScore === null) return;
    const willBeHot = selected.length === state.dice.filter((d) => !d.set).length;
    apply((current) => {
      const dice = current.dice.map((d, i) => (selected.includes(i) ? { ...d, set: true } : d));
      const staged: State = {
        ...current,
        dice,
        turnScore: current.turnScore + selectionScore,
        hotDice: willBeHot,
        log: note(current.log, {
          side: "human",
          text: `set aside ${selectionScore.toLocaleString()}.`,
        }),
      };
      // On hot dice the re-roll is deferred to the hot-dice effect below, which
      // pauses for the "Hot Dice!" announcement before throwing all six again.
      return willBeHot ? staged : rollFor(staged, "human");
    });
    setSelected([]);
  };

  const bank = () => {
    if (!myTurn || bestKeepResult === null || bankAnim !== null) return;
    const gained = bestKeepResult.score;
    const banked = state.turnScore + gained;
    const startScore = state.scores.human;
    setSelected([]);

    // Count the turn total down to zero while the running score counts up,
    // then commit the bank once the animation has finished.
    const duration = 900;
    const started = performance.now();
    if (bankAnimRef.current) cancelAnimationFrame(bankAnimRef.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setBankAnim({
        bank: Math.round(banked * (1 - eased)),
        score: Math.round(startScore + banked * eased),
      });
      if (t < 1) {
        bankAnimRef.current = requestAnimationFrame(step);
      } else {
        bankAnimRef.current = null;
        setBankAnim(null);
        apply((current) => bankFor(current, "human", gained));
        showAvatarMessage(`${banked.toLocaleString()} banked`);
      }
    };
    bankAnimRef.current = requestAnimationFrame(step);
  };

  // A farkle auto-passes: after a three-second pause (letting the cry and rattle
  // land) the turn moves on with no "Pass the dice" click. In multiplayer only
  // the farkling seat performs (and publishes) the pass.
  useEffect(() => {
    if (state.phase !== "play" || !state.farkled || state.turn !== "human") return;
    const timer = setTimeout(() => {
      apply((current) => {
        if (current.phase !== "play" || !current.farkled || current.turn !== "human")
          return current;
        return passDice(current);
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [state.farkled, state.turn, state.phase]);

  // Ada's turn, one deliberate step at a time (solo play only). When she
  // decides what to keep, the chosen dice move to her area one per second.
  useEffect(() => {
    if (isMulti) return;
    if (state.phase !== "play" || state.turn !== "cpu") return;
    if (state.hotDice) return;
    const timer = setTimeout(() => {
      setState((current) => {
        if (current.phase !== "play" || current.turn !== "cpu") return current;
        let next: State;
        if (current.farkled) {
          next = passDice(current);
        } else if (!current.rolled) {
          next = rollFor(current, "cpu");
        } else if (current.pending.length > 0) {
          // Move one queued die to the opponent's set-aside area this tick.
          const [index, ...rest] = current.pending;
          const dice = current.dice.map((d, i) => (i === index ? { ...d, set: true } : d));
          if (rest.length > 0) {
            next = { ...current, pending: rest, dice };
          } else {
            const staged: State = {
              ...current,
              pending: [],
              pendingScore: 0,
              dice,
              turnScore: current.turnScore + current.pendingScore,
              log: note(current.log, {
                side: "cpu",
                text: `set aside ${current.pendingScore.toLocaleString()}.`,
              }),
            };
            const diceLeft = dice.filter((d) => !d.set).length;
            const behindBy = staged.scores.human - staged.scores.cpu;
            next =
              diceLeft === 0
                ? { ...staged, hotDice: true }
                : shouldBank(staged.turnScore, diceLeft, behindBy)
                  ? bankFor(staged, "cpu", 0)
                  : rollFor(staged, "cpu");
          }
        } else {
          const faces = openFaces(current.dice);
          const openIndexes = current.dice.map((d, i) => (d.set ? -1 : i)).filter((i) => i >= 0);
          const keep = bestKeep(faces);
          if (!keep) {
            next = passDice(current);
          } else {
            next = {
              ...current,
              pending: keep.indexes.map((i) => openIndexes[i]!),
              pendingScore: keep.score,
            };
          }
        }
        stateRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [
    isMulti,
    state.phase,
    state.turn,
    state.rolled,
    state.farkled,
    state.hotDice,
    state.dice,
    state.turnScore,
    state.pending,
    state.pendingScore,
  ]);

  const status =
    isMulti && !match
      ? "Opening the shared table…"
      : state.winner
        ? state.winner === "human"
          ? "You reached the target — you win"
          : `${opponentName} got there first`
        : state.phase === "rolloff"
          ? "Highest roll goes first"
          : myTurn
            ? state.farkled
              ? "Farkled — passing the dice…"
              : state.rolled
                ? "Set aside the scorers"
                : "Your throw"
            : isMulti
              ? `Waiting for ${opponentName}…`
              : "Rattling the dice…";

  const setAsideDice = state.dice.filter((d) => d.set);

  const meldTable = (
    <table className="w-full select-none text-sm">
      <thead>
        <tr className="border-b border-brand/20">
          <th className="pb-1.5 text-left font-semibold">Meld</th>
          <th className="pb-1.5 text-right font-semibold">Value</th>
        </tr>
      </thead>
      <tbody>
        {MELD_VALUES.map((row) => (
          <tr key={row.meld} className="border-b border-brand/10 last:border-0">
            <td className="py-1 text-left">{row.meld}</td>
            <td className="py-1 text-right font-medium">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const meldValues = (
    <>
      <div className="hidden rounded-xl border border-gold/15 bg-cream/95 p-4 text-brand shadow-lg lg:block">
        <p className="mb-3 text-center font-display text-lg font-bold">Meld Values</p>
        {meldTable}
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="parlor" className="w-full bg-white text-ink hover:bg-white/90 lg:hidden">
            Meld Values
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-gold/25 bg-cream text-brand sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-bold">Meld Values</DialogTitle>
          </DialogHeader>
          {meldTable}
        </DialogContent>
      </Dialog>
    </>
  );

  // Rematch flow: "human" means we asked, "cpu" means the opponent asked us.
  const rematchOutgoing = state.rematch === "human";
  const rematchIncoming = state.rematch === "cpu";

  return (
    <TableShell
      game={game}
      containerMaxWidth="max-w-[64.8rem]"
      boxClassName="px-1 sm:px-[0.4rem]"
      opponentName={opponentName}
      opponentStatus={status}
      showChat={isMulti}
      opponentDisconnected={opponentDisconnected}
      disconnectSecondsLeft={disconnectSecondsLeft}
      disconnectExpired={disconnectExpired}
      gameInProgress={state.phase !== "over" && state.rolloff.human !== null}
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/farkle", search: { opponent: nickname, match: newMatchId } });
        reset();
      }}
      onNewGame={() => (isMulti ? navigate({ to: "/farkle" }) : reset())}
      rail={meldValues}
      menuExtra={
        <TurnOffTimerControl
          showButton={
            isMulti &&
            state.phase === "play" &&
            !state.winner &&
            !state.timerOff &&
            !state.timerProposed
          }
          showPrompt={state.timerRequest === "cpu"}
          opponentName={opponentName}
          declined={proposedTimerOffRef.current && state.timerDeclined}
          agreed={proposedTimerOffRef.current && state.timerAgreed}
          onRequest={() => {
            proposedTimerOffRef.current = true;
            apply((current) => ({ ...current, timerProposed: true, timerRequest: "human" }));
          }}
          onAccept={() =>
            apply((current) => ({
              ...current,
              timerOff: true,
              timerAgreed: true,
              timerRequest: null,
            }))
          }
          onDecline={() =>
            apply((current) => ({ ...current, timerRequest: null, timerDeclined: true }))
          }
        />
      }
    >
      <FlagPicker open={flagOpen} onOpenChange={setFlagOpen} onSelect={setFlag} />
      <GameOverDialog
        open={state.phase === "over" && Boolean(state.winner) && !viewingBoard}
        result={state.winner === "human" ? "win" : "loss"}
        playerScore={state.scores.human.toLocaleString()}
        opponentScore={state.scores.cpu.toLocaleString()}
        scoreLabel="Final points"
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
            <Button variant="parlorOutline" onClick={() => setViewingBoard(true)}>
              View Board
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
      <div className="flex min-h-[560px] flex-col sm:mx-auto sm:min-h-[720px] sm:w-[85%]">
        {/* Ada — top of the table */}
        <div className="flex flex-col gap-4 rounded-2xl border border-gold/15 bg-brand/50 px-9 py-[27px]">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative inline-block">
                <img
                  src={opponentAvatar ?? ADA_AVATAR}
                  alt={opponentName}
                  width={64}
                  height={64}
                  className={`size-14 sm:size-[4.2rem] rounded-full border-2 border-gold/40 bg-surface object-cover ${
                    cpuFarkled ? "animate-cry" : ""
                  }`}
                />
                {state.turn === "cpu" && countdown > 0 && <CountdownBadge seconds={countdown} />}
                {cpuFarkled && <CryingTears />}
                {cpuMessage && (
                  <div className="absolute left-0 top-full z-10 mt-2">
                    <SpeechBubble text={cpuMessage} tail="up-left" />
                  </div>
                )}
              </div>
              <div>
                <p className="font-display text-lg font-bold">{opponentName}</p>
                <p className="text-xs text-ivory/60">
                  {state.turn === "cpu" && state.phase === "play" ? "Throwing…" : "Waiting"}
                </p>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center gap-3">
              <div className="min-w-[5rem] rounded-lg border border-gold/20 bg-surface/60 px-3 py-1.5 text-center sm:min-w-[8rem] sm:px-6 sm:py-2.5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/50 sm:text-xs">Bank</p>
                <p className="font-display text-xl font-bold text-gold tabular-nums sm:text-3xl">
                  {(cpuBankAnim
                    ? cpuBankAnim.bank
                    : state.turn === "cpu"
                      ? state.turnScore
                      : 0
                  ).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="min-w-[5rem] rounded-lg border border-gold/20 bg-surface/60 px-3 py-1.5 text-center sm:order-3 sm:min-w-[8rem] sm:px-6 sm:py-2.5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/50 sm:text-xs">Score</p>
              <p className="font-display text-xl font-bold text-gold tabular-nums sm:text-3xl">
                {(cpuBankAnim ? cpuBankAnim.score : state.scores.cpu).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex min-h-9 flex-wrap items-center justify-center gap-2 sm:h-14">
            {state.turn === "cpu" && state.phase === "play" && setAsideDice.length > 0 && (
              <>
                {setAsideDice.map((die) => {
                  const realIndex = state.dice.indexOf(die);
                  return (
                    <div
                      key={`c${realIndex}`}
                      ref={registerDie(realIndex)}
                      className={state.farkled ? "animate-rattle" : ""}
                    >
                      <DieFace face={die.face} medium />
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Middle arena — status and thrown dice */}
        <div className="mt-2.5 flex flex-1 flex-col items-center gap-2.5">
          <div className="w-full max-w-xl rounded-xl border border-gold/20 bg-gold/10 px-5 py-1.5 text-center">
            <p className="flex min-h-5 items-center justify-center text-sm font-medium text-cream">
              {status}
            </p>
          </div>

          <div className="flex w-full flex-1 flex-col items-center justify-center">
            {state.phase === "rolloff" ? (
              <div className="w-full rounded-2xl border border-gold/25 bg-surface/60 p-6 text-center shadow-2xl shadow-black/40 sm:px-10 sm:py-6">
                <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Who goes first?</p>
                <div className="mt-6 flex items-center justify-center gap-8">
                  <div className="flex flex-col items-center gap-2">
                    <p className="font-display">{playerName}</p>
                    {state.rolloff.human !== null && (
                      <div
                        style={{
                          transform: `rotate(${scatterFor(0, state.rolloff.human).angle}deg)`,
                        }}
                      >
                        <DieFace face={state.rolloff.human} sizeClass="size-[3.6rem]" />
                      </div>
                    )}
                  </div>
                  <p className="font-display text-2xl text-gold">vs</p>
                  <div className="flex flex-col items-center gap-2">
                    <p className="font-display">{opponentName}</p>
                    {state.rolloff.cpu !== null && (
                      <div
                        style={{
                          transform: `rotate(${scatterFor(1, state.rolloff.cpu).angle}deg)`,
                        }}
                      >
                        <DieFace face={state.rolloff.cpu} sizeClass="size-[3.6rem]" />
                      </div>
                    )}
                  </div>
                </div>
                {state.rolloff.human !== null &&
                  state.rolloff.cpu !== null &&
                  rolloffWinner === null && (
                    <p className="mt-4 text-sm text-ivory/55">
                      Tie at {state.rolloff.human} — throw again.
                    </p>
                  )}
                <div className="mt-6">
                  <Button variant="parlor" onClick={rollForFirst} disabled={!canRollOff}>
                    {rolloffLabel}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="w-full rounded-2xl border border-gold/25 bg-surface/60 p-6 shadow-2xl shadow-black/40 sm:px-10 sm:py-6">
                <div className="relative mx-auto h-[10.2rem] w-full max-w-[20.4rem]">
                  {state.dice.map((die, i) => {
                    if (!state.rolled || die.set || selected.includes(i)) {
                      return null;
                    }
                    const { angle, x, y } = scatterFor(i, die.face);
                    return (
                      <div
                        key={i}
                        ref={registerDie(i)}
                        className="absolute"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                        }}
                      >
                        <DieFace
                          face={die.face}
                          medium
                          interactive={myTurn && state.rolled && !state.farkled && canSelect(i)}
                          onClick={() => toggle(i)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Player — bottom of the table */}
        <div className="mt-1.5 rounded-2xl border border-gold/15 bg-brand/50 p-4 sm:px-7 sm:pt-[30px] sm:pb-[15px]">
          <div className="flex min-h-9 flex-wrap items-center justify-center gap-2 sm:h-14">
            {state.turn === "human" &&
              state.phase === "play" &&
              (setAsideDice.length > 0 || selected.length > 0) && (
                <>
                  {setAsideDice.map((die) => {
                    const realIndex = state.dice.indexOf(die);
                    return (
                      <span key={`s${realIndex}`} className={state.farkled ? "animate-rattle" : ""}>
                        <DieFace face={die.face} medium />
                      </span>
                    );
                  })}
                  {selected.map((i) => {
                    const die = state.dice[i];
                    if (!die || die.set) return null;
                    return (
                      <div key={`sel${i}`} ref={registerDie(i)} className="relative">
                        <DieFace
                          face={die.face}
                          medium
                          selected
                          interactive={myTurn && state.rolled && !state.farkled}
                          onClick={() => toggle(i)}
                        />
                      </div>
                    );
                  })}
                </>
              )}
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <PlayerAvatar
                avatar={playerAvatar}
                onSelect={setPlayerAvatar}
                size="size-8 sm:size-[4.2rem]"
                countdown={state.turn === "human" ? countdown : 0}
                {...(farkledOut ? { sad: true } : {})}
                {...(farkledOut ? { crying: true } : {})}
                {...(playerMessage ? { message: playerMessage } : {})}
              />
              <div>
                <div className="flex items-center gap-2">
                  <NicknameDialog
                    onSaved={setPlayerName}
                    trigger={
                      <button
                        type="button"
                        className="font-display text-lg font-bold hover:text-gold sm:text-xl"
                      >
                        {playerName}
                      </button>
                    }
                  />
                  <PlayerFlag flag={flag} onClick={() => setFlagOpen(true)} className="size-6" />
                </div>
                <p className="text-xs text-ivory/60 sm:text-sm">
                  {myTurn && state.phase === "play" ? "Your turn" : "Waiting"}
                </p>
              </div>
            </div>

            <div className="order-2 flex flex-col items-center gap-2 sm:order-2 sm:h-32 sm:flex-1 sm:items-center sm:justify-center">
              <div className="flex min-h-9 flex-wrap items-center justify-center gap-3">
                {state.phase === "play" && myTurn && !state.farkled && (
                  <>
                    {!state.rolled ? (
                      <div className="flex flex-col items-center gap-3">
                        <Button variant="parlor" onClick={roll}>
                          Throw the dice
                        </Button>
                        <Button variant="parlorOutline" disabled>
                          Bank 0
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Button
                          variant="parlor"
                          disabled={selectionScore === null}
                          onClick={keepAndRoll}
                        >
                          Roll again
                        </Button>
                        <Button
                          variant="parlorOutline"
                          disabled={bestKeepResult === null || bankAnim !== null}
                          onClick={bank}
                        >
                          Bank
                          {bestKeepResult !== null
                            ? ` ${(bankAnim ? bankAnim.bank : state.turnScore + bestKeepResult.score).toLocaleString()}`
                            : ""}
                        </Button>
                      </div>
                    )}
                  </>
                )}
                {state.phase === "play" && myTurn && state.farkled && farkleRattling && (
                  <Button variant="parlorOutline" disabled className="animate-rattle">
                    Bank
                  </Button>
                )}
              </div>
            </div>
            <div className="order-3 min-w-[5rem] rounded-lg border border-gold/20 bg-surface/60 px-3 py-1.5 text-center sm:order-3 sm:min-w-[8rem] sm:px-6 sm:py-2.5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/50 sm:text-xs">
                Score
              </p>
              <p className="font-display text-xl font-bold text-gold tabular-nums sm:text-3xl">
                {(bankAnim ? bankAnim.score : state.scores.human).toLocaleString()}
              </p>
            </div>
          </div>
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
  selected = false,
  interactive = false,
  dim = false,
  small = false,
  medium = false,
  sizeClass,
  onClick,
}: {
  face: number;
  selected?: boolean;
  interactive?: boolean;
  dim?: boolean;
  small?: boolean;
  medium?: boolean;
  sizeClass?: string;
  onClick?: () => void;
}) {
  const pips = PIPS[face] ?? [];
  const size = sizeClass ?? (medium ? "size-14" : small ? "size-9" : "size-16");
  return (
    <button
      type="button"
      aria-label={`Die showing ${face}`}
      aria-pressed={selected}
      disabled={!interactive}
      onClick={onClick}
      className={`grid rounded-xl border-2 bg-cream p-1.5 transition-all ${size} ${
        selected ? "-translate-y-1.5 border-gold shadow-lg shadow-black/40" : "border-cream/40"
      } ${
        dim ? "opacity-40" : ""
      } ${interactive ? "cursor-pointer hover:-translate-y-1 hover:border-gold" : "cursor-default"}`}
    >
      <span className="grid size-full grid-cols-3 grid-rows-3 gap-px">
        {Array.from({ length: 9 }, (_, cell) => (
          <span
            key={cell}
            className={`m-auto rounded-full ${medium ? "size-2" : small ? "size-1" : "size-2"} ${
              pips.includes(cell) ? "bg-brand" : ""
            }`}
          />
        ))}
      </span>
    </button>
  );
}
