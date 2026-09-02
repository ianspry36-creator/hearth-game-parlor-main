import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { getGame } from "@/lib/games";
import { CHARLOTTE_AVATAR, readAvatar } from "@/lib/avatars";
import { useMatch } from "@/lib/multiplayer";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  allLegalLines,
  canDraw,
  chooseEdge,
  edgeId,
  makeBoard,
  newSeed,
  parseEdge,
  parseTriId,
  trianglesClosedBy,
  type Owner,
} from "@/lib/triangles";

export const Route = createFileRoute("/triangles")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Play Triangles — Love Card Games" },
      {
        name: "description",
        content:
          "Twenty spots scattered at random: draw lines against Charlotte or a live opponent and fill each triangle you close with your colour.",
      },
      { property: "og:title", content: "Play Triangles — Love Card Games" },
      {
        property: "og:description",
        content: "Triangles in the parlor: claim the most triangles by closing the third line.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrianglesTable,
});

type Seat = "human" | "cpu";
type LogEntry = { side: Seat | null; text: string };

type State = {
  phase: "play" | "over";
  turn: Seat;
  seed: number;
  lines: Record<string, Owner>;
  claimed: Record<string, Owner>;
  log: LogEntry[];
  winner: Seat | "draw" | null;
};

// The first render must match the server, so the opening board uses a fixed
// seed and is reshuffled once the client mounts.
const SSR_SEED = 20260829;

const freshState = (seed = newSeed()): State => ({
  phase: "play",
  turn: "human",
  seed,
  lines: {},
  claimed: {},
  log: [
    {
      side: null,
      text: `Draw a line between any two spots without touching or crossing an existing line. Close a triangle with no spot inside it and it fills with your colour.`,
    },
  ],
  winner: null,
});

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);
const flip = (side: Seat): Seat => (side === "human" ? "cpu" : "human");
const flipOwner = (owner: Owner): Owner => (owner === "human" ? "cpu" : "human");

const flipMap = (map: Record<string, Owner>) =>
  Object.fromEntries(Object.entries(map).map(([key, owner]) => [key, flipOwner(owner)]));

function mirror(state: State): State {
  return {
    ...state,
    turn: flip(state.turn),
    lines: flipMap(state.lines),
    claimed: flipMap(state.claimed),
    winner: state.winner && state.winner !== "draw" ? flip(state.winner) : state.winner,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? flip(entry.side) : null })),
  };
}

const tally = (claimed: Record<string, Owner>, side: Owner) =>
  Object.values(claimed).filter((owner) => owner === side).length;

