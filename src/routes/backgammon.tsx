import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { TableOptionsDialog } from "@/components/parlor/TableOptionsDialog";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
import { getGame } from "@/lib/games";
import { CLASSIC_PALETTE, readTableGraphic, type TablePalette } from "@/lib/backgammonTables";
import { useMatch } from "@/lib/multiplayer";
import { useRecordMatchResult } from "@/lib/stats";
import {
  applyMove,
  chooseCpuMove,
  consumeDice,
  initialBoard,
  legalMoves,
  rollDice,
  rollDie,
  splitMove,
  winner as findWinner,
  type BoardState,
  type Move,
} from "@/lib/backgammon";

export const Route = createFileRoute("/backgammon")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Play Backgammon — Cards and Games" },
      {
        name: "description",
        content:
          "Roll the dice and race your checkers home against Ada or a live human opponent, with hitting, the bar, and bearing off.",
      },
      { property: "og:title", content: "Play Backgammon — Cards and Games" },
      {
        property: "og:description",
        content: "Backgammon against Ada or a live opponent: hit blots, hold points, bear off first.",
      },
    ],
  }),
  component: BackgammonTable,
});

type Seat = "human" | "cpu";
type LogEntry = { side: Seat | null; text: string };

type State = {
  board: BoardState;
  dice: number[];
  turn: Seat;
  rolled: boolean;
  log: LogEntry[];
  winner: Seat | null;
  phase: "rolloff" | "play";
  rolloff: { human: number | null; cpu: number | null };
};

const freshState = (): State => ({
  board: initialBoard(),
  dice: [],
  turn: "human",
  rolled: false,
  log: [{ side: null, text: "Highest roll goes first. Roll to see who starts." }],
  winner: null,
  phase: "rolloff",
  rolloff: { human: null, cpu: null },
});

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);
const flip = (side: Seat): Seat => (side === "human" ? "cpu" : "human");

/** Turn the host's canonical board into the guest's own point of view. */
function mirrorBoard(board: BoardState): BoardState {
  return {
    points: [...board.points].reverse().map((count) => -count),
    bar: { human: board.bar.cpu, cpu: board.bar.human },
    off: { human: board.off.cpu, cpu: board.off.human },
  };
}

function mirror(state: State): State {
  return {
    ...state,
    board: mirrorBoard(state.board),
    rolloff: { human: state.rolloff.cpu, cpu: state.rolloff.human },
    turn: flip(state.turn),
    winner: state.winner ? flip(state.winner) : null,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? flip(entry.side) : null })),
  };
}

// Pip layouts for a 3×3 die face, indexed by value (1-6).
const DIE_PIPS: number[][] = [
  [],
  [4],
  [0, 8],
  [0, 4, 8],
  [0, 2, 6, 8],
  [0, 2, 4, 6, 8],
  [0, 2, 3, 5, 6, 8],
];

function Die({ value }: { value: number }) {
  const pips = DIE_PIPS[value] ?? [4];
  return (
    <span className="grid size-10 grid-cols-3 grid-rows-3 place-items-center rounded-lg bg-cream p-1">
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={`size-2 rounded-full ${pips.includes(i) ? "bg-[#2a2a2a]" : ""}`}
        />
      ))}
    </span>
  );
}

