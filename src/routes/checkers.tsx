import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { getGame } from "@/lib/games";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
import { useMatch } from "@/lib/multiplayer";
import { useRecordMatchResult } from "@/lib/stats";
import {
  applyStep,
  boardSignature,
  canContinueCapture,
  cellRC,
  chooseMove,
  countPieces,
  flip,
  hasLegalMove,
  isCapture,
  isDark,
  legalDestinations,
  makeInitialBoard,
  mirroredBoard,
  movablePieces,
  squareName,
  wasPromoted,
  type Board,
  type Player,
} from "@/lib/checkers";

export const Route = createFileRoute("/checkers")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Play Checkers — Cards and Games" },
      {
        name: "description",
        content:
          "Jump, capture and crown on the 8×8 board: take every one of Ada's men — or leave her with no move at all — to win.",
      },
      { property: "og:title", content: "Play Checkers — Cards and Games" },
      {
        property: "og:description",
        content: "Checkers in the parlour: capture every piece, crown a king, and clear the board.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CheckersTable,
});

type LogEntry = { side: Player | null; text: string };

type State = {
  phase: "play" | "over";
  turn: Player;
  board: Board;
  selected: number | null;
  capturedThisTurn: boolean;
  movesSinceCapture: number;
  history: string[];
  log: LogEntry[];
  winner: Player | "draw" | null;
};

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);

const freshState = (): State => {
  const board = makeInitialBoard();
  return {
    phase: "play",
    turn: "human",
    board,
    selected: null,
    capturedThisTurn: false,
    movesSinceCapture: 0,
    history: [boardSignature(board, "human")],
    log: [
      {
        side: null,
        text: "You play the dark men and move first. Jump to capture — it's compulsory — and crown a man when it reaches the far row.",
      },
    ],
    winner: null,
  };
};

type Outcome = { over: boolean; winner: Player | "draw"; reason: string };

/** Decide the result at the start of `turn`'s move. */
function determineOutcome(
  board: Board,
  turn: Player,
  occurrences: number,
  movesSinceCapture: number,
): Outcome {
  const { human, cpu } = countPieces(board);
  if (turn === "human" && human === 0) {
    return { over: true, winner: "cpu", reason: "You have no pieces left." };
  }
  if (turn === "cpu" && cpu === 0) {
    return { over: true, winner: "human", reason: "Every opponent piece is captured." };
  }
  if (!hasLegalMove(board, turn)) {
    return {
      over: true,
      winner: flip(turn),
      reason: `${turn === "human" ? "You have" : "Your opponent has"} no move left.`,
    };
  }
  if (occurrences >= 3) {
    return { over: true, winner: "draw", reason: "The same position has come up three times — a draw." };
  }
  if (movesSinceCapture >= 100) {
    return { over: true, winner: "draw", reason: "A hundred moves without a capture — a draw." };
  }
  return { over: false, winner: "draw", reason: "" };
}

/** Finalise a completed turn: flip the turn, update the counters, check the result. */
function endTurn(current: State, side: Player): State {
  const board = current.board;
  const turn = flip(side);
  const movesSinceCapture = current.capturedThisTurn ? 0 : current.movesSinceCapture + 1;
  const sig = boardSignature(board, turn);
  const occurrences = current.history.filter((s) => s === sig).length + 1;
  const history = [...current.history, sig].slice(-200);
  const outcome = determineOutcome(board, turn, occurrences, movesSinceCapture);
  const log = outcome.over ? note(current.log, { side: null, text: outcome.reason }) : current.log;
  return {
    ...current,
    board,
    turn,
    selected: null,
    capturedThisTurn: false,
    movesSinceCapture,
    history,
    log,
    phase: outcome.over ? "over" : "play",
    winner: outcome.over ? outcome.winner : null,
  };
}

/** The guest's view of the host's canonical state. */
function mirror(state: State): State {
  return {
    ...state,
    turn: flip(state.turn),
    board: mirroredBoard(state.board),
    selected: state.selected === null ? null : 63 - state.selected,
    winner: state.winner && state.winner !== "draw" ? flip(state.winner) : state.winner,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? flip(entry.side) : null })),
  };
}

