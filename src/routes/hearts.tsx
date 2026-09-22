import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { getGame } from "@/lib/games";
import { getNickname } from "@/lib/multiplayer";
import { ACE_AVATAR, ADA_AVATAR, LEO_AVATAR, readAvatar } from "@/lib/avatars";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import cardBackAsset from "@/assets/card-back.png";
import { readFlag } from "@/lib/flags";
import { PlayerFlag } from "@/components/parlor/PlayerFlag";
import {
  PASS_LABEL,
  SEATS,
  SEAT_NAMES,
  choosePassCards,
  choosePlay,
  idleState,
  initGame,
  legalPlays,
  play,
  redeal,
  setPass,
  type Seat,
  type State,
} from "@/lib/hearts";

const BOTS: Seat[] = ["ace", "ada", "leo"];
const DEAL_ORDER: Seat[] = ["ace", "ada", "leo", "you"];

type FlyingCard = {
  key: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  card?: Card;
};

const FLIGHT_MS = 500;
const DEAL_STAGGER_MS = 40;

export const Route = createFileRoute("/hearts")({
  head: () => ({
    meta: [
      { title: "Hearts — Cards and Games" },
      {
        name: "description",
        content:
          "Avoid the hearts and the queen of spades in a four-player game of Hearts against Ace, Ada and Leo.",
      },
    ],
  }),
  component: HeartsTable,
});