// Deterministic scatter for dice so each die lands at a stable spot and angle
// (rather than a tidy row) in the middle band of the board.
function diceSpot(index: number, value: number): { x: number; y: number; angle: number } {
  const seed = (value * 2654435761 + index * 40503) >>> 0;
  const rand = (n: number) => {
    let x = (seed + Math.imul(n + 1, 0x9e3779b9)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
  return {
    x: 14 + rand(0) * 72, // 14%..86% across the board
    y: 42 + rand(1) * 16, // 42%..58% vertically (between the triangles)
    angle: Math.round(rand(2) * 120 - 60), // -60..60 degrees
  };
}

/** A speech bubble rendered just below its anchor (used for the opponent's "PASS"). */
function CloudChat({ text }: { text: string }) {
  return (
    <div className="absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2">
      <div className="relative rounded-2xl border border-gold/30 bg-cream px-3 py-1.5 text-sm font-bold text-brand shadow-lg">
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 size-3 -translate-x-1/2 rotate-45 border-l border-t border-gold/30 bg-cream"
        />
        {text}
      </div>
    </div>
  );
}

function BackgammonTable() {
  const game = getGame("backgammon");
  const navigate = useNavigate();
  const { opponent, match: matchId } = Route.useSearch();
  const { match, isHost, opponentName: liveOpponent, remoteState, publish, opponentDisconnected, disconnectSecondsLeft, disconnectExpired } = useMatch<State>(matchId);
  const [state, setState] = useState<State>(freshState);
  const [selected, setSelected] = useState<number | "bar" | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  useRecordMatchResult(match, isHost, state.winner);
  // Which player is currently showing a "PASS" bubble (no legal move available).
  const [passBubble, setPassBubble] = useState<Seat | null>(null);
  const passTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPass = (side: Seat) => {
    setPassBubble(side);
    if (passTimerRef.current) clearTimeout(passTimerRef.current);
    passTimerRef.current = setTimeout(() => {
      setPassBubble(null);
      passTimerRef.current = null;
    }, 2000);
  };
  useEffect(
    () => () => {
      if (passTimerRef.current) clearTimeout(passTimerRef.current);
    },
    [],
  );

  // True while the two legs of a combined (two-dice) human move are still
  // animating, so the player can't interrupt the sequence mid-flight.
  const [moving, setMoving] = useState(false);
  // Timers for the remaining legs of an in-progress combined human move.
  const moveTimersRef = useRef<number[]>([]);
  // Remaining legs of Ada's in-progress combined move (solo play only).
  const cpuLegsRef = useRef<Move[]>([]);
  useEffect(
    () => () => {
      moveTimersRef.current.forEach((t) => clearTimeout(t));
      moveTimersRef.current = [];
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

  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);
  const [tableGraphic, setTableGraphic] = useState<TablePalette | null>(readTableGraphic);

  const reset = () => {
    const fresh = freshState();
    stateRef.current = fresh;
    setState(fresh);
    setSelected(null);
    setPassBubble(null);
    setMoving(false);
    moveTimersRef.current.forEach((t) => clearTimeout(t));
    moveTimersRef.current = [];
    cpuLegsRef.current = [];
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
    setSelected(null);
  }, [isMulti, isHost, match?.version, remoteState]);

  const moves =
    !moving && state.rolled && state.turn === "human"
      ? legalMoves(state.board, state.dice, "human")
      : [];
  const destinations =
    selected === null ? [] : moves.filter((m) => m.from === selected).map((m) => m.to);

  // Human has checkers on the bar and is waiting to re-enter after rolling.
  const barNeedsMove =
    state.board.bar.human > 0 && state.turn === "human" && state.rolled;

  // Dice shown scattered across the middle of the board: the rolloff dice while
  // deciding who starts, then the active turn's dice during play.
  const boardDice =
    state.phase === "rolloff"
      ? [state.rolloff.human, state.rolloff.cpu].filter((d): d is number => d !== null)
      : state.dice;

  // Hand the dice over when we have no legal moves left, pausing for a
  // moment so the player can watch the board settle before the CPU rolls.
  useEffect(() => {
    if (state.turn !== "human" || !state.rolled || state.winner) return;
    if (state.dice.length && legalMoves(state.board, state.dice, "human").length) return;
    // Rolled with dice still in hand but no legal move → the player passes.
    if (state.dice.length > 0) showPass("human");
    const timer = setTimeout(() => {
      apply((current) => ({
        ...current,
        turn: "cpu",
        dice: [],
        rolled: false,
        log: note(current.log, { side: "human", text: "turn ends." }),
      }));
      setSelected(null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [state.turn, state.rolled, state.dice, state.board, state.winner]);

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
  const rollForFirst = () => {
    if (!canRollOff) return;
    apply((current) => {
      const human = rollDie();
      return {
        ...current,
        rolloff: { ...current.rolloff, human },
        log: note(current.log, { side: "human", text: `roll a ${human} for the first turn.` }),
      };
    });
  };

  // Label for the rolloff button: prompt the active player to roll, and show a
  // waiting state for whoever rolls second (or while the opponent rolls).
  const rolloffLabel =
    state.rolloff.human === null
      ? canRollOff
        ? "Roll for first turn"
        : "Waiting…"
      : state.rolloff.cpu === null
        ? "Rolling…"
        : "Roll again";

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
          rolloff: { ...current.rolloff, cpu: rollDie() },
        };
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [isMulti, state.phase, state.rolloff.human, state.rolloff.cpu]);

  // Once both dice have landed, resolve the rolloff: a tie re-rolls, otherwise
  // the higher roller takes the first turn and opens with those dice.
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
            log: note(current.log, { side: null, text: `Tie at ${hh} — roll again.` }),
          };
        }
        const first: Seat = hh > cc ? "human" : "cpu";
        // The winner plays the two rolloff dice as their opening roll.
        return {
          ...current,
          turn: first,
          phase: "play",
          rolled: true,
          dice: [hh, cc],
          log: note(current.log, {
            side: first,
            text: `win the rolloff ${hh}-${cc} and open with those dice.`,
          }),
        };
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [isMulti, isHost, state.phase, state.rolloff.human, state.rolloff.cpu]);

  // Ada's turn: roll, then play her moves one at a time (solo play only).
  useEffect(() => {
    if (isMulti) return;
    if (state.turn !== "cpu" || state.winner) return;
    // Rolled with dice still in hand but no legal move → Ada passes.
    if (state.rolled && state.dice.length > 0 && !chooseCpuMove(state.board, state.dice)) {
      showPass("cpu");
    }
    // When a combined move is split into two die-steps, the second leg plays
    // right after the first flight lands (plus a short pause); otherwise pause
    // 3 seconds between rolls/moves so each flight is readable.
    const playingLeg = cpuLegsRef.current.length > 0;
    const timer = setTimeout(() => {
      const current = stateRef.current;
      if (current.turn !== "cpu" || current.winner) return;
      let next: State;

      if (playingLeg) {
        const leg = cpuLegsRef.current[0]!;
        cpuLegsRef.current = cpuLegsRef.current.slice(1);
        const { board, hit } = applyMove(current.board, leg, "cpu");
        const dice = consumeDice(current.dice, leg.dice);
        next = {
          ...current,
          board,
          dice,
          winner: findWinner(board),
          log: note(current.log, {
            side: "cpu",
            text: `plays ${describeMove(leg, "cpu")}${hit ? " and hits a blot" : ""}.`,
          }),
        };
      } else if (!current.rolled) {
        const dice = rollDice();
        next = {
          ...current,
          dice,
          rolled: true,
          log: note(current.log, {
            side: "cpu",
            text: `rolls ${dice[0]} and ${dice[1]}${dice.length === 4 ? " (doubles)" : ""}.`,
          }),
        };
      } else {
        const move = current.dice.length ? chooseCpuMove(current.board, current.dice) : null;
        if (!move) {
          next = {
            ...current,
            turn: "human",
            dice: [],
            rolled: false,
            log: note(current.log, { side: "cpu", text: "is done." }),
          };
        } else {
          const legs = splitMove(move);
          const leg = legs[0]!;
          cpuLegsRef.current = legs.slice(1);
          const { board, hit } = applyMove(current.board, leg, "cpu");
          const dice = consumeDice(current.dice, leg.dice);
          next = {
            ...current,
            board,
            dice,
            winner: findWinner(board),
            log: note(current.log, {
              side: "cpu",
              text: `plays ${describeMove(leg, "cpu")}${hit ? " and hits a blot" : ""}.`,
            }),
          };
        }
      }
      stateRef.current = next;
      setState(next);
    }, playingLeg ? FLIGHT_MS + LEG_PAUSE_MS : 3000);
    return () => clearTimeout(timer);
  }, [isMulti, state.turn, state.rolled, state.dice, state.board, state.winner]);

  const applyHumanLeg = (leg: Move) => {
    apply((current) => {
      const { board, hit } = applyMove(current.board, leg, "human");
      const dice = consumeDice(current.dice, leg.dice);
      return {
        ...current,
        board,
        dice,
        winner: findWinner(board),
        log: note(current.log, {
          side: "human",
          text: `play ${describeMove(leg, "human")}${hit ? " and hit a blot" : ""}.`,
        }),
      };
    });
  };

  // Play a move, splitting combined (two-dice) moves into separate legs so each
  // die is animated as its own flight with a short pause in between.
  const play = (move: Move) => {
    setSelected(null);
    const legs = splitMove(move);
    applyHumanLeg(legs[0]!);
    if (legs.length > 1) setMoving(true);
    for (let i = 1; i < legs.length; i++) {
      const leg = legs[i]!;
      const timer = window.setTimeout(() => {
        applyHumanLeg(leg);
        if (i === legs.length - 1) setMoving(false);
      }, i * (FLIGHT_MS + LEG_PAUSE_MS));
      moveTimersRef.current.push(timer);
    }
  };

  const status = isMulti && !match
    ? "Opening the shared table…"
    : state.winner
      ? state.winner === "human"
        ? "You bore off first — game won"
        : `${opponentName} bore off first`
      : state.phase === "rolloff"
        ? state.rolloff.human === null
          ? "Highest roll goes first"
          : state.rolloff.cpu === null
            ? `${opponentName} is rolling…`
            : rolloffWinner === null
              ? "Tie — roll again"
              : rolloffWinner === "human"
                ? "You go first"
                : `${opponentName} goes first`
        : state.turn === "cpu"
          ? isMulti
            ? `Waiting for ${opponentName}…`
            : "Rolling and moving…"
          : state.rolled
            ? "Choose a checker, then a point"
            : "Your roll";

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus={status}
      opponentDisconnected={opponentDisconnected}
      disconnectSecondsLeft={disconnectSecondsLeft}
      disconnectExpired={disconnectExpired}
      gameInProgress={
        !state.winner && (state.phase === "play" || state.rolloff.human !== null || state.rolloff.cpu !== null)
      }
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/backgammon", search: { opponent: nickname, match: newMatchId } });
        setState(freshState());
        setSelected(null);
      }}
      onNewGame={reset}
      rail={null}
      menuExtra={
        <TableOptionsDialog tableGraphic={tableGraphic} onSelect={setTableGraphic} />
      }
    >
      <GameOverDialog
        open={Boolean(state.winner)}
        result={state.winner === "human" ? "win" : "loss"}
        playerScore={state.board.off.human}
        opponentScore={state.board.off.cpu}
        scoreLabel="Checkers borne off"
        opponentName={opponentName}
        playerAvatar={playerAvatar}
        onPlayAgain={reset}
      />
      <div className="space-y-6">
        {/* Opponent — top of the table */}
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-gold/15 bg-brand/50 p-4">
          <div className="flex items-center gap-3">
            <div className="relative inline-block">
              <img
                src={ADA_AVATAR}
                alt={opponentName}
                width={64}
                height={64}
                className="size-14 rounded-full border-2 border-gold/40 bg-surface object-cover"
              />
              {passBubble === "cpu" && <CloudChat text="PASS" />}
            </div>
            <div>
              <p className="font-display text-lg font-bold">{opponentName}</p>
              <p className="text-xs text-ivory/60">
                {state.turn === "cpu" && !state.winner ? "Moving…" : "Waiting"}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-gold/20 bg-surface/60 px-4 py-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/50">Borne off</p>
            <div className="mx-auto mt-1 flex max-w-36 flex-wrap items-center justify-center gap-1">
              {Array.from({ length: state.board.off.cpu }, (_, i) => (
                <span
                  key={`off-cpu-${i}`}
                  title="Opponent piece"
                  className="size-4 rounded-full border border-gold/40 bg-surface shadow-sm shadow-black/30"
                />
              ))}
              {state.board.off.cpu === 0 && (
                <span className="text-[10px] uppercase tracking-[0.2em] text-ivory/35">none</span>
              )}
            </div>
          </div>
        </div>

        <Board
          board={state.board}
          selected={selected}
          destinations={destinations}
          selectable={moves.map((m) => m.from)}
          barNeedsMove={barNeedsMove}
          dice={boardDice}
          onSelect={(index) => setSelected(index)}
          onMoveTo={(to) => {
            const move = moves.find((m) => m.from === selected && m.to === to);
            if (move) play(move);
          }}
          tableGraphic={tableGraphic}
        />

        {/* Player — bottom of the table */}
        <div className="flex items-center gap-4 rounded-2xl border border-gold/15 bg-brand/50 p-4">
          <div className="flex shrink-0 items-center gap-3">
            <PlayerAvatar
              avatar={playerAvatar}
              onSelect={setPlayerAvatar}
              {...(passBubble === "human" ? { message: "PASS" } : {})}
            />
            <div>
              <p className="font-display text-lg font-bold">You</p>
              <p className="text-xs text-ivory/60">
                {state.turn === "human" && !state.winner ? "Your turn" : "Waiting"}
              </p>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center">
            {state.winner ? (
              <Button variant="parlor" onClick={reset}>
                Play again
              </Button>
            ) : state.phase === "rolloff" ? (
              <Button
                variant="parlor"
                onClick={rollForFirst}
                disabled={!canRollOff}
                className="animate-gentle-flash"
              >
                {rolloffLabel}
              </Button>
            ) : (
              <Button
                variant="parlor"
                disabled={state.turn !== "human" || state.rolled}
                onClick={() =>
                  apply((current) => {
                    const dice = rollDice();
                    return {
                      ...current,
                      dice,
                      rolled: true,
                      log: note(current.log, {
                        side: "human",
                        text: `roll ${dice[0]} and ${dice[1]}${dice.length === 4 ? " (doubles)" : ""}.`,
                      }),
                    };
                  })
                }
              >
                Roll the dice
              </Button>
            )}
          </div>
          <div className="shrink-0 rounded-lg border border-gold/20 bg-surface/60 px-4 py-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/50">Borne off</p>
            <div className="mx-auto mt-1 flex max-w-36 flex-wrap items-center justify-center gap-1">
              {Array.from({ length: state.board.off.human }, (_, i) => (
                <span
                  key={`off-human-${i}`}
                  title="Your piece"
                  className="size-4 rounded-full border border-black/20 bg-cream shadow-sm shadow-black/30"
                />
              ))}
              {state.board.off.human === 0 && (
                <span className="text-[10px] uppercase tracking-[0.2em] text-ivory/35">none</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </TableShell>
  );
}