function CheckersTable() {
  const game = getGame("checkers");
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
  const [state, setState] = useState<State>(() => freshState());
  const stateRef = useRef(state);
  stateRef.current = state;
  useRecordMatchResult(match, isHost, state.winner);

  const isMulti = Boolean(matchId);
  const opponentName = liveOpponent ?? opponent ?? "Ada";

  const apply = (fn: (current: State) => State) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (isMulti) void publish(isHost ? next : mirror(next));
  };

  const selectPiece = (index: number | null) => {
    const next = { ...stateRef.current, selected: index };
    stateRef.current = next;
    setState(next);
  };

  const reset = () => {
    const fresh = freshState();
    stateRef.current = fresh;
    setState(fresh);
    if (isMulti) void publish(isHost ? fresh : mirror(fresh));
  };

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

  const myTurn = state.turn === "human" && state.phase === "play";

  const humanMovable = useMemo(
    () => (myTurn ? new Set(movablePieces(state.board, "human")) : new Set<number>()),
    [state.board, myTurn],
  );

  const selectedDests = useMemo(
    () =>
      state.selected !== null && myTurn ? legalDestinations(state.board, state.selected) : [],
    [state.board, state.selected, myTurn],
  );
  const selectedDestSet = useMemo(() => new Set(selectedDests), [selectedDests]);

  const onSquareClick = (index: number) => {
    if (!myTurn) return;
    const cell = state.board[index];

    if (state.selected !== null) {
      if (selectedDestSet.has(index)) {
        const from = state.selected;
        const to = index;
        const capture = isCapture(state.board, from, to);
        if (capture) {
          const nextBoard = applyStep(state.board, from, to);
          if (!wasPromoted(state.board, from, to) && canContinueCapture(nextBoard, to)) {
            apply((s) => ({
              ...s,
              board: nextBoard,
              selected: to,
              capturedThisTurn: true,
              log: note(s.log, { side: "human", text: `jump ${squareName(from)} to ${squareName(to)}.` }),
            }));
            return;
          }
        }
        apply((s) => {
          const nextBoard = applyStep(s.board, from, to);
          return endTurn(
            {
              ...s,
              board: nextBoard,
              capturedThisTurn: s.capturedThisTurn || capture,
              log: note(s.log, {
                side: "human",
                text: `${capture ? "capture" : "move"} ${squareName(from)} to ${squareName(to)}.`,
              }),
            },
            "human",
          );
        });
        return;
      }
      if (cell?.owner === "human" && humanMovable.has(index)) {
        selectPiece(index);
      } else {
        selectPiece(null);
      }
      return;
    }

    if (cell?.owner === "human" && humanMovable.has(index)) selectPiece(index);
  };

  // Ada's move (solo play only).
  useEffect(() => {
    if (isMulti) return;
    if (state.phase !== "play" || state.turn !== "cpu") return;
    const timer = setTimeout(() => {
      setState((current) => {
        if (current.phase !== "play" || current.turn !== "cpu") return current;
        const mv = chooseMove(current.board, "cpu");
        if (!mv) return current;
        let board = current.board;
        let captured = false;
        let cur = mv.from;
        for (const to of mv.path) {
          captured = captured || isCapture(board, cur, to);
          board = applyStep(board, cur, to);
          cur = to;
        }
        const lastTo = mv.path[mv.path.length - 1]!;
        const next = endTurn(
          {
            ...current,
            board,
            capturedThisTurn: captured,
            log: note(current.log, {
              side: "cpu",
              text: `${captured ? "capture" : "move"} ${squareName(mv.from)} to ${squareName(lastTo)}${mv.path.length > 1 ? `, ${mv.path.length} jumps` : ""}.`,
            }),
          },
          "cpu",
        );
        stateRef.current = next;
        return next;
      });
    }, 850);
    return () => clearTimeout(timer);
  }, [isMulti, state.phase, state.turn, state.board]);

  const { human, cpu } = countPieces(state.board);

  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);

  const status =
    isMulti && !match
      ? "Opening the shared table…"
      : state.phase === "over"
        ? state.winner === "draw"
          ? "A draw — honours shared"
          : state.winner === "human"
            ? "You've cleared the board — you win"
            : `${opponentName} has cleared the board`
        : myTurn
          ? "Your move"
          : isMulti
            ? `Waiting for ${opponentName}…`
            : "Ada studies the board…";

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus={status}
      opponentDisconnected={opponentDisconnected}
      disconnectSecondsLeft={disconnectSecondsLeft}
      disconnectExpired={disconnectExpired}
      gameInProgress={state.phase === "play" && state.history.length > 1}
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/checkers", search: { opponent: nickname, match: newMatchId } });
        reset();
      }}
      onNewGame={reset}
      rail={null}
    >
      <GameOverDialog
        open={state.phase === "over"}
        result={state.winner === "human" ? "win" : state.winner === "cpu" ? "loss" : "draw"}
        playerScore={human}
        opponentScore={cpu}
        scoreLabel="Men on the board"
        opponentName={opponentName}
        playerAvatar={playerAvatar}
        onPlayAgain={reset}
      />

      <div className="space-y-8">
        {/* Opponent — top of the table */}
        <section className="flex items-center gap-3 rounded-2xl border border-gold/15 bg-brand/50 p-4">
          <img
            src={ADA_AVATAR}
            alt={opponentName}
            width={64}
            height={64}
            className="size-14 rounded-full border-2 border-player-teal/50 bg-surface object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold">{opponentName}</p>
            <p className="text-xs text-ivory/60">
              {state.turn === "cpu" && state.phase === "play" ? "Their turn" : "Waiting"}
            </p>
          </div>
          <p className="font-display text-2xl font-bold text-player-teal">{cpu}</p>
        </section>

        {/* Board */}
        <section className="rounded-2xl border border-gold/25 bg-brand/70 p-4 shadow-2xl shadow-black/40 sm:p-6">
          <div className="mx-auto grid w-full max-w-md grid-cols-8 overflow-hidden rounded-lg border-4 border-[#4a3524] shadow-xl">
            {state.board.map((cell, index) => {
              const { row, col } = cellRC(index);
              const dark = isDark(row, col);
              const isSelected = state.selected === index;
              const isDest = selectedDestSet.has(index);
              const isMovable = myTurn && state.selected === null && humanMovable.has(index);
              const destIsCapture =
                state.selected !== null && isDest && isCapture(state.board, state.selected, index);
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!dark}
                  onClick={() => onSquareClick(index)}
                  aria-label={
                    dark
                      ? cell
                        ? `${cell.owner === "human" ? "Your" : `${opponentName}'s`} ${cell.king ? "king" : "man"} on ${squareName(index)}`
                        : `Empty square ${squareName(index)}`
                      : undefined
                  }
                  className={`relative aspect-square transition-colors ${
                    dark ? "bg-[#7a5230]" : "bg-[#e6d2a5]"
                  } ${isSelected ? "ring-2 ring-inset ring-gold" : ""}`}
                >
                  {dark && isMovable && (
                    <span className="absolute inset-0 m-auto size-3 rounded-full border-2 border-gold/70" />
                  )}

                  {cell && (
                    <span
                      className={`absolute inset-[10%] rounded-full border-2 shadow-md ${
                        cell.owner === "human"
                          ? "border-black/30 bg-player-coral"
                          : "border-black/10 bg-player-teal"
                      }`}
                    >
                      {cell.king && (
                        <svg
                          viewBox="0 0 24 24"
                          className="absolute inset-0 m-auto size-[58%] text-gold"
                          fill="currentColor"
                          aria-hidden
                        >
                          <path d="M3 17h18l-1.4-8.4-3.6 3.2L12 5l-4 6.8-3.6-3.2L3 17z" />
                        </svg>
                      )}
                    </span>
                  )}

                  {dark && isDest && (
                    <span
                      className={`absolute inset-0 m-auto ${
                        destIsCapture
                          ? "size-[72%] rounded-full border-2 border-player-coral"
                          : "size-4 rounded-full bg-player-coral/50"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-center gap-6 text-xs text-ivory/60">
            <span className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-full border border-black/30 bg-player-coral" />
              You
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-full border border-black/10 bg-player-teal" />
              {opponentName}
            </span>
            <span className="flex items-center gap-2">
              <span className="grid size-3 place-items-center rounded-full bg-gold text-[8px] text-brand">♛</span>
              King
            </span>
          </div>

          <p className="mt-3 text-center text-xs text-ivory/45">
            {myTurn
              ? state.selected !== null
                ? "Click a highlighted square to move — or jump — your man."
                : "Click one of your men to select it."
              : "Jumps are compulsory; a man reaching the far row is crowned."}
          </p>
        </section>

        {/* Player — bottom of the table */}
        <section className="flex items-center gap-3 rounded-2xl border border-gold/15 bg-brand/50 p-4">
          <PlayerAvatar avatar={playerAvatar} onSelect={setPlayerAvatar} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold">You</p>
            <p className="text-xs text-ivory/60">{myTurn ? "Your turn" : "Waiting"}</p>
          </div>
          <p className="font-display text-2xl font-bold text-player-coral">{human}</p>
        </section>
      </div>
    </TableShell>
  );
}

