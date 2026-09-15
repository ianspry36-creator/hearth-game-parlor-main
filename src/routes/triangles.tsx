import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
import { getGame } from "@/lib/games";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
import { getNickname, RECONNECT_SECONDS, useMatch } from "@/lib/multiplayer";
import { useRecordMatchResult } from "@/lib/stats";
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
      { title: "Play Triangles — Cards and Games" },
      {
        name: "description",
        content:
          "Twenty spots scattered at random: draw lines against Ada or a live opponent and fill each triangle you close with your colour.",
      },
      { property: "og:title", content: "Play Triangles — Cards and Games" },
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
  rematch: Seat | null;
};

// The first render must match the server, so the opening board uses a fixed
// seed and is reshuffled once the client mounts.
const SSR_SEED = 20260829;

// A drag must finish within this many board units of a spot to draw the line.
const DROP_RADIUS = 36;

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
  rematch: null,
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
    rematch: state.rematch ? flip(state.rematch) : null,
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
    opponentAvatar,
    remoteState,
    publish,
    opponentDisconnected,
    disconnectSecondsLeft,
    disconnectExpired,
  } = useMatch<State>(matchId, Boolean(state.winner));
  const [state, setState] = useState<State>(() => freshState(SSR_SEED));
  const stateRef = useRef(state);
  stateRef.current = state;
  useRecordMatchResult(match, isHost, state.winner, matchId ? RECONNECT_SECONDS * 1000 : 0);

  const board = useMemo(() => makeBoard(state.seed), [state.seed]);

  const isMulti = Boolean(matchId);
  const opponentName = liveOpponent ?? opponent ?? "Ada";
  const playerName = getNickname() ?? "You";

  const apply = (fn: (current: State) => State) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (isMulti) void publish(isHost ? next : mirror(next));
  };

  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);
  const svgRef = useRef<SVGSVGElement>(null);
  // Drag source is tracked in a ref so move/up handlers never read a stale
  // value (mobile touch events can outpace a React re-render).
  const dragRef = useRef<{ from: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [dragTarget, setDragTarget] = useState<number | null>(null);
  const [dragValid, setDragValid] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [viewingBoard, setViewingBoard] = useState(false);

  const reset = () => {
    const fresh = freshState();
    stateRef.current = fresh;
    setState(fresh);
    dragRef.current = null;
    setDragFrom(null);
    setDragPoint(null);
    setDragTarget(null);
    setDragValid(false);
    setHint(null);
    setViewingBoard(false);
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

  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const mapped = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
  };

  const drawBetween = (a: number, b: number) => {
    if (a === b) return;
    const key = edgeId(a, b);
    if (state.lines[key]) {
      setHint("That line is already drawn.");
      return;
    }
    if (!canDraw(board.points, state.lines, a, b)) {
      setHint("That line would touch a spot or cross an existing line.");
      return;
    }
    setHint(null);
    apply((current) => drawLine(current, key, "human"));
  };

  // Nearest spot to a pointer position, or null when none is within drop range.
  const resolveTarget = (from: number, pt: { x: number; y: number }) => {
    let best = -1;
    let bestDist = Infinity;
    board.points.forEach((p, i) => {
      const dx = p.x - pt.x;
      const dy = p.y - pt.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best < 0 || best === from || bestDist > DROP_RADIUS * DROP_RADIUS) return null;
    return best;
  };

  const beginDrag = (index: number) => (e: ReactPointerEvent<SVGCircleElement>) => {
    if (!myTurn) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { from: index, startX: e.clientX, startY: e.clientY, moved: false };
    setDragFrom(index);
    setDragPoint(toSvgPoint(e.clientX, e.clientY));
    setDragTarget(null);
    setDragValid(false);
    setHint(null);
  };

  const moveDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8) {
      drag.moved = true;
    }
    const pt = toSvgPoint(e.clientX, e.clientY);
    setDragPoint(pt);
    if (pt) {
      const target = resolveTarget(drag.from, pt);
      if (target !== null) {
        const key = edgeId(drag.from, target);
        setDragTarget(target);
        setDragValid(!state.lines[key] && canDraw(board.points, state.lines, drag.from, target));
      } else {
        setDragTarget(null);
        setDragValid(false);
      }
    }
  };

  const endDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const from = drag.from;
    dragRef.current = null;
    setDragFrom(null);
    setDragPoint(null);
    setDragTarget(null);
    setDragValid(false);
    if (!drag.moved) return; // a tap, not a drag
    const pt = toSvgPoint(e.clientX, e.clientY);
    if (!pt) return;
    const best = resolveTarget(from, pt);
    if (best !== null) {
      drawBetween(from, best);
    }
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setDragFrom(null);
    setDragPoint(null);
    setDragTarget(null);
    setDragValid(false);
  };

  // The whole board is a no-scroll zone on touch devices: touching anywhere
  // inside the grid must never scroll the page. `touch-action: none` covers
  // most browsers, but a native non-passive listener is the reliable fallback
  // for SVG.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const preventScroll = (e: TouchEvent) => {
      e.preventDefault();
    };
    svg.addEventListener("touchmove", preventScroll, { passive: false });
    return () => svg.removeEventListener("touchmove", preventScroll);
  }, []);

  // Ada draws her line (solo play only).
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
            : "Ada studies the spots…";

  // Rematch flow: "human" means we asked, "cpu" means the opponent asked us.
  const rematchOutgoing = state.rematch === "human";
  const rematchIncoming = state.rematch === "cpu";

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus={status}
      opponentDisconnected={opponentDisconnected}
      disconnectSecondsLeft={disconnectSecondsLeft}
      disconnectExpired={disconnectExpired}
      gameInProgress={state.phase === "play" && Object.keys(state.lines).length > 0}
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/triangles", search: { opponent: nickname, match: newMatchId } });
        reset();
      }}
      onNewGame={reset}
      rail={null}
      containerClassName="px-2.5 sm:px-6"
      boxClassName="px-2 sm:px-3"
    >
      <GameOverDialog
        open={Boolean(state.winner) && !viewingBoard}
        result={state.winner === "human" ? "win" : state.winner === "cpu" ? "loss" : "draw"}
        playerScore={mine}
        opponentScore={theirs}
        scoreLabel="Triangles claimed"
        opponentName={opponentName}
        playerAvatar={playerAvatar}
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
      <div className="space-y-8">
        {/* Opponent — top of the table */}
        <section className="flex items-center gap-3 rounded-2xl border border-gold/15 bg-brand/50 px-1.5 py-4 sm:px-2.5">
          <img
            src={opponentAvatar ?? ADA_AVATAR}
            alt={opponentName}
            width={64}
            height={64}
            className="size-14 shrink-0 rounded-full border-2 border-player-teal/50 bg-surface object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold">{opponentName}</p>
            <p className="text-xs text-ivory/60">
              {state.turn === "cpu" && state.phase === "play" ? "Their turn" : "Waiting"}
            </p>
          </div>
          <p className="font-display text-2xl font-bold text-player-teal">{theirs}</p>
        </section>

        <section className="rounded-2xl border border-gold/25 bg-brand/70 px-1.5 py-4 shadow-2xl shadow-black/40 sm:px-2.5 sm:py-6">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
            className="mx-auto block w-full"
            role="img"
            aria-label="Triangles board"
            style={{ touchAction: "none" }}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
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

            {/* preview line while dragging */}
            {dragFrom !== null && dragPoint && (
              <line
                x1={board.points[dragFrom]!.x}
                y1={board.points[dragFrom]!.y}
                x2={dragValid && dragTarget !== null ? board.points[dragTarget]!.x : dragPoint.x}
                y2={dragValid && dragTarget !== null ? board.points[dragTarget]!.y : dragPoint.y}
                strokeWidth={5}
                strokeLinecap="round"
                strokeDasharray={dragValid ? undefined : "6 6"}
                className={dragValid ? "stroke-player-coral" : "stroke-player-coral/70"}
                pointerEvents="none"
              />
            )}

            {/* spots */}
            {board.points.map((p, index) => (
              <g key={index}>
                {myTurn && dragFrom === index && (
                  <circle cx={p.x} cy={p.y} r={22} className="fill-player-coral/40" />
                )}
                <circle cx={p.x} cy={p.y} r={12} className="fill-cream" />
                {myTurn && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={28}
                    fill="transparent"
                    style={{ touchAction: "none" }}
                    className="cursor-pointer touch-none select-none"
                    onPointerDown={beginDrag(index)}
                  >
                    <title>Drag from this spot to another to draw a line</title>
                  </circle>
                )}
              </g>
            ))}
          </svg>
          <p className={`mt-4 text-center text-xs ${hint ? "text-amber-300" : "text-ivory/45"}`}>
            {hint ??
              "Drag from one spot to another to draw a line between them — it must not touch or cross any existing line."}
          </p>
        </section>

        {/* Player — bottom of the table */}
        <section className="flex items-center gap-3 rounded-2xl border border-gold/15 bg-brand/50 px-1.5 py-4 sm:px-2.5">
          <PlayerAvatar avatar={playerAvatar} onSelect={setPlayerAvatar} size="size-14" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold">{playerName}</p>
            <p className="text-xs text-ivory/60">{myTurn ? "Your turn" : "Waiting"}</p>
          </div>
          <p className="font-display text-2xl font-bold text-player-coral">{mine}</p>
        </section>
      </div>
    </TableShell>
  );
}