function HeartsTable() {
  const navigate = useNavigate();
  const game = getGame("hearts");
  const [state, setState] = useState<State>(() => idleState());
  const [passSelection, setPassSelection] = useState<string[]>([]);
  const [isDealing, setIsDealing] = useState(false);
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const packRef = useRef<HTMLDivElement>(null);
  const trickRef = useRef<HTMLDivElement>(null);
  const seatRefs = useRef<Partial<Record<Seat, HTMLDivElement | null>>>({});
  const flightKeyRef = useRef(0);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Fly a played card from its seat to the centre, then commit the play.
  const animatePlay = useCallback(
    (seat: Seat, card: Card) => {
      const fromRect = seatRefs.current[seat]?.getBoundingClientRect();
      const toRect = trickRef.current?.getBoundingClientRect();
      const from = fromRect
        ? { x: fromRect.left, y: fromRect.top }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const to = toRect
        ? { x: toRect.left, y: toRect.top }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const key = flightKeyRef.current++;
      setFlying((current) => [...current, { key, from, to, card }]);
      window.setTimeout(() => {
        setFlying((current) => current.filter((f) => f.key !== key));
        setState((current) => play(current, seat, card.id));
      }, FLIGHT_MS);
    },
    [],
  );

  // This table is only for the owner — everyone else is sent back to the lobby.
  useEffect(() => {
    if ((getNickname() ?? "").toLowerCase() !== "spry123456") {
      void navigate({ to: "/" });
    }
  }, [navigate]);

  // Computer seats pass three cards automatically.
  useEffect(() => {
    if (state.phase !== "passing") return;
    const pending = BOTS.filter((seat) => state.passSelections[seat] === null);
    if (!pending.length) return;
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (current.phase !== "passing") return current;
        let next = current;
        for (const seat of BOTS) {
          if (next.passSelections[seat] === null) {
            next = setPass(next, seat, choosePassCards(next.hands[seat] ?? []));
          }
        }
        return next;
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.passSelections]);

  // Computer seats play their cards automatically.
  useEffect(() => {
    if (state.phase !== "playing" || state.turn === "you") return;
    const seat = state.turn;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== "playing" || current.turn !== seat) return;
      const cardId = choosePlay(current, seat);
      if (!cardId) return;
      const card = current.hands[seat]?.find((c) => c.id === cardId);
      if (card) animatePlay(seat, card);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.turn, animatePlay]);

  // After a scored hand the table sits in "dealing" briefly, then deals again.
  useEffect(() => {
    if (state.phase !== "dealing") return;
    const timer = window.setTimeout(() => {
      setState((current) => (current.phase === "dealing" ? redeal(current, Math.random) : current));
      setPassSelection([]);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [state.phase]);

  const myHand = state.hands.you ?? [];
  const isPassing = state.phase === "passing";
  const needsToPass = isPassing && state.passSelections.you === null;
  const myTurn = state.phase === "playing" && state.turn === "you";

  const legalIds = useMemo(() => {
    if (!myTurn) return new Set<string>();
    return new Set(legalPlays(state, "you").map((card) => card.id));
  }, [state, myTurn]);

  const playerAvatar = readAvatar();
  const playerFlag = readFlag();
  const playerName = getNickname() ?? "You";
  const seatAvatar = (seat: Seat) =>
    seat === "you" ? playerAvatar : seat === "ace" ? ACE_AVATAR : seat === "ada" ? ADA_AVATAR : LEO_AVATAR;

  const winnerName =
    state.winner === "you"
      ? (getNickname() ?? "You")
      : state.winner
        ? SEAT_NAMES[state.winner]
        : "Opponent";

  const results = useMemo(() => {
    if (!state.winner) return undefined;
    return SEATS.map((seat) => ({
      name: seat === "you" ? (getNickname() ?? "You") : SEAT_NAMES[seat],
      score: state.points[seat] ?? 0,
      avatar: seatAvatar(seat),
      won: seat === state.winner,
    }));
  }, [state.winner, state.points, playerAvatar]);

  const startNewGame = useCallback(() => {
    setState(idleState());
    setPassSelection([]);
    setIsDealing(false);
    setFlying([]);
  }, []);

  const setSeatRef = (seat: Seat) => (el: HTMLDivElement | null) => {
    seatRefs.current[seat] = el;
  };

  const scheduleFlights = (flights: FlyingCard[]) => {
    flights.forEach((flight, index) => {
      window.setTimeout(() => {
        setFlying((current) => [...current, flight]);
      }, index * DEAL_STAGGER_MS);
    });
    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => !flights.some((x) => x.key === f.key)));
    }, (flights.length - 1) * DEAL_STAGGER_MS + FLIGHT_MS);
  };

  const dealCards = () => {
    if (state.phase !== "ready" || isDealing) return;
    const packRect = packRef.current?.getBoundingClientRect();
    const from = packRect
      ? { x: packRect.left, y: packRect.top }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    const flights: FlyingCard[] = [];
    let key = 0;
    for (let round = 0; round < 13; round++) {
      for (const seat of DEAL_ORDER) {
        const el = seatRefs.current[seat];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        flights.push({ key: key++, from, to: { x: rect.left, y: rect.top } });
      }
    }

    setIsDealing(true);
    scheduleFlights(flights);
    window.setTimeout(() => {
      setState((current) =>
        current.phase === "ready"
          ? initGame(Math.random, current.handNumber, current.points)
          : current,
      );
      setPassSelection([]);
      setIsDealing(false);
    }, (flights.length - 1) * DEAL_STAGGER_MS + FLIGHT_MS + 80);
  };

  const togglePass = (id: string) => {
    setPassSelection((selected) => {
      if (selected.includes(id)) return selected.filter((x) => x !== id);
      if (selected.length >= 3) return selected;
      return [...selected, id];
    });
  };

  const confirmPass = () => {
    if (passSelection.length !== 3) return;
    setState((current) => {
      if (current.phase !== "passing") return current;
      return setPass(current, "you", passSelection);
    });
    setPassSelection([]);
  };

  const playCard = (card: Card) => {
    if (state.phase !== "playing" || state.turn !== "you") return;
    if (!legalPlays(state, "you").some((c) => c.id === card.id)) return;
    animatePlay("you", card);
  };

  const handleCardClick = (card: Card) => {
    if (needsToPass) togglePass(card.id);
    else if (myTurn) playCard(card);
  };

  return (
    <TableShell
      game={game}
      opponentName="Ace, Ada & Leo"
      opponentStatus=""
      hideOpponent
      gameInProgress={state.phase !== "over"}
      onMatched={() => {}}
      onNewGame={startNewGame}
      lobby={({ open, onOpenChange }) => <HeartsLobby open={open} onOpenChange={onOpenChange} />}
      containerClassName="px-1.5 sm:px-3"
    >
      <GameOverDialog
        open={state.phase === "over"}
        result={state.winner === "you" ? "win" : "loss"}
        playerScore={state.points.you ?? 0}
        opponentScore={state.winner ? (state.points[state.winner] ?? 0) : 0}
        scoreLabel="Penalty points — lowest wins"
        opponentName={winnerName}
        playerAvatar={playerAvatar}
        {...(results ? { results } : {})}
        onPlayAgain={startNewGame}
        footerExtra={
          <Button variant="parlorOutline" onClick={() => navigate({ to: "/" })}>
            Back to game room
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="flex justify-center">
          <SeatPanel
            avatar={seatAvatar("ada")}
            name={SEAT_NAMES.ada}
            count={state.hands.ada?.length ?? 0}
            points={state.points.ada ?? 0}
            flag={playerFlag}
            isTurn={state.turn === "ada" && state.phase === "playing"}
            cardRef={setSeatRef("ada")}
            side="top"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <SeatPanel
              avatar={seatAvatar("ace")}
              name={SEAT_NAMES.ace}
              count={state.hands.ace?.length ?? 0}
              points={state.points.ace ?? 0}
              flag={playerFlag}
              isTurn={state.turn === "ace" && state.phase === "playing"}
              cardRef={setSeatRef("ace")}
              side="left"
            />
          </div>

        <div ref={trickRef} className="flex min-h-[65px] flex-1 flex-col items-center justify-center gap-1 text-center">
          {state.phase === "ready" && (
            <div className="flex flex-col items-center gap-3">
              <div ref={packRef} className="relative h-32 w-[88px]">
                <CardBack className="absolute left-0 top-0 h-32 w-[88px]" />
                <CardBack className="absolute left-2 top-2 h-32 w-[88px]" />
                <CardBack className="absolute left-4 top-4 h-32 w-[88px]" />
              </div>
              {isDealing ? (
                <p className="text-sm text-ivory/70">Dealing…</p>
              ) : (
                <Button variant="parlor" onClick={dealCards}>Deal</Button>
              )}
            </div>
          )}
          {state.phase === "passing" && (
            <p className="text-sm text-ivory/70">{PASS_LABEL[state.passDirection]}</p>
          )}
          {state.phase === "dealing" && <p className="text-sm text-ivory/70">Dealing the next hand…</p>}
          {state.phase === "playing" && (
            <p className="text-sm text-ivory/70">
              {state.turn === "you" ? "Your turn" : `${SEAT_NAMES[state.turn]} is playing`}
            </p>
          )}
          {state.heartsBroken && state.phase === "playing" && (
            <p className="text-xs text-destructive">Hearts have been broken</p>
          )}
          {state.trick.length > 0 ? (
            <div className="flex items-center">
              {state.trick.map((played, i) => (
                <div key={played.card.id} className={`flex flex-col items-center ${i > 0 ? "-ml-8" : ""}`}>
                  <HeartsCard card={played.card} corner />
                  <span className="mt-1 text-[10px] text-ivory/60">{SEAT_NAMES[played.seat]}</span>
                </div>
              ))}
            </div>
          ) : (
            state.phase === "playing" && <p className="text-xs text-ivory/40">Lead a card to start the trick</p>
          )}
        </div>
          <div className="shrink-0">
            <SeatPanel
              avatar={seatAvatar("leo")}
              name={SEAT_NAMES.leo}
              count={state.hands.leo?.length ?? 0}
              points={state.points.leo ?? 0}
              flag={playerFlag}
              isTurn={state.turn === "leo" && state.phase === "playing"}
              cardRef={setSeatRef("leo")}
              side="right"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-ivory/60">
              Your hand — {state.points.you ?? 0} pts
            </p>
            {needsToPass && <p className="text-xs text-gold">{3 - passSelection.length} more to pass</p>}
          </div>
          <div ref={setSeatRef("you")} className="flex min-h-24 items-end justify-center">
            {myHand.map((card, i) => {
              const selected = passSelection.includes(card.id);
              const legal = myTurn && legalIds.has(card.id);
              const dimmed = needsToPass && passSelection.length >= 3 && !selected;
              return (
                <HeartsCard
                  key={card.id}
                  card={card}
                  corner
                  selected={selected}
                  highlighted={legal}
                  dimmed={dimmed}
                  onClick={needsToPass || myTurn ? () => handleCardClick(card) : undefined}
                  className={i > 0 ? "-ml-8" : ""}
                />
              );
            })}
          </div>
          {needsToPass && (
            <div className="mt-3 text-center">
              <Button variant="parlor" disabled={passSelection.length !== 3} onClick={confirmPass}>
                Pass {passSelection.length}/3 cards
              </Button>
            </div>
          )}
          <div className="mt-2 flex flex-col items-center gap-1">
            <img
              src={playerAvatar}
              alt={playerName}
              className="size-12 rounded-full object-cover ring-1 ring-ivory/20"
            />
            <p className="font-display text-sm font-bold">{playerName}</p>
            <div className="flex items-center gap-1.5">
              <PlayerFlag flag={playerFlag} className="size-4" />
              <p className="inline-block rounded-full bg-gold/15 px-2 py-0.5 text-xs font-bold text-gold">
                {state.points.you ?? 0} pts
              </p>
            </div>
          </div>
        </div>
      </div>
      {flying.map((flight) => (
        <FlyingCardView key={flight.key} flight={flight} />
      ))}
    </TableShell>
  );
}

