import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { getGame } from "@/lib/games";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
import { useMatch } from "@/lib/multiplayer";
import {
  applyMove,
  chooseMove,
  countDiscs,
  flip,
  isGameOver,
  legalMoves,
  makeInitialBoard,
  squareName,
  type Board,
  type Player,
} from "@/lib/reversi";

export const Route = createFileRoute("/reversi")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Play Reversi — Cards and Games" },
      {
        name: "description",
        content:
          "Outflank Ada on the 8×8 board: place a disc, flip every disc you sandwich, and own the most squares when the board is full.",
      },
      { property: "og:title", content: "Play Reversi — Cards and Games" },
      {
        property: "og:description",
        content: "Reversi in the parlour: sandwich, flip, and finish with the most discs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReversiTable,
});

type LogEntry = { side: Player | null; text: string };

type State = {
  phase: "play" | "over";
  turn: Player;
  board: Board;
  log: LogEntry[];
  winner: Player | "draw" | null;
};

const freshState = (): State => ({
  phase: "play",
  turn: "human",
  board: makeInitialBoard(),
  log: [
    {
      side: null,
      text: "You play the dark discs and move first. Place a disc to sandwich Ada's discs, flip them, and own the most squares when the board is full.",
    },
  ],
  winner: null,
});

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);

function mirror(state: State): State {
  return {
    ...state,
    turn: flip(state.turn),
    board: state.board.map((cell) => (cell === null ? null : flip(cell))),
    winner: state.winner && state.winner !== "draw" ? flip(state.winner) : state.winner,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? flip(entry.side) : null })),
  };
}

function ReversiTable() {
  const game = getGame("reversi");
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
    if (isMulti) void publish(isHost ? fresh : mirror(fresh));
  };

  const placeDisc = (current: State, index: number, side: Player): State => {
    if (current.phase !== "play") return current;
    const board = applyMove(current.board, side, index);
    let log = note(current.log, { side, text: `place a disc on ${squareName(index)}.` });
    let turn = flip(side);
    while (legalMoves(board, turn).length === 0 && legalMoves(board, flip(turn)).length > 0) {
      log = note(log, { side: turn, text: "has no move and passes." });
      turn = flip(turn);
    }
    if (isGameOver(board)) {
      const { human, cpu } = countDiscs(board);
      return {
        ...current,
        board,
        turn,
        phase: "over",
        winner: human === cpu ? "draw" : human > cpu ? "human" : "cpu",
        log: note(log, { side: null, text: `The board is settled: ${human} to ${cpu}.` }),
      };
    }
    return { ...current, board, turn, log };
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
  const legal = useMemo(
    () => (state.phase === "play" ? legalMoves(state.board, "human") : []),
    [state.board, state.phase],
  );
  const legalSet = useMemo(() => new Set(legal), [legal]);

  const onCellClick = (index: number) => {
    if (!myTurn || !legalSet.has(index)) return;
    apply((current) => placeDisc(current, index, "human"));
  };

  // Ada places her disc (solo play only).
  useEffect(() => {
    if (isMulti) return;
    if (state.phase !== "play" || state.turn !== "cpu") return;
    const timer = setTimeout(() => {
      setState((current) => {
        if (current.phase !== "play" || current.turn !== "cpu") return current;
        const target = chooseMove(current.board, "cpu");
        if (target === null) return current;
        const next = placeDisc(current, target, "cpu");
        stateRef.current = next;
        return next;
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [isMulti, state.phase, state.turn, state.board]);

  const { human, cpu } = countDiscs(state.board);
  const moved = human + cpu > 4; // beyond the opening four discs

  const status =
    isMulti && !match
      ? "Opening the shared table…"
      : state.phase === "over"
        ? state.winner === "draw"
          ? "The board is even — honours shared"
          : state.winner === "human"
            ? "You own the most discs — you win"
            : `${opponentName} owns the most discs`
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
      gameInProgress={state.phase === "play" && moved}
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/reversi", search: { opponent: nickname, match: newMatchId } });
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
        scoreLabel="Discs on the board"
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
          <div className="mx-auto grid aspect-square w-full max-w-md grid-cols-8 gap-1 rounded-lg bg-emerald-950/70 p-2">
            {state.board.map((cell, index) => {
              const isLegal = myTurn && legalSet.has(index);
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onCellClick(index)}
                  aria-label={
                    cell
                      ? `${cell === "human" ? "Your" : `${opponentName}'s`} disc on ${squareName(index)}`
                      : `Empty square ${squareName(index)}`
                  }
                  className={`relative aspect-square rounded-[6px] transition-colors ${
                    isLegal
                      ? "cursor-pointer bg-emerald-800/70 hover:bg-emerald-700/70"
                      : "bg-emerald-900/40"
                  }`}
                >
                  {cell && (
                    <span
                      className={`absolute inset-[8%] rounded-full border shadow-md ${
                        cell === "human"
                          ? "border-black/30 bg-player-coral"
                          : "border-black/10 bg-player-teal"
                      }`}
                    />
                  )}
                  {!cell && isLegal && (
                    <span className="absolute inset-[38%] rounded-full bg-player-coral/50" />
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
          </div>
          <p className="mt-3 text-center text-xs text-ivory/45">
            {myTurn
              ? "Click a highlighted square to place your disc."
              : "Discs you sandwich in a straight line flip to your colour."}
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

