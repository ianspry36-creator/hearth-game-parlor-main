import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { CountdownBadge } from "@/components/parlor/CountdownBadge";
import { TurnOffTimerControl } from "@/components/parlor/TurnOffTimerControl";
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
import { getGame } from "@/lib/games";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
import { readFlag } from "@/lib/flags";
import { FlagPicker } from "@/components/parlor/FlagPicker";
import { PlayerFlag } from "@/components/parlor/PlayerFlag";
import { NicknameDialog } from "@/components/parlor/NicknameDialog";
import { getNickname, TURN_WARNING_SECONDS, useMatch, useTurnTimer } from "@/lib/multiplayer";
import { useRecordMatchResult } from "@/lib/stats";
import { useSolitaireStats } from "@/lib/solitaireStats";
import {
  applyStep,
  boardSignature,
  canContinueCapture,
  cellRC,
  chooseMove,
  countPieces,
  flip,
  hasLegalMove,
  idx,
  isCapture,
  isDark,
  legalDestinations,
  makeInitialBoard,
  mirroredBoard,
  movablePieces,
  nextDifficulty,
  readDifficulty,
  squareName,
  wasPromoted,
  writeDifficulty,
  type Board,
  type Difficulty,
  type Piece,
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
  timedOut: boolean;
  timerOff: boolean;
  timerRequest: Player | null;
  timerProposed: boolean;
  timerDeclined: boolean;
  timerAgreed: boolean;
};

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);

// Milliseconds one jump (and its capture) animates for, so a multi-jump capture
// plays out one hop at a time rather than teleporting straight to the last square.
const CPU_STEP_MS = 320;

/** A captured piece held in the overlay briefly so it can fade out instead of vanishing. */
type DyingPiece = { key: number; id: number; owner: Player; king: boolean; index: number };

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
    timedOut: false,
    timerOff: false,
    timerRequest: null,
    timerProposed: false,
    timerDeclined: false,
    timerAgreed: false,
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
    timerRequest: state.timerRequest ? flip(state.timerRequest) : null,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? flip(entry.side) : null })),
  };
}

/** A small computer badge shown in place of a flag for the CPU opponent (Ada). */
function ComputerIcon({ className = "size-4" }: { className?: string }) {
  return (
    <img
      src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4bb.svg"
      alt="Computer"
      title="Computer"
      className={`${className} shrink-0 rounded-sm border border-black/20 object-cover align-middle shadow-sm shadow-black/30`}
    />
  );
}

