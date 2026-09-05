import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
import { getGame } from "@/lib/games";
import { useMatch } from "@/lib/multiplayer";
import {
  applyMove,
  chooseCpuMove,
  consumeDice,
  initialBoard,
  legalMoves,
  rollDice,
  rollDie,
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
          className={`size-2 rounded-full ${pips.includes(i) ? "bg-brand" : ""}`}
        />
      ))}
    </span>
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
  const hitRef = useRef(false);

  const isMulti = Boolean(matchId);
  const opponentName = liveOpponent ?? opponent ?? "Ada";

  const apply = (fn: (current: State) => State) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (isMulti) void publish(isHost ? next : mirror(next));
  };

  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);

  const reset = () => {
    const fresh = freshState();
    stateRef.current = fresh;
    setState(fresh);
    setSelected(null);
    hitRef.current = false;
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
    state.rolled && state.turn === "human" ? legalMoves(state.board, state.dice, "human") : [];
  const destinations =
    selected === null ? [] : moves.filter((m) => m.from === selected).map((m) => m.to);

  // Human has checkers on the bar and is waiting to re-enter after rolling.
  const barNeedsMove =
    state.board.bar.human > 0 && state.turn === "human" && state.rolled;

  // Hand the dice over when we have no legal moves left.
  useEffect(() => {
    if (state.turn !== "human" || !state.rolled || state.winner) return;
    if (state.dice.length && legalMoves(state.board, state.dice, "human").length) return;
    const timer = setTimeout(() => {
      apply((current) => ({
        ...current,
        turn: "cpu",
        dice: [],
        rolled: false,
        log: note(current.log, { side: "human", text: "turn ends." }),
      }));
      setSelected(null);
    }, 500);
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

  const rolloffHeading =
    state.rolloff.human === null
      ? "Who starts"
      : state.rolloff.cpu === null
        ? "Rolling…"
        : rolloffWinner === null
          ? "Tie — roll again"
          : rolloffWinner === "human"
            ? "You go first"
            : `${opponentName} goes first`;

  const canRollOff =
    state.phase === "rolloff" &&
    (!isMulti || isHost) &&
    (state.rolloff.human === null ||
      (state.rolloff.cpu !== null && state.rolloff.human === state.rolloff.cpu));
  const rollForFirst = () => {
    if (!canRollOff) return;
    apply((current) => {
      const human = rollDie();
      return {
        ...current,
        rolloff: { human, cpu: null },
        log: note(current.log, { side: "human", text: `roll a ${human} for the first turn.` }),
      };
    });
  };

  // After you roll for the first turn, wait a beat before the opponent's die lands.
  useEffect(() => {
    if (isMulti && !isHost) return;
    if (state.phase !== "rolloff") return;
    if (state.rolloff.human === null || state.rolloff.cpu !== null) return;
    const timer = setTimeout(() => {
      apply((current) => {
        if (current.phase !== "rolloff") return current;
        if (current.rolloff.human === null || current.rolloff.cpu !== null) return current;
        const cpu = rollDie();
        const human = current.rolloff.human;
        if (human === cpu) {
          return {
            ...current,
            rolloff: { ...current.rolloff, cpu },
            log: note(current.log, { side: null, text: `Tie at ${human} — roll again.` }),
          };
        }
        const first: Seat = human > cpu ? "human" : "cpu";
        return {
          ...current,
          rolloff: { ...current.rolloff, cpu },
          log: note(current.log, {
            side: first,
            text: `win the rolloff ${human}-${cpu} and take the first turn.`,
          }),
        };
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [isMulti, isHost, state.phase, state.rolloff.human, state.rolloff.cpu]);

  // Once both dice have landed, pause briefly before the winner takes the first turn.
  useEffect(() => {
    if (isMulti && !isHost) return;
    if (state.phase !== "rolloff") return;
    const h = state.rolloff.human;
    const c = state.rolloff.cpu;
    if (h === null || c === null || h === c) return;
    const first: Seat = h > c ? "human" : "cpu";
    const timer = setTimeout(() => {
      apply((current) => {
        if (current.phase !== "rolloff") return current;
        if (current.rolloff.human === null || current.rolloff.cpu === null) return current;
        if (current.rolloff.human === current.rolloff.cpu) return current;
        return { ...current, turn: first, phase: "play", rolled: false, dice: [] };
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [isMulti, isHost, state.phase, state.rolloff.human, state.rolloff.cpu]);

  // Ada's turn: roll, then play her moves one at a time (solo play only).
  useEffect(() => {
    if (isMulti) return;
    if (state.turn !== "cpu" || state.winner) return;
    const wasHit = hitRef.current;
    hitRef.current = false;
    const timer = setTimeout(() => {
      setState((current) => {
        if (current.turn !== "cpu" || current.winner) return current;
        let next: State;
        if (!current.rolled) {
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
            const { board, hit } = applyMove(current.board, move, "cpu");
            if (hit) hitRef.current = true;
            const dice = consumeDice(current.dice, move.dice);
            next = {
              ...current,
              board,
              dice,
              winner: findWinner(board),
              log: note(current.log, {
                side: "cpu",
                text: `plays ${describeMove(move, "cpu")}${hit ? " and hits a blot" : ""}.`,
              }),
            };
          }
        }
        stateRef.current = next;
        return next;
      });
    }, wasHit ? 2000 : 800);
    return () => clearTimeout(timer);
  }, [isMulti, state.turn, state.rolled, state.dice, state.board, state.winner]);

  const play = (move: Move) => {
    apply((current) => {
      const { board, hit } = applyMove(current.board, move, "human");
      const dice = consumeDice(current.dice, move.dice);
      return {
        ...current,
        board,
        dice,
        winner: findWinner(board),
        log: note(current.log, {
          side: "human",
          text: `play ${describeMove(move, "human")}${hit ? " and hit a blot" : ""}.`,
        }),
      };
    });
    setSelected(null);
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
      gameInProgress={!state.winner}
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/backgammon", search: { opponent: nickname, match: newMatchId } });
        setState(freshState());
        setSelected(null);
      }}
      onNewGame={reset}
      rail={null}
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
            <img
              src={ADA_AVATAR}
              alt={opponentName}
              width={64}
              height={64}
              className="size-14 rounded-full border-2 border-gold/40 bg-surface object-cover"
            />
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

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gold/15 bg-brand/50 p-4">
          {state.phase === "rolloff" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold">{rolloffHeading}</p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-ivory/50">You</span>
                {state.rolloff.human !== null ? (
                  <Die value={state.rolloff.human} />
                ) : (
                  <span className="grid size-10 place-items-center rounded-lg border border-dashed border-gold/30 text-ivory/40">?</span>
                )}
                <span className="text-sm text-ivory/50">{opponentName}</span>
                {state.rolloff.cpu !== null ? (
                  <Die value={state.rolloff.cpu} />
                ) : (
                  <span className="grid size-10 place-items-center rounded-lg border border-dashed border-gold/30 text-ivory/40">?</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Dice</p>
              {state.dice.length ? (
                state.dice.map((die, index) => (
                  <Die key={`${die}-${index}`} value={die} />
                ))
              ) : (
                <span className="text-sm text-ivory/50">Not rolled</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
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
                {state.rolloff.human === null
                  ? "Roll for first turn"
                  : state.rolloff.cpu === null
                    ? "Rolling…"
                    : "Roll again"}
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
        </div>

        <Board
          board={state.board}
          selected={selected}
          destinations={destinations}
          selectable={moves.map((m) => m.from)}
          barNeedsMove={barNeedsMove}
          onSelect={(index) => setSelected(index)}
          onMoveTo={(to) => {
            const move = moves.find((m) => m.from === selected && m.to === to);
            if (move) play(move);
          }}
        />

        {/* Player — bottom of the table */}
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-gold/15 bg-brand/50 p-4">
          <div className="flex items-center gap-3">
            <PlayerAvatar avatar={playerAvatar} onSelect={setPlayerAvatar} />
            <div>
              <p className="font-display text-lg font-bold">You</p>
              <p className="text-xs text-ivory/60">
                {state.turn === "human" && !state.winner ? "Your turn" : "Waiting"}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-gold/20 bg-surface/60 px-4 py-2 text-center">
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

type FlyPiece = {
  key: number;
  side: "human" | "cpu";
  x: number;
  y: number;
  tx: number;
  ty: number;
  arrived: boolean;
  fadeOut: boolean;
  settled: boolean;
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
  onSelect,
  onMoveTo,
}: {
  board: BoardState;
  selected: number | "bar" | null;
  destinations: (number | "off")[];
  selectable: (number | "bar")[];
  barNeedsMove: boolean;
  onSelect: (index: number | "bar") => void;
  onMoveTo: (to: number | "off") => void;
}) {
  const topRow = Array.from({ length: 12 }, (_, i) => 12 + i);
  const bottomRow = Array.from({ length: 12 }, (_, i) => 11 - i);

  const boardRef = useRef<HTMLDivElement>(null);
  const pointRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const barRef = useRef<HTMLDivElement>(null);
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
    const centerOf = (el: Element | null) => {
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - boardRect.left,
        y: r.top + r.height / 2 - boardRect.top,
      };
    };
    const elFor = (loc: PieceLoc): Element | null =>
      loc === "bar"
        ? barRef.current
        : typeof loc === "number"
          ? (pointRefs.current[loc] ?? null)
          : null;

    const started: FlyPiece[] = moved.map((m, idx) => {
      const from = centerOf(elFor(m.from));
      const fadeOut = m.to === "off";
      const to = fadeOut ? from : centerOf(elFor(m.to));
      return {
        key: idx,
        side: m.side,
        x: from.x,
        y: from.y,
        tx: to.x,
        ty: to.y,
        arrived: false,
        fadeOut,
        settled: false,
      };
    });
    setFlies(started);

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlies(started.map((f) => ({ ...f, arrived: true })));
      });
    });
    // After the flight lands, fade the ghost out so it doesn't stack on top of
    // the checker that is now already rendered in the destination point.
    const settleTimer = window.setTimeout(() => {
      setFlies((current) => current.map((f) => ({ ...f, settled: true })));
    }, 750);
    const clearTimer = window.setTimeout(() => setFlies([]), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      clearTimeout(clearTimer);
    };
  }, [board]);

  const renderPoint = (index: number, top: boolean) => {
    const count = board.points[index]!;
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
        className={`flex min-h-32 flex-col ${top ? "justify-start" : "justify-end"} gap-0.5 sm:gap-1 rounded-md border p-0.5 sm:p-1.5 transition-colors ${
          isDestination
            ? "border-gold bg-gold/20"
            : isSelected
              ? "border-gold bg-gold/10"
              : index % 2 === 0
                ? "border-gold/10 bg-brand/70"
                : "border-gold/10 bg-surface/70"
        } ${isSelectable || isDestination ? "cursor-pointer" : "cursor-default"}`}
      >
        {Array.from({ length: Math.min(Math.abs(count), 5) }, (_, i) => (
          <span
            key={i}
            className={`mx-auto size-4 sm:size-5 rounded-full border ${
              count > 0 ? "border-black/20 bg-cream" : "border-gold/40 bg-surface"
            }`}
          />
        ))}
        {Math.abs(count) > 5 && (
          <span className="text-center text-[10px] text-ivory/70">+{Math.abs(count) - 5}</span>
        )}
        <span className="mt-auto text-center text-[9px] uppercase tracking-widest text-ivory/35">
          {index + 1}
        </span>
      </button>
    );
  };

  return (
    <div ref={boardRef} className="relative space-y-3 rounded-2xl border border-gold/25 bg-brand/70 p-3 shadow-2xl shadow-black/40">
      <div className="grid grid-cols-12 gap-1">{topRow.map((index) => renderPoint(index, true))}</div>
      <div ref={barRef} className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-gold/15 bg-surface/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-ivory/55">Bar</span>
          <div className="flex flex-wrap items-center gap-1">
            {Array.from({ length: board.bar.human }, (_, i) => (
              <button
                key={`bar-you-${i}`}
                type="button"
                title="Your piece — click to re-enter"
                onClick={() => (selectable.includes("bar") ? onSelect("bar") : undefined)}
                className={`relative size-4 sm:size-5 rounded-full border p-0 transition-colors ${
                  selected === "bar" ? "border-gold bg-gold/30" : "border-black/20 bg-cream"
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
            {Array.from({ length: board.bar.cpu }, (_, i) => (
              <span
                key={`bar-opp-${i}`}
                title="Opponent piece"
                className="size-4 sm:size-5 rounded-full border border-gold/40 bg-surface shadow-sm shadow-black/30"
              />
            ))}
            {board.bar.human === 0 && board.bar.cpu === 0 && (
              <span className="text-[10px] uppercase tracking-[0.2em] text-ivory/35">empty</span>
            )}
          </div>
        </div>
        <button
          className={`rounded px-2 py-1 ${destinations.includes("off") ? "bg-gold text-brand" : "text-ivory/40"}`}
          onClick={() => destinations.includes("off") && onMoveTo("off")}
        >
          Bear off
        </button>
      </div>
      <div className="grid grid-cols-12 gap-1">
        {bottomRow.map((index) => renderPoint(index, false))}
      </div>
      {flies.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {flies.map((f) => (
            <span
              key={f.key}
              className={`absolute size-4 sm:size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-md shadow-black/40 transition-all duration-700 ease-out ${
                f.side === "human" ? "border-black/20 bg-cream" : "border-gold/40 bg-surface"
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
