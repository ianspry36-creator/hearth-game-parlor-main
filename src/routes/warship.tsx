import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { getGame } from "@/lib/games";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
import { useMatch } from "@/lib/multiplayer";
import { playExplosion, playSinking, playSplash } from "@/lib/warship-sounds";
import {
  FLEET,
  SIZE,
  allSunk,
  chooseCpuShot,
  coordLabel,
  fits,
  haloCells,
  isHit,
  isSunk,
  moveShip,
  randomFleet,
  rotateShip,
  shipAt,
  shipCells,
  rowOf,
  type Ship,
} from "@/lib/warship";
import { mulberry32 } from "@/lib/random";


export const Route = createFileRoute("/warship")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Play Warship — Cards and Games" },
      {
        name: "description",
        content:
          "Hide your fleet, call your shots and sink Ada's ships — or take on a live human opponent from the waiting room.",
      },
      { property: "og:title", content: "Play Warship — Cards and Games" },
      {
        property: "og:description",
        content: "Warship in the parlor: place your fleet, fire square by square, sink the enemy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WarshipTable,
});

type Seat = "human" | "cpu";
type LogEntry = { side: Seat | null; text: string };

type State = {
  phase: "place" | "play" | "over";
  ships: { human: Ship[]; cpu: Ship[] };
  ready: { human: boolean; cpu: boolean };
  /** Squares each side has fired at on the other's grid. */
  shots: { human: number[]; cpu: number[] };
  turn: Seat;
  log: LogEntry[];
  winner: Seat | null;
};

// The opening fleet must match the server, so the first render uses a fixed
// seed and is re-placed once the client mounts.
const SSR_SEED = 20260829;

const freshState = (random: () => number = Math.random): State => ({
  phase: "place",
  ships: { human: randomFleet(random), cpu: [] },
  ready: { human: false, cpu: false },
  shots: { human: [], cpu: [] },
  turn: "human",
  log: [{ side: null, text: "Drag your ships, double-click to rotate, then signal ready." }],
  winner: null,
});

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);
const flip = (side: Seat): Seat => (side === "human" ? "cpu" : "human");

function mirror(state: State): State {
  return {
    ...state,
    ships: { human: state.ships.cpu, cpu: state.ships.human },
    ready: { human: state.ready.cpu, cpu: state.ready.human },
    shots: { human: state.shots.cpu, cpu: state.shots.human },
    turn: flip(state.turn),
    winner: state.winner ? flip(state.winner) : null,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? flip(entry.side) : null })),
  };
}

/** A sunk hull leaves its surrounding water known-empty, so mark the halo as fired. */
function withHalo(shots: number[], ship: Ship | null): number[] {
  if (!ship) return shots;
  const merged = new Set(shots);
  for (const cell of haloCells(ship)) merged.add(cell);
  return [...merged];
}

/** Explosion / splash / sinking cues for a resolved shot. */
function soundFor(hit: boolean, sank: boolean) {
  if (!hit) {
    playSplash();
    return;
  }
  playExplosion();
  if (sank) setTimeout(playSinking, 450);
}