function describeMove(move: Move, player: Seat) {
  const label = (index: number) => (player === "human" ? index + 1 : 24 - index);
  const from = move.from === "bar" ? "the bar" : `point ${label(move.from)}`;
  const to = move.to === "off" ? "off the board" : `point ${label(move.to)}`;
  return `${from} to ${to}`;
}

type PieceLoc = number | "bar" | "off";

// Duration of a single checker flight (mirrors the `duration-1000` class).
const FLIGHT_MS = 1000;

// Pause between the two legs of a combined (two-dice) move so each die's
// flight reads as a separate step.
const LEG_PAUSE_MS = 500;

type FlyPiece = {
  key: number;
  side: "human" | "cpu";
  from: PieceLoc;
  to: PieceLoc;
  x: number;
  y: number;
  tx: number;
  ty: number;
  arrived: boolean;
  fadeOut: boolean;
  settled: boolean;
  delay: number;
};

// Detect the single checker movements between two consecutive board states.
function detectMoves(
  prev: BoardState,
  next: BoardState,
): { side: "human" | "cpu"; from: PieceLoc; to: PieceLoc }[] {
  const out: { side: "human" | "cpu"; from: PieceLoc; to: PieceLoc }[] = [];
  for (const side of ["human", "cpu"] as const) {
    const at = (b: BoardState, i: number) =>
      side === "human" ? Math.max(0, b.points[i]!) : Math.max(0, -b.points[i]!);
    const bar = (b: BoardState) => b.bar[side];
    const off = (b: BoardState) => b.off[side];

    let from: PieceLoc | null = null;
    let to: PieceLoc | null = null;
    if (bar(next) < bar(prev)) from = "bar";
    if (bar(next) > bar(prev)) to = "bar";
    if (off(next) > off(prev)) to = "off";
    for (let i = 0; i < 24; i++) {
      if (at(next, i) < at(prev, i)) from = i;
      if (at(next, i) > at(prev, i)) to = i;
    }
    if (from !== null && to !== null) out.push({ side, from, to });
  }
  return out;
}

