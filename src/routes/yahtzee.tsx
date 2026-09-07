import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { getGame } from "@/lib/games";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
import { useMatch } from "@/lib/multiplayer";
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
  rollFace,
  scoreCategory,
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
  dice: YDie[];
  rolls: number;
  cards: { human: Card; cpu: Card };
  log: LogEntry[];
  winner: Seat | null;
  draw: boolean;
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

const freshState = (): State => ({
  phase: "rolloff",
  turn: "human",
  rolloff: { human: null, cpu: null },
  dice: blankDice(),
  rolls: 0,
  cards: { human: {}, cpu: {} },
  log: [{ side: null, text: "Highest roll goes first. Roll the dice." }],
  winner: null,
  draw: false,
});

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);
const flip = (side: Seat): Seat => (side === "human" ? "cpu" : "human");

// Truncate a long nickname for the narrow scorecard column: over 7 characters
// shows the first four characters followed by three dots.
const shortName = (name: string) => (name.length > 7 ? `${name.slice(0, 4)}...` : name);

function rollOff(current: State): State {
  const human = rollFace();
  const cpu = rollFace();
  if (human === cpu) {
    return {
      ...current,
      rolloff: { human, cpu },
      log: note(current.log, { side: null, text: `Tie at ${human} — roll again.` }),
    };
  }
  const first: Seat = human > cpu ? "human" : "cpu";
  return {
    ...current,
    rolloff: { human, cpu },
    log: note(current.log, {
      side: first,
      text: `win the rolloff ${human}-${cpu} and take the first turn.`,
    }),
  };
}

function mirror(state: State): State {
  return {
    ...state,
    rolloff: { human: state.rolloff.cpu, cpu: state.rolloff.human },
    cards: { human: state.cards.cpu, cpu: state.cards.human },
    turn: flip(state.turn),
    winner: state.winner ? flip(state.winner) : null,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? flip(entry.side) : null })),
  };
}