function WarshipTable() {
  const game = getGame("warship");
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
  const [state, setState] = useState<State>(() => freshState(mulberry32(SSR_SEED)));
  const [grab, setGrab] = useState<{ name: string; cell: number } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;


  const isMulti = Boolean(matchId);
  const opponentName = liveOpponent ?? opponent ?? "Ada";

  // Re-place the opening fleet once we're on the client (avoids an SSR mismatch).
  const didPlace = useRef(false);
  useEffect(() => {
    if (isMulti || didPlace.current) return;
    didPlace.current = true;
    const fresh = freshState();
    stateRef.current = fresh;
    setState(fresh);
  }, [isMulti]);

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

  // Both fleets placed in a live game: open fire.
  useEffect(() => {
    if (!isMulti || !isHost) return;
    if (state.phase !== "place" || !state.ready.human || !state.ready.cpu) return;
    apply((current) => ({
      ...current,
      phase: "play",
      turn: "human",
      log: note(current.log, { side: null, text: "Both fleets are hidden. Open fire." }),
    }));
  }, [isMulti, isHost, state.phase, state.ready.human, state.ready.cpu]);

  // Ada's shot (solo play only).
  useEffect(() => {
    if (isMulti) return;
    if (state.phase !== "play" || state.turn !== "cpu" || state.winner) return;
    const timer = setTimeout(() => {
      setState((current) => {
        if (current.phase !== "play" || current.turn !== "cpu" || current.winner) return current;
        const cell = chooseCpuShot(current.ships.human, current.shots.cpu);
        const base = [...current.shots.cpu, cell];
        const hit = isHit(current.ships.human, cell);
        const sunk = hit ? shipAt(current.ships.human, cell) : null;
        const sank = Boolean(sunk && isSunk(sunk, base));
        const shots = withHalo(base, sank ? sunk : null);
        soundFor(hit, sank);
        const won = allSunk(current.ships.human, shots);

        const next: State = {
          ...current,
          shots: { ...current.shots, cpu: shots },
          turn: hit ? "cpu" : "human",
          winner: won ? "cpu" : null,
          phase: won ? "over" : "play",
          log: note(current.log, {
            side: "cpu",
            text: `fires at ${coordLabel(cell)} — ${
              hit ? (sank ? `hit, and sinks your ${sunk!.name}!` : "a hit.") : "a miss."
            }`,
          }),
        };
        stateRef.current = next;
        return next;
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [isMulti, state.phase, state.turn, state.winner, state.ships.human, state.shots.cpu]);

  const placedNames = state.ships.human.map((ship) => ship.name);
  const nextShip = FLEET.find((spec) => !placedNames.includes(spec.name)) ?? null;
  const placing = state.phase === "place" && !state.ready.human;

  // Drag a hull by holding one of its squares and releasing over the new one.
  useEffect(() => {
    if (!grab) return;
    const clear = () => setGrab(null);
    window.addEventListener("pointerup", clear);
    return () => window.removeEventListener("pointerup", clear);
  }, [grab]);


  const placeAt = (cell: number) => {
    if (!nextShip || state.phase !== "place" || state.ready.human) return;
    const across = shipCells(cell, nextShip.size, true);
    const down = shipCells(cell, nextShip.size, false);
    const cells =
      across && fits(across, state.ships.human)
        ? across
        : down && fits(down, state.ships.human)
          ? down
          : null;
    if (!cells) return;
    apply((current) => ({
      ...current,
      ships: {
        ...current.ships,
        human: [...current.ships.human, { name: nextShip.name, size: nextShip.size, cells }],
      },
    }));
  };

  const randomise = () =>
    apply((current) => ({ ...current, ships: { ...current.ships, human: randomFleet() } }));

  const clearFleet = () =>
    apply((current) => ({ ...current, ships: { ...current.ships, human: [] } }));

  const grabAt = (cell: number) => {
    if (!placing) return;
    const ship = shipAt(state.ships.human, cell);
    if (ship) setGrab({ name: ship.name, cell });
  };

  const dropAt = (cell: number) => {
    if (!placing || !grab) return;
    const held = grab;
    setGrab(null);
    if (held.cell === cell) return;
    const moved = moveShip(stateRef.current.ships.human, held.name, held.cell, cell);
    if (!moved) return;
    apply((current) => ({ ...current, ships: { ...current.ships, human: moved } }));
  };

  const rotateAt = (cell: number) => {
    if (!placing) return;
    const ship = shipAt(state.ships.human, cell);
    if (!ship) return;
    const rotated = rotateShip(stateRef.current.ships.human, ship.name);
    if (!rotated) return;
    apply((current) => ({ ...current, ships: { ...current.ships, human: rotated } }));
  };


  const confirmFleet = () => {
    if (state.ships.human.length !== FLEET.length) return;
    if (isMulti) {
      apply((current) => ({
        ...current,
        ready: { ...current.ready, human: true },
        log: note(current.log, { side: "human", text: "have hidden your fleet." }),
      }));
      return;
    }
    apply((current) => ({
      ...current,
      ships: { ...current.ships, cpu: randomFleet() },
      ready: { human: true, cpu: true },
      phase: "play",
      turn: "human",
      log: note(current.log, { side: null, text: "Fleets are hidden. Take the first shot." }),
    }));
  };

  const fire = (cell: number) => {
    if (state.phase !== "play" || state.turn !== "human" || state.winner) return;
    if (state.shots.human.includes(cell)) return;
    apply((current) => {
      const base = [...current.shots.human, cell];
      const hit = isHit(current.ships.cpu, cell);
      const sunk = hit ? shipAt(current.ships.cpu, cell) : null;
      const sank = Boolean(sunk && isSunk(sunk, base));
      const shots = withHalo(base, sank ? sunk : null);

      soundFor(hit, sank);
      const won = allSunk(current.ships.cpu, shots);
      return {
        ...current,
        shots: { ...current.shots, human: shots },
        turn: hit ? "human" : "cpu",
        winner: won ? "human" : null,
        phase: won ? "over" : "play",
        log: note(current.log, {
          side: "human",
          text: `fire at ${coordLabel(cell)} — ${
            hit ? (sank ? `a hit, and you sink the ${sunk!.name}!` : "a hit.") : "a miss."
          }`,
        }),
      };
    });
  };

  const status =
    isMulti && !match
      ? "Opening the shared table…"
      : state.winner
        ? state.winner === "human"
          ? "Fleet sunk — you win"
          : `${opponentName} sank your fleet`
        : state.phase === "place"
          ? state.ready.human
            ? `Waiting for ${opponentName} to place their fleet…`
            : "Place your fleet"
          : state.turn === "human"
            ? "Call your shot"
            : isMulti
              ? `Waiting for ${opponentName}…`
              : "Taking aim…";

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus={status}
      opponentDisconnected={opponentDisconnected}
      disconnectSecondsLeft={disconnectSecondsLeft}
      disconnectExpired={disconnectExpired}
      gameInProgress={state.phase === "play"}
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/warship", search: { opponent: nickname, match: newMatchId } });
        setState(freshState());
      }}
      onNewGame={reset}
      rail={null}
    >
      <GameOverDialog
        open={Boolean(state.winner)}
        result={state.winner === "human" ? "win" : "loss"}
        playerScore={state.ships.cpu.filter((ship) => isSunk(ship, state.shots.human)).length}
        opponentScore={state.ships.human.filter((ship) => isSunk(ship, state.shots.cpu)).length}
        scoreLabel="Ships sunk"
        opponentName={opponentName}
        playerAvatar={playerAvatar}
        onPlayAgain={reset}
      />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ivory/60">
            {placing
              ? nextShip
                ? `Placing the ${nextShip.name} (${nextShip.size} square${nextShip.size === 1 ? "" : "s"}) — ships must never touch.`
                : "Drag a ship to move it, double-click to rotate, then hit Ready."
              : status}
          </p>

          <div className="flex flex-wrap gap-2">
            {state.phase === "place" && !state.ready.human && (
              <>
                <Button variant="parlorOutline" onClick={randomise}>
                  Randomise
                </Button>
                <Button variant="parlorGhost" onClick={clearFleet}>
                  Clear
                </Button>
                <Button
                  variant="parlor"
                  disabled={state.ships.human.length !== FLEET.length}
                  onClick={confirmFleet}
                >
                  Ready
                </Button>
              </>
            )}
            {state.winner && (
              <Button variant="parlor" onClick={reset}>
                Play again
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <section
            className={
              state.phase === "place"
                ? "flex-1"
                : "order-2 w-3/4 self-end lg:order-1 lg:w-auto lg:flex-1 lg:self-auto"
            }
          >
            <div className="mb-2 flex items-center gap-3">
              <PlayerAvatar avatar={playerAvatar} onSelect={setPlayerAvatar} />
              <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Your waters</p>
            </div>
            <Grid
              ships={state.ships.human}
              shots={state.shots.cpu}
              revealShips
              interactive={placing}
              onCell={placeAt}
              draggingShip={grab?.name ?? null}
              onGrab={grabAt}
              onDrop={dropAt}
              onRotate={rotateAt}
              hideLabelsOnMobile
            />

          </section>
          <section
            className={
              state.phase === "place"
                ? "hidden flex-1 lg:block"
                : "order-1 w-full lg:order-2 lg:w-auto lg:flex-1"
            }
          >
            <div className="mb-2 flex items-center gap-3">
              <img
                src={ADA_AVATAR}
                alt={`${opponentName}'s avatar`}
                width={64}
                height={64}
                className="size-10 rounded-full border-2 border-gold/40 bg-surface object-cover"
              />
              <p className="text-[11px] uppercase tracking-[0.3em] text-gold">
                {opponentName}&apos;s waters
              </p>
            </div>
            <Grid
              ships={state.ships.cpu}
              shots={state.shots.human}
              revealShips={state.phase === "over"}
              interactive={state.phase === "play" && state.turn === "human" && !state.winner}
              onCell={fire}
            />
          </section>
        </div>
      </div>
    </TableShell>
  );
}

/** Hull colours and deck markings per ship class. */
const HULL: Record<string, { body: string; mark: string; glyph: string }> = {
  Carrier: { body: "bg-red-600", mark: "border-red-200/70", glyph: "✈" },
  Battleship: { body: "bg-yellow-500", mark: "border-yellow-200/60", glyph: "⌖" },
  Cruiser: { body: "bg-cyan-600", mark: "border-cyan-200/60", glyph: "⚓" },
  Submarine: { body: "bg-cyan-600", mark: "border-cyan-200/60", glyph: "◉" },
  Destroyer: { body: "bg-pink-500", mark: "border-pink-200/60", glyph: "▲" },
  "Patrol Boat": { body: "bg-teal-600", mark: "border-teal-200/60", glyph: "◎" },
  Gunboat: { body: "bg-orange-600", mark: "border-orange-200/60", glyph: "◆" },
  Scout: { body: "bg-purple-600", mark: "border-purple-200/60", glyph: "▪" },
};

function ShipSegment({ ship, cell }: { ship: Ship; cell: number }) {
  const horizontal = ship.cells.length > 1 && rowOf(ship.cells[0]!) === rowOf(ship.cells[1]!);
  const index = ship.cells.indexOf(cell);
  const bow = index === 0;
  const stern = index === ship.cells.length - 1;
  const middle = index === Math.floor((ship.cells.length - 1) / 2);
  const hull = HULL[ship.name] ?? HULL["Destroyer"]!;

  const radius = horizontal
    ? `${bow ? "rounded-l-full" : ""} ${stern ? "rounded-r-[35%]" : ""}`
    : `${bow ? "rounded-t-full" : ""} ${stern ? "rounded-b-[35%]" : ""}`;

  return (
    <span
      className={`absolute inset-[1px] ${hull.body} ${radius} border ${hull.mark} grid place-items-center overflow-hidden`}
    >
      {middle ? (
        <span className="text-[8px] leading-none text-white/90">{hull.glyph}</span>
      ) : (
        <span
          className={`${horizontal ? "h-[2px] w-2/3" : "h-2/3 w-[2px]"} rounded-full bg-white/35`}
        />
      )}
    </span>
  );
}

function Grid({
  ships,
  shots,
  revealShips,
  interactive,
  onCell,
  draggingShip = null,
  onGrab,
  onDrop,
  onRotate,
  hideLabelsOnMobile = false,
}: {
  ships: Ship[];
  shots: number[];
  revealShips: boolean;
  interactive: boolean;
  onCell: (cell: number) => void;
  draggingShip?: string | null;
  onGrab?: (cell: number) => void;
  onDrop?: (cell: number) => void;
  onRotate?: (cell: number) => void;
  hideLabelsOnMobile?: boolean;
}) {
  const occupied = new Set(ships.flatMap((ship) => ship.cells));
  return (
    <div className="w-full rounded-2xl border border-gold/25 bg-brand/70 p-2.5 shadow-2xl shadow-black/40">
      <div
        className={`grid gap-1 ${
          hideLabelsOnMobile
            ? "grid-cols-10 lg:grid-cols-[1rem_repeat(10,minmax(0,1fr))]"
            : "grid-cols-[1rem_repeat(10,minmax(0,1fr))]"
        }`}
      >
        <span className={hideLabelsOnMobile ? "hidden lg:block" : ""} />
        {Array.from({ length: SIZE }, (_, col) => (
          <span
            key={`c${col}`}
            className={`text-center text-[8px] uppercase tracking-widest text-ivory/35 ${
              hideLabelsOnMobile ? "hidden lg:block" : ""
            }`}
          >
            {col + 1}
          </span>
        ))}
        {Array.from({ length: SIZE }, (_, row) => (
          <Row key={`r${row}`}>
            <span
              className={`grid place-items-center text-[8px] uppercase tracking-widest text-ivory/35 ${
                hideLabelsOnMobile ? "hidden lg:grid" : ""
              }`}
            >
              {String.fromCharCode(65 + row)}
            </span>
            {Array.from({ length: SIZE }, (_, col) => {
              const cell = row * SIZE + col;
              const shot = shots.includes(cell);
              const hit = shot && occupied.has(cell);
              const ship = revealShips && occupied.has(cell) ? shipAt(ships, cell) : null;
              const dragged = Boolean(draggingShip && ship?.name === draggingShip);
              return (
                <button
                  key={cell}
                  aria-label={coordLabel(cell)}
                  disabled={!interactive}
                  onClick={() => onCell(cell)}
                  onPointerDown={(event) => {
                    // Release implicit touch capture so the drop lands on the square under the finger.
                    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    onGrab?.(cell);
                  }}
                  onPointerUp={() => onDrop?.(cell)}
                  onDoubleClick={() => onRotate?.(cell)}
                  className={`relative aspect-square touch-none select-none rounded-[3px] border text-[10px] font-semibold transition-colors ${
                    shot && !hit
                      ? "border-gold/10 bg-surface/80 text-ivory/45"
                      : "border-gold/10 bg-surface/40"
                  } ${dragged ? "opacity-60 ring-1 ring-gold" : ""} ${
                    interactive ? "cursor-pointer hover:border-gold hover:bg-gold/20" : "cursor-default"
                  }`}
                >
                  {ship && <ShipSegment ship={ship} cell={cell} />}
                  {hit && (
                    <span className="absolute inset-[1px] grid place-items-center rounded-[3px] bg-red-600/80 text-cream">
                      ✕
                    </span>
                  )}
                  {shot && !hit ? "·" : ""}
                </button>
              );

            })}
          </Row>
        ))}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