function SeatPanel({
  avatar,
  name,
  count,
  points,
  flag,
  isTurn,
  cardRef,
  side = "top",
}: {
  avatar: string;
  name: string;
  count: number;
  points: number;
  flag: string | null;
  isTurn: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
  side?: "top" | "left" | "right";
}) {
  const identity = (
    <div className="flex flex-col items-center gap-1">
      <img
        src={avatar}
        alt={name}
        className={`size-12 rounded-full object-cover ${isTurn ? "ring-2 ring-gold" : "ring-1 ring-ivory/20"}`}
      />
      <p className="font-display text-sm font-bold">{name}</p>
      <div className="flex items-center gap-1.5">
        <PlayerFlag flag={flag} className="size-4" />
        <p className="inline-block rounded-full bg-gold/15 px-2 py-0.5 text-xs font-bold text-gold">
          {points} pts
        </p>
      </div>
    </div>
  );

  const verticalFan =
    count > 0 ? (
      <div className="flex flex-col items-center">
        {Array.from({ length: count }).map((_, i) => (
          <CardBack key={i} className={`h-10 w-[72px] ${i > 0 ? "-mt-6" : ""}`} />
        ))}
      </div>
    ) : null;

  const horizontalFan =
    count > 0 ? (
      <div className="flex items-end">
        {Array.from({ length: count }).map((_, i) => (
          <CardBack key={i} className={`h-[72px] w-10 ${i > 0 ? "-ml-6" : ""}`} />
        ))}
      </div>
    ) : null;

  if (side === "right") {
    return (
      <div className="flex items-center gap-2">
        <div ref={cardRef} className="flex flex-col items-center">
          {verticalFan}
        </div>
        {identity}
      </div>
    );
  }

  if (side === "left") {
    return (
      <div className="flex items-center gap-2">
        {identity}
        <div ref={cardRef} className="flex flex-col items-center">
          {verticalFan}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={cardRef} className="flex min-h-[72px] items-end justify-center">
        {horizontalFan}
      </div>
      {identity}
    </div>
  );
}

function HeartsLobby({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-gold/30 bg-brand text-cream sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center font-display text-2xl">Play Hearts</DialogTitle>
          <DialogDescription className="text-center text-ivory/70">
            Hearts is played against three computer players — Ace, Ada and Leo. Avoid the hearts and the
            queen of spades; the lowest penalty score wins.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

function HeartsCard({
  card,
  small = false,
  corner = false,
  selected = false,
  highlighted = false,
  dimmed = false,
  onClick,
  className = "",
}: {
  card: Card;
  small?: boolean;
  corner?: boolean;
  selected?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  onClick?: (() => void) | undefined;
  className?: string;
}) {
  const red = card.suit === "H" || card.suit === "D";
  const rank = RANK_LABEL[card.rank];
  const suit = SUIT_SYMBOL[card.suit];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative flex shrink-0 flex-col items-center justify-center rounded-lg border bg-cream shadow-md shadow-black/30 ${
        corner ? "h-[88px] w-[68px]" : small ? "h-[144px] w-[100px]" : "h-[184px] w-[124px] sm:h-[216px] sm:w-[144px]"
      } ${red ? "text-destructive" : "text-brand"} ${
        selected
          ? "z-10 -translate-y-2 border-gold ring-2 ring-gold"
          : highlighted
            ? "z-10 border-gold ring-1 ring-gold/60"
            : "border-black/10"
      } ${dimmed ? "opacity-45" : ""} ${
        onClick ? "cursor-pointer transition-transform hover:z-10 hover:-translate-y-1" : "cursor-default"
      } ${className}`}
    >
      {corner ? (
        <>
          <span className="absolute left-2 top-1 font-display text-2xl font-bold leading-none">{rank}</span>
          <span className="absolute left-2 top-8 text-2xl leading-none">{suit}</span>
        </>
      ) : (
        <>
          <span className="absolute left-2 top-1 font-display text-2xl font-bold leading-none">{rank}</span>
          <span className="absolute left-2 top-8 text-2xl leading-none">{suit}</span>
          <span className={small ? "text-4xl" : "text-5xl"}>{suit}</span>
        </>
      )}
      <span className="sr-only">{cardLabel(card)}</span>
    </button>
  );
}

function CardBack({ className = "" }: { className?: string }) {
  return (
    <img
      src={cardBackAsset}
      alt=""
      aria-hidden="true"
      className={`block rounded-lg object-cover shadow-md shadow-black/30 ${className}`}
    />
  );
}

function FlyingCardView({ flight }: { flight: FlyingCard }) {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    let raf = 0;
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setMoved(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  const dx = moved ? flight.to.x - flight.from.x : 0;
  const dy = moved ? flight.to.y - flight.from.y : 0;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 transition-transform duration-500 ease-out"
      style={{ left: flight.from.x, top: flight.from.y, transform: `translate(${dx}px, ${dy}px)` }}
    >
      {flight.card ? (
        <HeartsCard card={flight.card} corner />
      ) : (
        <CardBack className="h-32 w-[88px]" />
      )}
    </div>
  );
}