function YahtzeeTable() {
  const game = getGame("yahtzee");
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

  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);

  const reset = () => {
    const fresh = freshState();
    stateRef.current = fresh;
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
    const score = scoreCategory(category, faces);
    const card: Card = { ...current.cards[side], [category]: score };
    const cards = { ...current.cards, [side]: card };
    const logged: State = {
      ...current,
      cards,
      log: note(current.log, {
        side,
        text: `take ${CATEGORY_LABELS[category]} for ${score}.`,
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

  const rolloffResolving =
    state.phase === "rolloff" &&
    state.rolloff.human !== null &&
    state.rolloff.cpu !== null &&
    state.rolloff.human !== state.rolloff.cpu;

  const rolloffWinner: Seat | null =
    state.rolloff.human !== null && state.rolloff.cpu !== null && state.rolloff.human !== state.rolloff.cpu
      ? state.rolloff.human > state.rolloff.cpu
        ? "human"
        : "cpu"
      : null;

  const canRollOff = state.phase === "rolloff" && (!isMulti || isHost) && !rolloffResolving;
  const rollForFirst = () => {
    if (!canRollOff) return;
    apply(rollOff);
  };

  // Once both dice have landed, pause two seconds before the winner takes the first turn.
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
        return { ...current, turn: first, phase: "play" };
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [isMulti, isHost, state.phase, state.rolloff.human, state.rolloff.cpu]);

  const toggleHold = (index: number) => {
    if (!myTurn || state.rolls === 0 || state.rolls >= MAX_ROLLS) return;
    apply((current) => ({
      ...current,
      dice: current.dice.map((d, i) => (i === index ? { ...d, held: !d.held } : d)),
    }));
  };

  const take = (category: Category) => {
    if (!myTurn || state.rolls === 0) return;
    if (state.cards.human[category] !== undefined) return;
    apply((current) => takeBox(current, "human", category));
  };

  // Ada's turn, one step at a time (solo play only).
  useEffect(() => {
    if (isMulti) return;
    if (state.phase !== "play" || state.turn !== "cpu") return;
    const timer = setTimeout(() => {
      setState((current) => {
        if (current.phase !== "play" || current.turn !== "cpu") return current;
        let next: State;
        if (current.rolls === 0) {
          next = throwDice(current, "cpu");
        } else {
          const currentFaces = current.dice.map((d) => d.face);
          const hold = bestHold(currentFaces, current.cards.cpu);
          if (current.rolls >= MAX_ROLLS || hold.length === DICE_COUNT) {
            next = takeBox(current, "cpu", bestCategory(currentFaces, current.cards.cpu));
          } else {
            const held: State = {
              ...current,
              dice: current.dice.map((d, i) => ({ ...d, held: hold.includes(i) })),
            };
            next = throwDice(held, "cpu");
          }
        }
        stateRef.current = next;
        return next;
      });
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
        ? state.rolloff.human === null
          ? "Highest roll goes first"
          : rolloffWinner === null
            ? "Tie — roll again"
            : rolloffWinner === "human"
              ? "You go first"
              : `${opponentName} goes first`
        : state.phase === "over"
          ? state.draw
          ? "A dead heat — honours shared"
          : state.winner === "human"
            ? "You take the scorecard — you win"
            : `${opponentName} takes the scorecard`
        : myTurn
          ? state.rolls === 0
            ? "Your throw"
            : state.rolls >= MAX_ROLLS
              ? "Last throw — choose a box"
              : `Hold what you want, ${MAX_ROLLS - state.rolls} throw${
                  MAX_ROLLS - state.rolls === 1 ? "" : "s"
                } left`
          : isMulti
            ? `Waiting for ${opponentName}…`
            : "Rattling the cup…";

  const myCard = state.cards.human;
  const theirCard = state.cards.cpu;

  const canToggle = myTurn && state.rolls > 0 && state.rolls < MAX_ROLLS && !rolling;

  const dieAt = (index: number, scatter = false) => {
    const die = state.dice[index]!;
    if (!scatter) {
      return (
        <DieFace
          key={index}
          face={die.face}
          held={die.held}
          interactive={canToggle}
          onClick={() => toggleHold(index)}
        />
      );
    }
    const { angle, dx, dy } = scatterFor(index, die.face);
    return (
      <div
        key={index}
        style={{ transform: `translate(${dx}px, ${dy}px) rotate(${angle}deg)` }}
      >
        <DieFace
          face={die.face}
          held={die.held}
          interactive={canToggle}
          onClick={() => toggleHold(index)}
        />
      </div>
    );
  };

  const showDice = state.phase === "play" && state.rolls > 0;
  const indexes = state.dice.map((_, i) => i);
  const centreDice = showDice ? indexes.filter((i) => !state.dice[i]!.held) : [];
  const keptDice = showDice ? indexes.filter((i) => state.dice[i]!.held) : [];

  const seatBox = (side: Seat) => {
    const mine = side === "human";
    const active = state.turn === side && state.phase === "play";
    const kept = active ? keptDice : [];
    return (
      <section
        className={`rounded-2xl border p-3 transition-colors lg:p-5 ${
          active ? "border-gold/50 bg-brand/70" : "border-gold/15 bg-brand/40"
        }`}
      >
        <div className="flex justify-center lg:justify-start">
          <div className="flex flex-col items-center gap-1.5 lg:flex-row lg:gap-3">
            {mine ? (
              <PlayerAvatar avatar={playerAvatar} onSelect={setPlayerAvatar} />
            ) : (
              <img
                src={ADA_AVATAR}
                alt={`${opponentName}'s avatar`}
                width={64}
                height={64}
                className="size-10 rounded-full border-2 border-gold/40 object-cover"
              />
            )}
            <p className="font-display text-base">{mine ? "You" : opponentName}</p>
          </div>
        </div>
        <div className="mt-4 min-h-16 grid place-items-center">
          {kept.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-3">{kept.map((i) => dieAt(i))}</div>
          ) : (
            <p className="text-xs text-ivory/40">
              {active ? "Dice you keep will sit here" : "Waiting"}
            </p>
          )}
        </div>
        {mine && (
          <div className="mt-4 flex h-9 flex-wrap items-center gap-3">
            {canRoll && !rolling && (
              <Button variant="parlor" onClick={roll}>
                {state.rolls === 0 ? "Throw the dice" : "Throw again"}
              </Button>
            )}
          </div>
        )}
      </section>
    );
  };


  const Row = ({ category }: { category: Category }) => {
    const taken = myCard[category] !== undefined;
    const preview =
      !taken && myTurn && state.rolls > 0 ? scoreCategory(category, faces) : null;
    return (
      <tr className="border-t border-gold/10">
        <td className="py-0.5 pr-2 text-ivory/75 lg:py-1.5">{CATEGORY_LABELS[category]}</td>
        <td className="h-6 text-right lg:h-8">
          {taken ? (
            <span className="font-display text-[13px] text-gold lg:text-[15px]">{myCard[category]}</span>
          ) : preview !== null ? (
            <button
              type="button"
              onClick={() => take(category)}
              className="rounded-md border border-gold/40 px-2 py-0.5 text-xs text-ivory/80 transition-colors hover:bg-gold/20 hover:text-ivory"
            >
              {preview}
            </button>
          ) : (
            <span className="text-ivory/25">—</span>
          )}
        </td>
        <td className="h-6 text-right lg:h-8">
          {theirCard[category] !== undefined ? (
            <span className="font-display text-[13px] text-ivory lg:text-[15px]">{theirCard[category]}</span>
          ) : (
            <span className="text-ivory/25">—</span>
          )}
        </td>
      </tr>
    );
  };

  const Totals = ({ label, mine, theirs }: { label: string; mine: number; theirs: number }) => (
    <tr className="border-t border-gold/25 bg-gold/5">
      <td className="py-0.5 pr-2 text-[11px] uppercase tracking-[0.16em] text-ivory/60 lg:py-1.5">{label}</td>
      <td className="py-0.5 text-right font-display text-[13px] text-gold lg:py-1.5 lg:text-[15px]">{mine}</td>
      <td className="py-0.5 text-right font-display text-[13px] text-ivory lg:py-1.5 lg:text-[15px]">{theirs}</td>
    </tr>
  );

  const scorecard = (
    <div className="rounded-xl border border-gold/20 bg-brand/50 p-4">
      <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-ivory/60">Scorecard</p>
      <table className="w-full text-[11px] lg:text-[13px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.18em] text-ivory/40">
            <th className="pb-1 text-left font-normal" />
            <th className="pb-1 text-right font-normal">You</th>
            <th className="pb-1 text-right font-normal">{shortName(opponentName)}</th>
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
            label="Total score"
            mine={grandTotal(myCard)}
            theirs={grandTotal(theirCard)}
          />
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
      hideOpponent
      gameInProgress={
        state.phase === "play" && (state.rolls > 0 || Object.keys(myCard).length > 0)
      }
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/yahtzee", search: { opponent: nickname, match: newMatchId } });
        reset();
      }}
      onNewGame={reset}
      rail={<div className="hidden lg:block">{scorecard}</div>}
    >
      <GameOverDialog
        open={state.phase === "over"}
        result={state.winner === "human" ? "win" : state.winner === "cpu" ? "loss" : "draw"}
        playerScore={grandTotal(myCard)}
        opponentScore={grandTotal(theirCard)}
        scoreLabel="Final scorecard total"
        opponentName={opponentName}
        playerAvatar={playerAvatar}
        onPlayAgain={reset}
      />
      <div className="space-y-5">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold">
              {state.phase === "over"
                ? "Card full"
                : state.phase === "rolloff"
                  ? ""
                  : state.turn === "human"
                    ? "Your turn"
                    : `${opponentName}'s turn`}
            </p>
            {state.phase === "play" && state.rolls > 0 && (
              <p className="mt-1 font-display text-3xl font-bold">
                Throw {Math.min(state.rolls, MAX_ROLLS)} of {MAX_ROLLS}
              </p>
            )}
            <p className="mt-1 text-sm text-ivory/55">{status}</p>
          </div>
          {state.phase === "over" && (
            <Button variant="parlor" onClick={reset}>
              Play again
            </Button>
          )}
        </section>

        <div className="grid grid-cols-2 items-start gap-3 lg:block">
          <div className="min-w-0 space-y-2.5">
            {seatBox("cpu")}

            <section className="grid h-44 place-items-center rounded-2xl border border-dashed border-gold/20 bg-brand/20 p-3 lg:h-64 lg:p-6">
              {state.phase === "rolloff" ? (
                <div className="text-center">
                  <p className="mt-1 font-display text-xs font-bold">Highest roll starts game</p>
                  <div className="mt-2 flex items-center justify-center gap-8">
                    <div className="flex flex-col items-center gap-2">
                      <p className="font-display">You</p>
                      {state.rolloff.human !== null ? (
                        <DieFace face={state.rolloff.human} />
                      ) : (
                        <div className="grid size-[1.6rem] lg:size-16 place-items-center rounded-xl border-2 border-dashed border-gold/30" />
                      )}
                    </div>
                    <p className="font-display text-2xl text-gold">vs</p>
                    <div className="flex flex-col items-center gap-2">
                      <p className="font-display">{opponentName}</p>
                      {state.rolloff.cpu !== null ? (
                        <DieFace face={state.rolloff.cpu} />
                      ) : (
                        <div className="grid size-[1.6rem] lg:size-16 place-items-center rounded-xl border-2 border-dashed border-gold/30" />
                      )}
                    </div>
                  </div>
                  {state.rolloff.human !== null &&
                    (rolloffWinner === null ? (
                      <p className="mt-2 text-sm text-ivory/55">Tie at {state.rolloff.human} — roll again.</p>
                    ) : (
                      <p className="mt-2 text-sm text-ivory/55">
                        {rolloffWinner === "human" ? "You go first!" : `${opponentName} goes first!`}
                      </p>
                    ))}
                  {!rolloffResolving && (
                    <div className="mt-2">
                      <Button variant="parlor" onClick={rollForFirst} disabled={!canRollOff}>
                        {state.rolloff.human === null ? "Roll for first turn" : "Roll again"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : centreDice.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-3">{centreDice.map((i) => dieAt(i, true))}</div>
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
  onClick,
}: {
  face: number;
  held?: boolean;
  interactive?: boolean;
  dim?: boolean;
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
      className={`grid size-[1.6rem] lg:size-16 rounded-xl border lg:border-2 bg-cream p-1 lg:p-1.5 transition-all ${
        held ? "-translate-y-1.5 border-gold shadow-lg shadow-black/40" : "border-cream/40"
      } ${dim ? "opacity-40" : ""} ${
        interactive ? "cursor-pointer hover:-translate-y-1 hover:border-gold" : "cursor-default"
      }`}
    >
      <span className="grid size-full grid-cols-3 grid-rows-3 gap-px">
        {Array.from({ length: 9 }, (_, cell) => (
          <span
            key={cell}
            className={`m-auto size-[0.2rem] lg:size-2 rounded-full ${pips.includes(cell) ? "bg-brand" : ""}`}
          />
        ))}
      </span>
    </button>
  );
}