function Board({
  board,
  selected,
  destinations,
  selectable,
  barNeedsMove,
  dice,
  onSelect,
  onMoveTo,
  tableGraphic,
}: {
  board: BoardState;
  selected: number | "bar" | null;
  destinations: (number | "off")[];
  selectable: (number | "bar")[];
  barNeedsMove: boolean;
  dice: number[];
  onSelect: (index: number | "bar") => void;
  onMoveTo: (to: number | "off") => void;
  tableGraphic: TablePalette | null;
}) {
  const topRow = Array.from({ length: 12 }, (_, i) => 12 + i);
  const bottomRow = Array.from({ length: 12 }, (_, i) => 11 - i);
  const p = tableGraphic ?? CLASSIC_PALETTE;
  // Opponent pieces default to a dark grey, but schemes with dark bars (e.g.
  // sapphire and violet) supply a contrasting red so they stay visible.
  const oppFill = p.opponentPiece ?? "#2a2a2a";
  const oppBorder = p.opponentPieceBorder ?? "#0b0b0b";

  const boardRef = useRef<HTMLDivElement>(null);
  const pointRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const barRef = useRef<HTMLDivElement>(null);
  const barCheckersRef = useRef<HTMLDivElement>(null);
  const prevBoardRef = useRef(board);
  const [flies, setFlies] = useState<FlyPiece[]>([]);

  useEffect(() => {
    const prev = prevBoardRef.current;
    prevBoardRef.current = board;
    const moved = detectMoves(prev, board);
    if (!moved.length) return;

    const boardEl = boardRef.current;
    if (!boardEl) return;
    const boardRect = boardEl.getBoundingClientRect();
    // Responsive checker metrics (mirrors the Tailwind classes on the checkers
    // and points: size-4/sm:size-5, gap-0.5/sm:gap-1, p-0.5/sm:p-1.5).
    const isSm = window.matchMedia("(min-width: 640px)").matches;
    const size = isSm ? 20 : 16;
    const gap = isSm ? 4 : 2;
    const pad = isSm ? 6 : 2;

    // The fly container is `absolute inset-0` inside the board, so its (0,0)
    // sits at the board's *padding box* (inside the `border-4`), not the
    // border box that getBoundingClientRect reports. Account for that offset
    // so the piece lands pixel-exactly on the checker.
    const boardStyle = window.getComputedStyle(boardEl);
    const borderLeft = parseFloat(boardStyle.borderLeftWidth) || 0;
    const borderTop = parseFloat(boardStyle.borderTopWidth) || 0;

    // Centre of the checker being moved, measured from the bar edge outward so
    // the piece starts and lands exactly where the checkers sit (not the empty
    // middle of the triangle, which is what the point's bounding box centre is).
    const pointCheckerCenter = (index: number, count: number): { x: number; y: number } => {
      const el = pointRefs.current[index];
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2 - boardRect.left - borderLeft;
      const top = index >= 12;
      // The moving checker sits on top of the stack. Top points pack down from
      // the top (justify-start), so the newest checker lands `count-1` steps
      // down from the top. Bottom points pack up from the bottom (justify-end),
      // so the newest checker lands `count-1` steps above the base — i.e. above
      // the highest piece already sitting on the triangle.
      const stackIndex = Math.max(0, Math.min(count - 1, 4));
      const y = top
        ? r.top + pad + stackIndex * (size + gap) + size / 2 - boardRect.top - borderTop
        : r.bottom - pad - size / 2 - stackIndex * (size + gap) - boardRect.top - borderTop;
      return { x, y };
    };

    // Position of a bar checker at a given index within the checker row.
    const barCheckerCenter = (containerIndex: number): { x: number; y: number } => {
      const container = barCheckersRef.current;
      const barEl = barRef.current;
      if (!container || !barEl) return { x: 0, y: 0 };
      const cr = container.getBoundingClientRect();
      const br = barEl.getBoundingClientRect();
      const step = size + 4; // checker size + the bar container's gap-1 (4px)
      return {
        x: cr.left + Math.max(0, containerIndex) * step + size / 2 - boardRect.left - borderLeft,
        y: br.top + br.height / 2 - boardRect.top - borderTop,
      };
    };

    // Bar checkers sit in a single flex row (human first on the left, cpu after).
    // A piece leaving the bar (re-entry) sits at the last slot of its side in the
    // *previous* board, while a piece arriving on the bar (after a hit) slots in
    // at the last slot of its side in the *next* board. Using the next board for
    // arrivals matters when the other side re-enters in the same leg: a re-entry
    // removes a checker from the row and shifts the landing slot left by one.
    const barIndex = (side: "human" | "cpu", arriving: boolean): number => {
      const b = arriving ? board : prev;
      const human = b.bar.human;
      const cpu = b.bar.cpu;
      return side === "human" ? human - 1 : human + cpu - 1;
    };

    // Signed checker count for a side at a location in a given board state.
    const countAt = (b: BoardState, loc: PieceLoc, side: "human" | "cpu"): number =>
      typeof loc === "number"
        ? Math.max(0, side === "human" ? b.points[loc]! : -b.points[loc]!)
        : 0;

    const started: FlyPiece[] = moved.map((m, idx) => {
      const from =
        m.from === "bar"
          ? barCheckerCenter(barIndex(m.side, false))
          : pointCheckerCenter(m.from as number, countAt(prev, m.from, m.side));
      const fadeOut = m.to === "off";
      const to =
        m.to === "bar"
          ? barCheckerCenter(barIndex(m.side, true))
          : fadeOut
            ? from
            : pointCheckerCenter(m.to as number, countAt(board, m.to, m.side));
      // A piece knocked to the bar waits for the hitter to land before flying.
      const delay = m.to === "bar" ? FLIGHT_MS : 0;
      return {
        key: idx,
        side: m.side,
        from: m.from,
        to: m.to,
        x: from.x,
        y: from.y,
        tx: to.x,
        ty: to.y,
        arrived: false,
        fadeOut,
        settled: false,
        delay,
      };
    });
    setFlies(started);

    // Start the immediate flights right away, then the delayed (hit-to-bar)
    // flights once the hitter has landed.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlies((current) => current.map((f) => (f.delay > 0 ? f : { ...f, arrived: true })));
      });
    });
    const arriveDelayedTimer = started.some((f) => f.delay > 0)
      ? window.setTimeout(() => {
          setFlies((current) =>
            current.map((f) => (f.delay > 0 && !f.arrived ? { ...f, arrived: true } : f)),
          );
        }, FLIGHT_MS)
      : undefined;

    // After a flight lands, fade the ghost out so it doesn't stack on top of the
    // checker that is now already rendered in the destination. Delayed pieces
    // settle a full flight later.
    const settleTimer = window.setTimeout(() => {
      setFlies((current) => current.map((f) => (f.delay > 0 ? f : { ...f, settled: true })));
    }, FLIGHT_MS + 50);
    const settleDelayedTimer = started.some((f) => f.delay > 0)
      ? window.setTimeout(() => {
          setFlies((current) => current.map((f) => (f.delay > 0 ? { ...f, settled: true } : f)));
        }, 2 * FLIGHT_MS + 50)
      : undefined;
    const clearTimer = window.setTimeout(
      () => setFlies([]),
      Math.max(0, ...started.map((f) => f.delay)) + 2 * FLIGHT_MS + 100,
    );
    return () => {
      cancelAnimationFrame(raf);
      if (arriveDelayedTimer) clearTimeout(arriveDelayedTimer);
      clearTimeout(settleTimer);
      if (settleDelayedTimer) clearTimeout(settleDelayedTimer);
      clearTimeout(clearTimer);
    };
  }, [board]);

  // Checkers flying onto the bar (after a hit) are hidden here until the fly
  // ghost settles, mirroring how destination points hide their incoming checker.
  const barIncoming = (side: "human" | "cpu") =>
    flies.filter((f) => f.to === "bar" && f.side === side && !f.settled).length;

  const renderPoint = (index: number, top: boolean) => {
    const count = board.points[index]!;
    // Hide the checker that is currently "in flight" to this point so the
    // animated piece lands as the new checker instead of doubling up on top
    // of the one already rendered here.
    const incoming = flies.filter((f) => f.to === index && !f.fadeOut && !f.settled).length;
    const shown = count > 0 ? Math.max(0, count - incoming) : Math.min(0, count + incoming);
    const isDestination = destinations.includes(index);
    const isSelectable = selectable.includes(index);
    const isSelected = selected === index;
    return (
      <button
        key={index}
        ref={(el) => {
          pointRefs.current[index] = el;
        }}
        onClick={() => (isDestination ? onMoveTo(index) : isSelectable ? onSelect(index) : undefined)}
        className={`relative flex min-h-32 flex-col ${top ? "justify-start" : "justify-end"} gap-0.5 p-0.5 sm:gap-1 sm:p-1.5 transition-shadow ${
          isDestination
            ? "ring-2 ring-gold ring-offset-1 ring-offset-[var(--board-surface)]"
            : isSelected
              ? "ring-2 ring-gold/60 ring-offset-1 ring-offset-[var(--board-surface)]"
              : ""
        } ${isSelectable || isDestination ? "cursor-pointer" : "cursor-default"}`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: index % 2 === 0 ? "var(--board-point-light)" : "var(--board-point-dark)",
            clipPath: top
              ? "polygon(0 0, 100% 0, 50% 100%)"
              : "polygon(50% 0, 100% 100%, 0 100%)",
          }}
        />
        {Array.from({ length: Math.min(Math.abs(shown), 5) }, (_, i) => {
          const overflow = Math.abs(shown) - 5;
          const isLast = i === Math.min(Math.abs(shown), 5) - 1;
          return (
            <span
              key={i}
              className={`relative z-10 mx-auto flex size-4 items-center justify-center sm:size-5 rounded-full border shadow-sm shadow-black/30 ${
                count > 0 ? "border-[#6b5233] bg-cream" : "border-[var(--opp-piece-border)] bg-[var(--opp-piece)]"
              }`}
            >
              {isLast && overflow > 0 && (
                <span className={`text-[9px] font-bold leading-none ${count > 0 ? "text-[#4a3520]" : "text-cream"}`}>
                  +{overflow}
                </span>
              )}
            </span>
          );
        })}
      </button>
    );
  };

  return (
    <div
      ref={boardRef}
      className="relative flex flex-col gap-3 rounded-2xl border-4 border-[var(--board-border)] bg-[var(--board-surface)] p-3 shadow-2xl shadow-black/40"
      style={
        {
          "--board-surface": p.surface,
          "--board-border": p.border,
          "--board-point-light": p.pointLight,
          "--board-point-dark": p.pointDark,
          "--board-bar": p.bar,
          "--board-bar-text": p.barText,
          "--board-divider": p.divider,
          "--opp-piece": oppFill,
          "--opp-piece-border": oppBorder,
        } as CSSProperties
      }
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-3 left-1/2 z-10 w-px -translate-x-1/2 bg-[var(--board-divider)] opacity-40"
      />
      <div className="grid grid-cols-12 gap-1">{topRow.map((index) => renderPoint(index, true))}</div>
      <div ref={barRef} className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-[var(--board-divider)] bg-[var(--board-bar)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--board-bar-text)]">Bar</span>
          <div ref={barCheckersRef} className="flex flex-wrap items-center gap-1">
            {Array.from({ length: Math.max(0, board.bar.human - barIncoming("human")) }, (_, i) => (
              <button
                key={`bar-you-${i}`}
                type="button"
                title="Your piece — click to re-enter"
                onClick={() => (selectable.includes("bar") ? onSelect("bar") : undefined)}
                className={`relative size-4 sm:size-5 rounded-full border p-0 transition-colors ${
                  selected === "bar" ? "border-gold bg-gold/30" : "border-[#6b5233] bg-cream"
                } shadow-sm shadow-black/30 ${
                  selectable.includes("bar") ? "cursor-pointer" : "cursor-default"
                }`}
              >
                {barNeedsMove && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-1 rounded-full border-2 border-gold/70 border-t-transparent border-l-transparent animate-spin"
                  />
                )}
              </button>
            ))}
            {Array.from({ length: Math.max(0, board.bar.cpu - barIncoming("cpu")) }, (_, i) => (
              <span
                key={`bar-opp-${i}`}
                title="Opponent piece"
                className="size-4 sm:size-5 rounded-full border border-[var(--opp-piece-border)] bg-[var(--opp-piece)] shadow-sm shadow-black/30"
              />
            ))}
            {board.bar.human === 0 && board.bar.cpu === 0 && (
              <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--board-bar-text)] opacity-50">empty</span>
            )}
          </div>
        </div>
        <button
          className={`rounded px-2 py-1 ${destinations.includes("off") ? "bg-gold text-[#2c2012]" : "text-[var(--board-bar-text)] opacity-60"}`}
          onClick={() => destinations.includes("off") && onMoveTo("off")}
        >
          Bear off
        </button>
      </div>
      <div className="grid grid-cols-12 gap-1">
        {bottomRow.map((index) => renderPoint(index, false))}
      </div>
      {dice.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20">
          {dice.map((value, index) => {
            const spot = diceSpot(index, value);
            return (
              <span
                key={`${index}-${value}`}
                className="absolute rounded-lg shadow-md shadow-black/40"
                style={{
                  left: `${spot.x}%`,
                  top: `${spot.y}%`,
                  transform: `translate(-50%, -50%) rotate(${spot.angle}deg)`,
                }}
              >
                <Die value={value} />
              </span>
            );
          })}
        </div>
      )}
      {flies.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {flies.map((f) => (
            <span
              key={f.key}
              className={`absolute size-4 sm:size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-md shadow-black/60 transition-all duration-1000 ease-in-out ${
                f.side === "human" ? "border-[#6b5233] bg-cream" : "border-[var(--opp-piece-border)] bg-[var(--opp-piece)]"
              } ${f.arrived && (f.fadeOut || f.settled) ? "scale-50 opacity-0" : "opacity-100"}`}
              style={{
                left: f.arrived ? f.tx : f.x,
                top: f.arrived ? f.ty : f.y,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
