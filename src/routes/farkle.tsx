import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { getGame } from "@/lib/games";
import { useMatch } from "@/lib/multiplayer";
import { useRecordMatchResult } from "@/lib/stats";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
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
  /** Dice queued to set aside one at a time during Ada's solo turn. */
  pending: number[];
  /** Points from the queued keep, added once every die has landed. */
  pendingScore: number;
  log: LogEntry[];
  winner: Seat | null;
};

const blankDice = (): Die[] =>
  Array.from({ length: DICE_COUNT }, () => ({ face: 1, set: false }));

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

const freshState = (): State => ({
  phase: "rolloff",
  turn: "human",
  rolloff: { human: null, cpu: null },
  scores: { human: 0, cpu: 0 },
  dice: blankDice(),
  turnScore: 0,
  rolled: false,
  farkled: false,
  pending: [],
  pendingScore: 0,
  log: [{ side: null, text: "Highest roll goes first. Throw the dice." }],
  winner: null,
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
    winner: state.winner ? flip(state.winner) : null,
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
  { meld: "Four of a kind", value: "Double the triple" },
  { meld: "Five of a kind", value: "Quadruple the triple" },
  { meld: "Six of a kind", value: "Octuple the triple" },
  { meld: "Three pairs", value: "1,500" },
  { meld: "Straight 1–6", value: "1,500" },
];

function FarkleTable() {
  const game = getGame("farkle");
  const navigate = useNavigate();
  const { opponent, match: matchId } = Route.useSearch();
  const {
    match,
    isHost,
    opponentName: liveOpponent,
    remoteState,
    publish,
    opponentDisconnected,
    disconnectSecondsLeft,
    disconnectExpired,
  } = useMatch<State>(matchId);
  const [state, setState] = useState<State>(freshState);
  const [selected, setSelected] = useState<number[]>([]);
  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);
  const stateRef = useRef(state);
  stateRef.current = state;
  useRecordMatchResult(match, isHost, state.winner);
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
  const cpuHotRef = useRef(false);
  useEffect(() => {
    const gained = state.scores.cpu - prevCpuScore.current;
    if (gained > 0) showCpuMessage(`${gained.toLocaleString()} banked`);
    prevCpuScore.current = state.scores.cpu;
  }, [state.scores.cpu]);
  // Ada (or the live opponent) announces a farkle in her chat cloud.
  useEffect(() => {
    if (state.farkled && state.turn === "cpu" && state.phase === "play") {
      showCpuMessage("Farkle!");
    }
  }, [state.farkled, state.turn, state.phase]);
  // Ada announces "Hot Dice!" once she clears all six dice.
  useEffect(() => {
    if (cpuHotRef.current) {
      cpuHotRef.current = false;
      showCpuMessage("Hot Dice!");
    }
  }, [state.dice, state.turn]);
  useEffect(
    () => () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
      if (cpuMessageTimer.current) clearTimeout(cpuMessageTimer.current);
    },
    [],
  );

  const isMulti = Boolean(matchId);
  const opponentName = liveOpponent ?? opponent ?? "Ada";

  const apply = (fn: (current: State) => State) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (isMulti) void publish(isHost ? next : mirror(next));
  };

  const reset = () => {
    const fresh = freshState();
    stateRef.current = fresh;
    setSelected([]);
    setState(fresh);
    if (isMulti) void publish(isHost ? fresh : mirror(fresh));
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
    state.rolloff.human !== null && state.rolloff.cpu !== null && state.rolloff.human !== state.rolloff.cpu
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
          return {
            ...current,
            rolloff: { human: null, cpu: null },
            log: note(current.log, { side: null, text: `Tie at ${hh} — throw again.` }),
          };
        }
        const first: Seat = hh > cc ? "human" : "cpu";
        return {
          ...current,
          turn: first,
          phase: "play",
          log: note(current.log, {
            side: first,
            text: `win the rolloff ${hh}-${cc} and take the first turn.`,
          }),
        };
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [isMulti, isHost, state.phase, state.rolloff.human, state.rolloff.cpu]);

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
    return passDice(logged);
  };

  const myTurn = state.turn === "human" && state.phase === "play";
  const farkledOut = myTurn && state.farkled;
  const playerMessage = farkledOut ? "Farkle!" : (avatarMessage ?? undefined);
  const selectedFaces = selected.map((i) => state.dice[i]?.face ?? 0);
  const selectionScore = selected.length ? scoreSelection(selectedFaces) : null;
  // Highest-scoring legal keep available from the current throw, used to let the
  // player bank the best possible score without first selecting dice by hand.
  const bestKeepResult =
    myTurn && state.rolled && !state.farkled
      ? bestKeep(openFaces(state.dice))
      : null;

  const toggle = (index: number) => {
    if (!myTurn || !state.rolled || state.farkled) return;
    if (state.dice[index]?.set) return;
    setSelected((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
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
        log: note(current.log, {
          side: "human",
          text: `set aside ${selectionScore.toLocaleString()}.`,
        }),
      };
      return rollFor(staged, "human");
    });
    setSelected([]);
    if (willBeHot) showAvatarMessage("Hot Dice!");
  };

  const bank = () => {
    if (!myTurn || bestKeepResult === null) return;
    const gained = bestKeepResult.score;
    const banked = state.turnScore + gained;
    apply((current) => bankFor(current, "human", gained));
    setSelected([]);
    showAvatarMessage(`${banked.toLocaleString()} banked`);
  };

  const endFarkledTurn = () => {
    if (!myTurn || !state.farkled) return;
    apply(passDice);
    setSelected([]);
  };

  // Ada's turn, one deliberate step at a time (solo play only). When she
  // decides what to keep, the chosen dice move to her area one per second.
  useEffect(() => {
    if (isMulti) return;
    if (state.phase !== "play" || state.turn !== "cpu") return;
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
            if (diceLeft === 0) cpuHotRef.current = true;
            const behindBy = staged.scores.human - staged.scores.cpu;
            next = shouldBank(staged.turnScore, diceLeft, behindBy)
              ? bankFor(staged, "cpu", 0)
              : rollFor(staged, "cpu");
          }
        } else {
          const faces = openFaces(current.dice);
          const openIndexes = current.dice
            .map((d, i) => (d.set ? -1 : i))
            .filter((i) => i >= 0);
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
  }, [isMulti, state.phase, state.turn, state.rolled, state.farkled, state.dice, state.turnScore, state.pending, state.pendingScore]);

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
            ? "Farkled — pass the dice"
            : state.rolled
              ? "Set aside the scorers"
              : "Your throw"
          : isMulti
            ? `Waiting for ${opponentName}…`
            : "Rattling the dice…";

  const setAsideDice = state.dice.filter((d) => d.set);
  const activeDice = state.dice.filter((d) => !d.set);
  const diceLeft = activeDice.length;

  const meldBox = (
    <div className="rounded-xl border border-gold/15 bg-cream/95 p-4 text-brand shadow-lg">
      <p className="mb-3 text-center font-display text-lg font-bold">Meld Values</p>
      <table className="w-full text-sm">
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
    </div>
  );

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus={status}
      opponentDisconnected={opponentDisconnected}
      disconnectSecondsLeft={disconnectSecondsLeft}
      disconnectExpired={disconnectExpired}
      gameInProgress={state.phase !== "over" && state.rolloff.human !== null}
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/farkle", search: { opponent: nickname, match: newMatchId } });
        reset();
      }}
      onNewGame={reset}
      rail={
        <>
          {meldBox}
        </>
      }
    >
      <GameOverDialog
        open={state.phase === "over" && Boolean(state.winner)}
        result={state.winner === "human" ? "win" : "loss"}
        playerScore={state.scores.human.toLocaleString()}
        opponentScore={state.scores.cpu.toLocaleString()}
        scoreLabel="Final points"
        opponentName={opponentName}
        playerAvatar={playerAvatar}
        onPlayAgain={reset}
      />
      <div className="flex min-h-[560px] flex-col justify-between gap-6">
        {/* Ada — top of the table */}
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-gold/15 bg-brand/50 p-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative inline-block">
              <img
                src={ADA_AVATAR}
                alt={opponentName}
                width={64}
                height={64}
                className="size-14 rounded-full border-2 border-gold/40 bg-surface object-cover"
              />
              {cpuMessage && (
                <div className="absolute left-0 top-full z-10 mt-2 w-max max-w-[16rem]">
                  <div className="relative rounded-2xl border border-gold/30 bg-cream px-3 py-1.5 text-sm font-medium text-brand shadow-lg">
                    <span
                      aria-hidden
                      className="absolute -top-2 left-5 size-3 rotate-45 border-l border-t border-gold/30 bg-cream"
                    />
                    {cpuMessage}
                  </div>
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

          {state.turn === "cpu" && state.phase === "play" && setAsideDice.length > 0 && (
            <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-ivory/50">
                Set aside
              </span>
              {setAsideDice.map((die) => {
                const realIndex = state.dice.indexOf(die);
                return (
                  <span key={`c${realIndex}`} className="animate-die-to-cpu">
                    <DieFace face={die.face} small />
                  </span>
                );
              })}
            </div>
          )}

          <div className="rounded-lg border border-gold/20 bg-surface/60 px-5 py-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/50">Score</p>
            <p className="font-display text-2xl font-bold text-gold">
              {state.scores.cpu.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Middle arena — status and thrown dice */}
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <div className="w-full max-w-xl rounded-xl border border-gold/20 bg-gold/10 px-5 py-3 text-center">
            <p className="text-sm font-medium text-cream">{status}</p>
          </div>

          {state.phase === "rolloff" ? (
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Who goes first?</p>
              <p className="mt-2 font-display text-2xl font-bold">Highest roll starts the game</p>
              <div className="mt-6 flex items-center justify-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  <p className="font-display">You</p>
                  {state.rolloff.human !== null ? (
                    <DieFace face={state.rolloff.human} />
                  ) : (
                    <div className="grid size-16 place-items-center rounded-xl border-2 border-dashed border-gold/30" />
                  )}
                </div>
                <p className="font-display text-2xl text-gold">vs</p>
                <div className="flex flex-col items-center gap-2">
                  <p className="font-display">{opponentName}</p>
                  {state.rolloff.cpu !== null ? (
                    <DieFace face={state.rolloff.cpu} />
                  ) : (
                    <div className="grid size-16 place-items-center rounded-xl border-2 border-dashed border-gold/30" />
                  )}
                </div>
              </div>
              {state.rolloff.human !== null && state.rolloff.cpu !== null &&
                (rolloffWinner === null ? (
                  <p className="mt-4 text-sm text-ivory/55">Tie at {state.rolloff.human} — throw again.</p>
                ) : (
                  <p className="mt-4 text-sm text-ivory/55">
                    {rolloffWinner === "human" ? "You go first!" : `${opponentName} goes first!`}
                  </p>
                ))}
              <div className="mt-6">
                <Button variant="parlor" onClick={rollForFirst} disabled={!canRollOff}>
                  {rolloffLabel}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-gold/25 bg-surface/60 p-6 shadow-2xl shadow-black/40">
              <p className="mb-4 text-center text-[10px] uppercase tracking-[0.22em] text-ivory/45">
                {state.rolled ? `${diceLeft} dice in hand` : "Six dice waiting"}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {state.dice.map((die, i) => {
                  if (die.set) {
                    return <div key={i} className="size-16" aria-hidden />;
                  }
                  const { angle, dx, dy } = scatterFor(i, die.face);
                  return (
                    <div
                      key={i}
                      style={{ transform: `translate(${dx}px, ${dy}px) rotate(${angle}deg)` }}
                    >
                      <DieFace
                        face={die.face}
                        dim={!state.rolled}
                        selected={selected.includes(i)}
                        interactive={myTurn && state.rolled && !state.farkled}
                        onClick={() => toggle(i)}
                      />
                    </div>
                  );
                })}
              </div>
              {diceLeft === 0 && state.rolled && (
                <p className="mt-3 text-center text-sm text-ivory/60">Hot dice — throw all six again.</p>
              )}
            </div>
          )}
        </div>

        {/* Player — bottom of the table */}
        <div className="rounded-2xl border border-gold/15 bg-brand/50 p-4">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <PlayerAvatar
                avatar={playerAvatar}
                onSelect={setPlayerAvatar}
                {...(farkledOut ? { sad: true } : {})}
                {...(playerMessage ? { message: playerMessage } : {})}
              />
              <div>
                <p className="font-display text-lg font-bold">You</p>
                <p className="text-xs text-ivory/60">
                  {myTurn && state.phase === "play" ? "Your turn" : "Waiting"}
                </p>
              </div>
            </div>

            <div className="order-3 flex flex-col items-center gap-3 sm:order-2 sm:flex-1">
              {state.turn === "human" && state.phase === "play" && setAsideDice.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-ivory/50">
                    Set aside
                  </span>
                  {setAsideDice.map((die) => {
                    const realIndex = state.dice.indexOf(die);
                    return (
                      <span key={`s${realIndex}`} className="animate-die-to-player">
                        <DieFace face={die.face} small />
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-3">
                {state.phase === "play" && myTurn && (
                  <>
                    {state.farkled ? (
                      <Button variant="parlor" onClick={endFarkledTurn}>
                        Pass the dice
                      </Button>
                    ) : !state.rolled ? (
                      <Button variant="parlor" onClick={roll}>
                        Throw the dice
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="parlor"
                          disabled={selectionScore === null}
                          onClick={keepAndRoll}
                        >
                          Keep &amp; throw again
                        </Button>
                        <Button
                          variant="parlorOutline"
                          disabled={bestKeepResult === null}
                          onClick={bank}
                        >
                          Bank
                          {bestKeepResult !== null
                            ? ` ${(state.turnScore + bestKeepResult.score).toLocaleString()}`
                            : ""}
                        </Button>
                      </>
                    )}
                  </>
                )}
                {state.rolled && !state.farkled && myTurn && selected.length > 0 && (
                  <p className="text-sm text-ivory/55">
                    {selectionScore === null
                      ? "Every die you keep must score."
                      : `Selection worth ${selectionScore.toLocaleString()}.`}
                  </p>
                )}
              </div>
            </div>

            <div className="order-2 rounded-lg border border-gold/20 bg-surface/60 px-5 py-2 text-center sm:order-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/50">Score</p>
              <p className="font-display text-2xl font-bold text-gold">
                {state.scores.human.toLocaleString()}
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
  onClick,
}: {
  face: number;
  selected?: boolean;
  interactive?: boolean;
  dim?: boolean;
  small?: boolean;
  onClick?: () => void;
}) {
  const pips = PIPS[face] ?? [];
  return (
    <button
      type="button"
      aria-label={`Die showing ${face}`}
      aria-pressed={selected}
      disabled={!interactive}
      onClick={onClick}
      className={`grid rounded-xl border-2 bg-cream p-1.5 transition-all ${
        small ? "size-9" : "size-16"
      } ${selected ? "-translate-y-1.5 border-gold shadow-lg shadow-black/40" : "border-cream/40"} ${
        dim ? "opacity-40" : ""
      } ${interactive ? "cursor-pointer hover:-translate-y-1 hover:border-gold" : "cursor-default"}`}
    >
      <span className="grid size-full grid-cols-3 grid-rows-3 gap-px">
        {Array.from({ length: 9 }, (_, cell) => (
          <span
            key={cell}
            className={`m-auto rounded-full ${small ? "size-1" : "size-2"} ${
              pips.includes(cell) ? "bg-brand" : ""
            }`}
          />
        ))}
      </span>
    </button>
  );
}