function TrianglesTable() {
  const game = getGame("triangles");
  const navigate = useNavigate();
  const { opponent, match: matchId } = Route.useSearch();
  const {
    match,
    isHost,
    opponentName: liveOpponent,
    remoteState,
    publish,
  } = useMatch<State>(matchId);
  const [state, setState] = useState<State>(() => freshState(SSR_SEED));
  const stateRef = useRef(state);
  stateRef.current = state;

  const board = useMemo(() => makeBoard(state.seed), [state.seed]);

  const isMulti = Boolean(matchId);
  const opponentName = liveOpponent ?? opponent ?? "Charlotte";

  const apply = (fn: (current: State) => State) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (isMulti) void publish(isHost ? next : mirror(next));
  };

  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);
  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const reset = () => {
    const fresh = freshState();
    stateRef.current = fresh;
    setState(fresh);
    setSelected(null);
    setHint(null);
    if (isMulti) void publish(isHost ? fresh : mirror(fresh));
  };

  // Scatter a fresh set of spots once we're on the client (avoids an SSR mismatch).
  useEffect(() => {
    if (isMulti) return;
    setState((current) => {
      if (current.seed !== SSR_SEED || Object.keys(current.lines).length) return current;
      const fresh = freshState();
      stateRef.current = fresh;
      return fresh;
    });
  }, [isMulti]);

  useEffect(() => {
    if (!isMulti || !match || match.state || !isHost) return;
    const fresh = freshState();
    stateRef.current = fresh;
    setState(fresh);
    void publish(fresh);
  }, [isMulti, match, isHost, publish]);

  useEffect(() => {
    if (!isMulti || !remoteState) return;
    const view = isHost ? remoteState : mirror(remoteState);
    stateRef.current = view;
    setState(view);
  }, [isMulti, isHost, match?.version, remoteState]);

  const drawLine = (current: State, key: string, side: Seat): State => {
    if (current.phase !== "play" || current.lines[key]) return current;
    const [a, b] = parseEdge(key);
    const points = makeBoard(current.seed).points;
    if (!canDraw(points, current.lines, a, b)) return current;
    const lines = { ...current.lines, [key]: side };
    const won = trianglesClosedBy(points, lines, a, b, current.claimed);
    const claimed = { ...current.claimed };
    for (const id of won) claimed[id] = side;
    const drawn: State = {
      ...current,
      lines,
      claimed,
      turn: flip(side),
      log: won.length
        ? note(current.log, {
            side,
            text: `close ${won.length === 1 ? "a triangle" : `${won.length} triangles`}.`,
          })
        : current.log,
    };
    if (allLegalLines(points, lines).length === 0) {
      const mine = tally(claimed, "human");
      const theirs = tally(claimed, "cpu");
      return {
        ...drawn,
        phase: "over",
        winner: mine === theirs ? "draw" : mine > theirs ? "human" : "cpu",
        log: note(drawn.log, { side: null, text: `The board is full: ${mine} to ${theirs}.` }),
      };
    }
    return drawn;
  };

  const myTurn = state.turn === "human" && state.phase === "play";

  const onSpotClick = (index: number) => {
    if (!myTurn) return;
    if (selected === null) {
      setSelected(index);
      setHint(null);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    const key = edgeId(selected, index);
    if (state.lines[key]) {
      setHint("That line is already drawn.");
      return;
    }
    if (!canDraw(board.points, state.lines, selected, index)) {
      setHint("That line would touch or cross an existing line.");
      return;
    }
    setSelected(null);
    setHint(null);
    apply((current) => drawLine(current, key, "human"));
  };

  // Charlotte draws her line (solo play only).
  useEffect(() => {
    if (isMulti) return;
    if (state.phase !== "play" || state.turn !== "cpu") return;
    const timer = setTimeout(() => {
      setState((current) => {
        if (current.phase !== "play" || current.turn !== "cpu") return current;
        const key = chooseEdge(board.points, current.lines, current.claimed);
        if (!key) return current;
        const next = drawLine(current, key, "cpu");
        stateRef.current = next;
        return next;
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [isMulti, board, state.phase, state.turn, state.lines, state.claimed]);

  const mine = tally(state.claimed, "human");
  const theirs = tally(state.claimed, "cpu");

  const status =
    isMulti && !match
      ? "Opening the shared table…"
      : state.phase === "over"
        ? state.winner === "draw"
          ? "An even board — honours shared"
          : state.winner === "human"
            ? "You claimed the most triangles — you win"
            : `${opponentName} claimed the most triangles`
        : myTurn
          ? "Your line"
          : isMulti
            ? `Waiting for ${opponentName}…`
            : "Charlotte studies the spots…";

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus={status}
      gameInProgress={state.phase === "play" && Object.keys(state.lines).length > 0}
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/triangles", search: { opponent: nickname, match: newMatchId } });
        reset();
      }}
      onNewGame={reset}
      rail={null}
    >
      <GameOverDialog
        open={state.phase === "over"}
        result={state.winner === "human" ? "win" : state.winner === "cpu" ? "loss" : "draw"}
        playerScore={mine}
        opponentScore={theirs}
        scoreLabel="Triangles claimed"
        opponentName={opponentName}
        playerAvatar={playerAvatar}
        onPlayAgain={reset}
      />
      <div className="space-y-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold">
              {state.turn === "human" ? "Your turn" : `${opponentName}'s turn`}
            </p>
            <p className="mt-1 font-display text-3xl font-bold">
              <span className="text-player-coral">{mine}</span>{" "}
              <span className="text-sm font-normal text-ivory/50">to</span>{" "}
              <span className="text-player-teal">{theirs}</span>
            </p>
            <p className="mt-1 text-sm text-ivory/55">{status}</p>
          </div>
          {state.phase === "over" && (
            <Button variant="parlor" onClick={reset}>
              Play again
            </Button>
          )}
        </section>

        {/* Opponent — top of the table */}
        <section className="flex items-center gap-3 rounded-2xl border border-gold/15 bg-brand/50 p-4">
          <img
            src={CHARLOTTE_AVATAR}
            alt={opponentName}
            width={64}
            height={64}
            className="size-14 rounded-full border-2 border-player-teal/50 bg-surface object-cover"
          />
          <div>
            <p className="font-display text-lg font-bold">{opponentName}</p>
            <p className="text-xs text-ivory/60">
              {state.turn === "cpu" && state.phase === "play" ? "Their turn" : "Waiting"}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-gold/25 bg-brand/70 p-4 shadow-2xl shadow-black/40 sm:p-6">
          <svg
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
            className="mx-auto block w-full"
            role="img"
            aria-label="Triangles board"
          >
            {/* claimed triangles */}
            {Object.entries(state.claimed).map(([id, owner]) => {
              const [a, b, c] = parseTriId(id);
              const points = [a, b, c]
                .map((index) => {
                  const p = board.points[index]!;
                  return `${p.x},${p.y}`;
                })
                .join(" ");
              return (
                <polygon
                  key={id}
                  points={points}
                  strokeWidth={2}
                  className={
                    owner === "human"
                      ? "fill-player-coral/45 stroke-player-coral"
                      : "fill-player-teal/40 stroke-player-teal"
                  }
                />
              );
            })}

            {/* drawn lines */}
            {Object.entries(state.lines).map(([key, owner]) => {
              const [a, b] = parseEdge(key);
              const from = board.points[a]!;
              const to = board.points[b]!;
              return (
                <line
                  key={key}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  strokeWidth={5}
                  strokeLinecap="round"
                  className={
                    owner === "human" ? "stroke-player-coral" : "stroke-player-teal"
                  }
                />
              );
            })}

            {/* spots */}
            {board.points.map((p, index) => (
              <g key={index}>
                {myTurn && selected === index && (
                  <circle cx={p.x} cy={p.y} r={11} className="fill-player-coral/40" />
                )}
                <circle cx={p.x} cy={p.y} r={6} className="fill-cream" />
                {myTurn && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={14}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={() => onSpotClick(index)}
                  >
                    <title>Choose this spot</title>
                  </circle>
                )}
              </g>
            ))}
          </svg>
          <p className={`mt-4 text-center text-xs ${hint ? "text-amber-300" : "text-ivory/45"}`}>
            {hint ??
              "Click two spots to draw a line between them — it must not touch or cross any existing line."}
          </p>
        </section>

        {/* Player — bottom of the table */}
        <section className="flex items-center gap-3 rounded-2xl border border-gold/15 bg-brand/50 p-4">
          <PlayerAvatar avatar={playerAvatar} onSelect={setPlayerAvatar} />
          <div>
            <p className="font-display text-lg font-bold">You</p>
            <p className="text-xs text-ivory/60">{myTurn ? "Your turn" : "Waiting"}</p>
          </div>
        </section>
      </div>
    </TableShell>
  );
}