function CheckersTable() {
  const game = getGame("checkers");
  const navigate = useNavigate();
  const { opponent, match: matchId } = Route.useSearch();
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
  } = useMatch<State>(matchId);
  const [state, setState] = useState<State>(() => freshState());
  const stateRef = useRef(state);
  const proposedTimerOffRef = useRef(false);
  stateRef.current = state;
  useRecordMatchResult(match, isHost, state.winner);

  const isMulti = Boolean(matchId);
  const opponentName = liveOpponent ?? opponent ?? "Ada";
  const [playerName, setPlayerName] = useState(() => getNickname() ?? "You");
  // Whether the end-of-game dialog has been dismissed to inspect the board.
  const [viewingBoard, setViewingBoard] = useState(false);
  // Whether the concede confirmation dialog is open.
  const [concedeOpen, setConcedeOpen] = useState(false);
  // Captured pieces kept in the overlay briefly so they can fade out instead of vanishing.
  const [dying, setDying] = useState<DyingPiece[]>([]);
  const dyingKeyRef = useRef(0);

  // Ada's difficulty for solo play — easy / medium / hard, remembered between games.
  const [difficulty, setDifficulty] = useState<Difficulty>(() => readDifficulty());
  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;
  // Difficulty is fixed once the first move has been made.
  const difficultyLocked = state.history.length > 1;
  const cycleDifficulty = () => {
    setDifficulty((prev) => {
      const next = nextDifficulty(prev);
      writeDifficulty(next);
      return next;
    });
  };

  // Solo games against Ada are recorded locally, scoped to the difficulty in
  // effect, so they show in Statistics alongside the multiplayer leaderboard;
  // live matches are handled by useRecordMatchResult above instead.
  const { recordResult: recordSoloResult } = useSolitaireStats(game.id, difficulty);
  const prevSoloWinnerRef = useRef<Player | "draw" | null>(null);
  useEffect(() => {
    if (
      !isMulti &&
      state.winner &&
      state.winner !== "draw" &&
      state.winner !== prevSoloWinnerRef.current
    ) {
      recordSoloResult(state.winner === "human" ? "win" : "loss");
    }
    prevSoloWinnerRef.current = state.winner;
  }, [state.winner, isMulti, recordSoloResult]);

  const apply = (fn: (current: State) => State) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (isMulti) void publish(isHost ? next : mirror(next));
  };

  // Fade a captured piece out (and drop it from the board) instead of vanishing it.
  const scheduleCapture = useCallback((board: Board, from: number, to: number) => {
    if (!isCapture(board, from, to)) return;
    const a = cellRC(from);
    const b = cellRC(to);
    const mid = idx((a.row + b.row) / 2, (a.col + b.col) / 2);
    const victim = board[mid];
    if (!victim) return;
    const key = dyingKeyRef.current++;
    setDying((list) => [...list, { key, id: victim.id, owner: victim.owner, king: victim.king, index: mid }]);
    window.setTimeout(() => {
      setDying((list) => list.filter((p) => p.key !== key));
    }, 300);
  }, []);

  // Concede the game: award the win to the opponent (Ada or the live player).
  const concede = () => {
    setConcedeOpen(false);
    apply((current) => ({
      ...current,
      phase: "over",
      winner: "cpu",
      selected: null,
      log: note(current.log, { side: "human", text: `${playerName} conceded.` }),
    }));
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

  const selectPiece = (index: number | null) => {
    const next = { ...stateRef.current, selected: index };
    stateRef.current = next;
    setState(next);
  };

  const reset = () => {
    proposedTimerOffRef.current = false;
    setViewingBoard(false);
    setDying([]);
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
    if (view.phase !== "over") setViewingBoard(false);
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

  // Pieces in a stable order (by id) so React never reorders their DOM nodes.
  // Reordering a node cancels the CSS transition that animates a piece's move —
  // which is why a piece sliding "down" the list (Ada's normal direction) snapped.
  const pieces = useMemo(() => {
    const out: { cell: Piece; index: number }[] = [];
    for (let index = 0; index < state.board.length; index += 1) {
      const cell = state.board[index];
      if (cell) out.push({ cell, index });
    }
    out.sort((a, b) => a.cell.id - b.cell.id);
    return out;
  }, [state.board]);

  const onSquareClick = (index: number) => {
    if (!myTurn) return;
    const cell = state.board[index];

    if (state.selected !== null) {
      if (selectedDestSet.has(index)) {
        const from = state.selected;
        const to = index;
        const capture = isCapture(state.board, from, to);
        if (capture) {
          scheduleCapture(state.board, from, to);
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

  // Ada's move (solo play only). Each jump of a multi-capture is applied as its
  // own state change, spaced a step apart, so the piece animates one hop at a
  // time — and each captured piece fades out at its own jump rather than the
  // whole chain snapping straight to the final square.
  useEffect(() => {
    if (isMulti) return;
    if (state.phase !== "play" || state.turn !== "cpu") return;

    const timers: number[] = [];
    const start = window.setTimeout(() => {
      const mv = chooseMove(stateRef.current.board, "cpu", difficultyRef.current);
      if (!mv) return;

      let captured = false;
      let cur = mv.from;
      mv.path.forEach((to, i) => {
        const t = window.setTimeout(() => {
          const current = stateRef.current;
          if (current.phase !== "play" || current.turn !== "cpu") return;

          captured = captured || isCapture(current.board, cur, to);
          scheduleCapture(current.board, cur, to);
          const nextBoard = applyStep(current.board, cur, to);
          cur = to;
          const last = i === mv.path.length - 1;

          if (last) {
            apply((s) =>
              endTurn(
                {
                  ...s,
                  board: nextBoard,
                  capturedThisTurn: captured,
                  log: note(s.log, {
                    side: "cpu",
                    text: `${captured ? "capture" : "move"} ${squareName(mv.from)} to ${squareName(to)}${mv.path.length > 1 ? `, ${mv.path.length} jumps` : ""}.`,
                  }),
                },
                "cpu",
              ),
            );
          } else {
            apply((s) => ({ ...s, board: nextBoard, capturedThisTurn: captured }));
          }
        }, i * CPU_STEP_MS);
        timers.push(t);
      });
    }, 850);
    timers.push(start);

    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [isMulti, state.phase, state.turn, scheduleCapture]);

  const { human, cpu } = countPieces(state.board);

  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);
  const [flag, setFlag] = useState<string | null>(readFlag);
  const [flagOpen, setFlagOpen] = useState(false);

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
      showChat={isMulti}
      opponentDisconnected={opponentDisconnected}
      disconnectSecondsLeft={disconnectSecondsLeft}
      disconnectExpired={disconnectExpired}
      gameInProgress={state.phase === "play" && state.history.length > 1}
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/checkers", search: { opponent: nickname, match: newMatchId } });
        reset();
      }}
      onNewGame={() => (isMulti ? navigate({ to: "/checkers" }) : reset())}
      onAbandon={() => {
        if (!isMulti) recordSoloResult("abandoned");
      }}
      rail={null}
      boxClassName="pt-2.5 sm:pt-4"
      menuExtra={
        <>
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
        {state.phase === "play" && state.history.length > 1 && (
          <Button variant="parlorGhost" size="sm" className="w-full h-6" onClick={() => setConcedeOpen(true)}>
            Concede
          </Button>
        )}
        {!isMulti && (
          <div className="flex w-full items-center justify-between gap-2.5">
            <span className="text-xs uppercase tracking-[0.2em] text-ivory/50">Difficulty</span>
            <button
              type="button"
              onClick={cycleDifficulty}
              disabled={difficultyLocked}
              className="rounded-full border border-gold/25 bg-gold/5 px-2.5 py-0.5 text-xs capitalize text-cream transition-colors hover:border-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
              title={
                difficultyLocked
                  ? "Difficulty is locked once the first move has been made"
                  : "Change difficulty"
              }
            >
              {difficulty}
            </button>
          </div>
        )}
        </>
      }
    >
      <FlagPicker open={flagOpen} onOpenChange={setFlagOpen} onSelect={setFlag} />
      <GameOverDialog
        open={state.phase === "over" && !viewingBoard}
        result={state.winner === "human" ? "win" : state.winner === "cpu" ? "loss" : "draw"}
        timedOut={state.timedOut}
        playerScore={human}
        opponentScore={cpu}
        scoreLabel="Men on the board"
        opponentName={opponentName}
        playerAvatar={playerAvatar}
        onPlayAgain={reset}
        playAgainLabel={isMulti ? "Rematch" : "Play again"}
        footerExtra={
          <>
            <Button variant="parlorOutline" onClick={() => setViewingBoard(true)}>
              View Board
            </Button>
            <Button variant="parlorOutline" onClick={() => navigate({ to: "/" })}>
              Return to Play Room
            </Button>
          </>
        }
      />

      <AlertDialog open={concedeOpen} onOpenChange={setConcedeOpen}>
        <AlertDialogContent className="border-gold/25 bg-brand text-cream">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">Concede the game?</AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/65">
              {isMulti
                ? `You'll forfeit the match and ${opponentName} will win.`
                : "You'll forfeit the game and Ada will win."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction onClick={concede}>Concede</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-4">
        {/* Players — top of the table */}
        <section className="grid grid-cols-2 gap-3 rounded-2xl border border-gold/15 bg-brand/50 p-4 sm:flex sm:items-center">
          {/* Ada (left) */}
          <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <div className="relative inline-block">
              <img
                src={opponentAvatar ?? ADA_AVATAR}
                alt={opponentName}
                width={64}
                height={64}
                className="size-14 rounded-full ring-2 ring-player-teal/50 bg-surface object-cover"
              />
              {state.turn === "cpu" && countdown > 0 && <CountdownBadge seconds={countdown} />}
            </div>
            <div className="text-center sm:hidden">
              <div className="flex items-center justify-center gap-2">
                <p className="truncate font-display text-lg font-bold">{opponentName}</p>
                {!isMulti && <ComputerIcon className="size-5" />}
              </div>
              <p className="text-xs text-ivory/60">
                {state.turn === "cpu" && state.phase === "play" ? "Their turn" : "Waiting"}
              </p>
            </div>
            <p className="font-display text-2xl font-bold text-player-teal sm:hidden">{cpu}</p>
          </div>

          {/* Ada name/status + score (desktop middle) */}
          <div className="hidden min-w-0 flex-1 sm:block">
            <div className="flex items-center gap-2">
              <p className="truncate font-display text-lg font-bold">{opponentName}</p>
              {!isMulti && <ComputerIcon className="size-5" />}
              <p className="font-display text-2xl font-bold text-player-teal">{cpu}</p>
            </div>
            <p className="text-xs text-ivory/60">
              {state.turn === "cpu" && state.phase === "play" ? "Their turn" : "Waiting"}
            </p>
          </div>

          {/* Player score + name/flag/status (desktop middle-right) */}
          <div className="hidden min-w-0 flex-1 text-right sm:block">
            <div className="flex items-center justify-end gap-2">
              <p className="font-display text-2xl font-bold text-player-coral">{human}</p>
              <NicknameDialog
                onSaved={setPlayerName}
                trigger={
                  <button
                    type="button"
                    className="min-w-0 truncate text-right font-display text-lg font-bold hover:text-gold"
                  >
                    {playerName}
                  </button>
                }
              />
              <PlayerFlag flag={flag} onClick={() => setFlagOpen(true)} className="size-6" />
            </div>
            <p className="text-xs text-ivory/60">{myTurn ? "Your turn" : "Waiting"}</p>
          </div>

          {/* Player (right) */}
          <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <PlayerAvatar
              avatar={playerAvatar}
              onSelect={setPlayerAvatar}
              size="size-14"
              countdown={state.turn === "human" ? countdown : 0}
            />
            <div className="flex items-center gap-2 sm:hidden">
              <NicknameDialog
                onSaved={setPlayerName}
                trigger={
                  <button
                    type="button"
                    className="min-w-0 truncate text-right font-display text-lg font-bold hover:text-gold"
                  >
                    {playerName}
                  </button>
                }
              />
              <PlayerFlag flag={flag} onClick={() => setFlagOpen(true)} className="size-6" />
            </div>
            <p className="font-display text-2xl font-bold text-player-coral sm:hidden">{human}</p>
          </div>
        </section>

        {/* Board */}
        <section className="rounded-2xl border border-gold/25 bg-brand/70 p-4 shadow-2xl shadow-black/40 sm:p-6">
          <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-lg border-4 border-[#4a3524] shadow-xl">
            <div className="grid grid-cols-8">
              {state.board.map((cell, index) => {
                const { row, col } = cellRC(index);
                const dark = isDark(row, col);
                const isSelected = state.selected === index;
                const isDest = selectedDestSet.has(index);
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

            {/* Pieces — rendered as an overlay so moves animate between squares. */}
            {pieces.map(({ cell, index }) => {
              const { row, col } = cellRC(index);
              const isMovable = myTurn && state.selected === null && humanMovable.has(index);
              return (
                <div
                  key={cell.id}
                  className="pointer-events-none absolute left-0 top-0"
                  style={{
                    width: "12.5%",
                    height: "12.5%",
                    transform: `translate(${col * 100}%, ${row * 100}%)`,
                    transition: "transform 300ms ease-out",
                  }}
                >
                  <span
                    className={`absolute inset-[10%] rounded-full border-2 shadow-md ${
                      cell.owner === "human"
                        ? "border-black/30 bg-player-coral"
                        : "border-black/10 bg-player-teal"
                    } ${isMovable ? "animate-checker-shine" : ""}`}
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
                </div>
              );
            })}

            {/* Captured pieces fade out here before leaving the board. */}
            {dying.map((p) => {
              const { row, col } = cellRC(p.index);
              return (
                <div
                  key={p.key}
                  className="pointer-events-none absolute left-0 top-0"
                  style={{
                    width: "12.5%",
                    height: "12.5%",
                    transform: `translate(${col * 100}%, ${row * 100}%)`,
                  }}
                >
                  <span
                    className={`absolute inset-[10%] rounded-full border-2 shadow-md animate-checker-captured ${
                      p.owner === "human"
                        ? "border-black/30 bg-player-coral"
                        : "border-black/10 bg-player-teal"
                    }`}
                  >
                    {p.king && (
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
                </div>
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

      </div>
    </TableShell>
  );
}

