import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { FlagPicker } from "@/components/parlor/FlagPicker";
import { PlayerFlag } from "@/components/parlor/PlayerFlag";
import {
  SEATS,
  SEAT_NAMES,
  choosePassCards,
  choosePlay,
  idleState,
  initGame,
  legalPlays,
  play,
  redeal,
  resolvePass,
  setPass,
  type PlayedCard,
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
  rotate?: "cw" | "ccw";
};

const FLIGHT_MS = 500;
const DEAL_STAGGER_MS = 200;
const CARD_W = 68;
const CARD_H = 88;
const H_FAN_STEP = 36; // 68 − 32 overlap for horizontal fans
const V_FAN_STEP = 24; // 88 − 64 overlap for vertical fans

// Position a 68×88 card so its centre lands on a rectangle's midpoint.
const centreOn = (rect: DOMRect) => ({
  x: rect.left + rect.width / 2 - CARD_W / 2,
  y: rect.top + rect.height / 2 - CARD_H / 2,
});

// Top-left position for a card so its centre lands on a specific fan slot.
const fanSlotPosition = (
  rect: DOMRect,
  index: number,
  total: number,
  orientation: "horizontal" | "vertical",
) => {
  if (orientation === "horizontal") {
    const totalWidth = CARD_W + (total - 1) * H_FAN_STEP;
    const startX = rect.left + rect.width / 2 - totalWidth / 2;
    return { x: startX + index * H_FAN_STEP, y: rect.bottom - CARD_H };
  }
  return {
    x: rect.left + rect.width / 2 - CARD_W / 2,
    y: rect.top + index * V_FAN_STEP,
  };
};

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
  const trickRefs = useRef<Partial<Record<Seat, HTMLDivElement | null>>>({});
  const flightKeyRef = useRef(0);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const scheduleFlights = useCallback((flights: FlyingCard[]) => {
    flights.forEach((flight, index) => {
      window.setTimeout(() => {
        setFlying((current) => [...current, flight]);
      }, index * DEAL_STAGGER_MS);
    });
    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => !flights.some((x) => x.key === f.key)));
    }, (flights.length - 1) * DEAL_STAGGER_MS + FLIGHT_MS);
  }, []);

  // Sweep a completed trick's four cards from the centre into the winner's pile.
  const collectTrick = useCallback(
    (trick: PlayedCard[], winner: Seat) => {
      const fromRect = trickRef.current?.getBoundingClientRect();
      const toRect = trickRefs.current[winner]?.getBoundingClientRect();
      const fallback = {
        x: window.innerWidth / 2 - CARD_W / 2,
        y: window.innerHeight / 2 - CARD_H / 2,
      };
      const from = fromRect ? centreOn(fromRect) : fallback;
      const to = toRect ? centreOn(toRect) : fallback;
      const flights = trick.map(() => ({
        key: flightKeyRef.current++,
        from,
        to,
      }));
      scheduleFlights(flights);
    },
    [scheduleFlights],
  );

  // Fly a played card from its seat to the centre, then commit the play.
  const animatePlay = useCallback(
    (seat: Seat, card: Card) => {
      const fromRect = seatRefs.current[seat]?.getBoundingClientRect();
      const toRect = trickRef.current?.getBoundingClientRect();
      const from = fromRect
        ? centreOn(fromRect)
        : { x: window.innerWidth / 2 - CARD_W / 2, y: window.innerHeight / 2 - CARD_H / 2 };
      const to = toRect
        ? centreOn(toRect)
        : { x: window.innerWidth / 2 - CARD_W / 2, y: window.innerHeight / 2 - CARD_H / 2 };
      const key = flightKeyRef.current++;
      setFlying((current) => [...current, { key, from, to, card }]);
      window.setTimeout(() => {
        setFlying((current) => current.filter((f) => f.key !== key));
        const prev = stateRef.current;
        const next = play(prev, seat, card.id);
        setState(next);
        // A completed trick: sweep its four cards into the winner's pile.
        if (prev.trick.length === 3 && next.trick.length === 0) {
          collectTrick(prev.trick, next.turn);
        }
      }, FLIGHT_MS);
    },
    [collectTrick],
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
  const [playerFlag, setPlayerFlag] = useState<string | null>(readFlag);
  const [flagOpen, setFlagOpen] = useState(false);
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

  const setTrickRef = (seat: Seat) => (el: HTMLDivElement | null) => {
    trickRefs.current[seat] = el;
  };

  const dealCards = () => {
    if (state.phase !== "ready" || isDealing) return;
    const packRect = packRef.current?.getBoundingClientRect();
    const from = packRect
      ? centreOn(packRect)
      : { x: window.innerWidth / 2 - CARD_W / 2, y: window.innerHeight / 2 - CARD_H / 2 };

    // Deal the next hand up front so the player's cards can fly face-up.
    const next = initGame(Math.random, state.handNumber, state.points);
    const playerCards = next.hands.you ?? [];

    const flights: FlyingCard[] = [];
    let key = 0;
    const dealt: Record<Seat, number> = { you: 0, ace: 0, ada: 0, leo: 0 };
    for (let round = 0; round < 13; round++) {
      for (const seat of DEAL_ORDER) {
        const el = seatRefs.current[seat];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const index = dealt[seat]++;
        const card = seat === "you" ? playerCards[index] : undefined;
        const rotate = seat === "ace" ? ("cw" as const) : seat === "leo" ? ("ccw" as const) : undefined;
        const orientation = seat === "you" || seat === "ada" ? ("horizontal" as const) : ("vertical" as const);
        flights.push({
          key: key++,
          from,
          to: fanSlotPosition(rect, index, 13, orientation),
          ...(card ? { card } : {}),
          ...(rotate ? { rotate } : {}),
        });
      }
    }

    setIsDealing(true);
    scheduleFlights(flights);
    window.setTimeout(() => {
      setState((current) => (current.phase === "ready" ? next : current));
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
    if (passSelection.length !== 3 || state.phase !== "passing") return;

    // Make sure every seat has a selection (computers choose automatically).
    const selections: Record<Seat, string[] | null> = { ...state.passSelections, you: passSelection };
    for (const seat of BOTS) {
      if (selections[seat] === null) selections[seat] = choosePassCards(state.hands[seat] ?? []);
    }
    const resolved = resolvePass({ ...state, passSelections: selections });
    if (!resolved) return;

    // Fly each passed card from its hand to its new hand, then commit.
    const fallback = { x: window.innerWidth / 2 - CARD_W / 2, y: window.innerHeight / 2 - CARD_H / 2 };
    const flights = resolved.transfers.map((t) => {
      const srcRect = seatRefs.current[t.from]?.getBoundingClientRect();
      const dstRect = seatRefs.current[t.to]?.getBoundingClientRect();
      const index = (state.hands[t.from] ?? []).findIndex((c) => c.id === t.card.id);
      const orientation =
        t.from === "you" || t.from === "ada" ? ("horizontal" as const) : ("vertical" as const);
      const from = srcRect ? fanSlotPosition(srcRect, index, 13, orientation) : fallback;
      const to = dstRect ? centreOn(dstRect) : fallback;
      return { key: flightKeyRef.current++, from, to, card: t.card };
    });

    scheduleFlights(flights);
    window.setTimeout(() => {
      setState(resolved.next);
      setPassSelection([]);
    }, (flights.length - 1) * DEAL_STAGGER_MS + FLIGHT_MS + 80);
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
            hand={state.hands.ada ?? []}
            selectedIds={state.passSelections.ada ?? []}
            isTurn={state.turn === "ada" && state.phase === "playing"}
            cardRef={setSeatRef("ada")}
            trickRef={setTrickRef("ada")}
            tricks={state.tricks.ada ?? []}
            side="top"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <SeatPanel
              avatar={seatAvatar("ace")}
              name={SEAT_NAMES.ace}
              hand={state.hands.ace ?? []}
              selectedIds={state.passSelections.ace ?? []}
              isTurn={state.turn === "ace" && state.phase === "playing"}
              cardRef={setSeatRef("ace")}
              trickRef={setTrickRef("ace")}
              tricks={state.tricks.ace ?? []}
              side="left"
            />
          </div>

        <div ref={trickRef} className="flex min-h-[65px] flex-1 flex-col items-center justify-center gap-1 text-center">
          {state.phase === "ready" && (
            <div className="flex flex-col items-center gap-3">
              <div ref={packRef} className="relative h-[88px] w-[68px]">
                <CardBack className="absolute left-0 top-0 h-[88px] w-[68px]" />
                <CardBack className="absolute left-1 top-1 h-[88px] w-[68px]" />
                <CardBack className="absolute left-2 top-2 h-[88px] w-[68px]" />
              </div>
              {isDealing ? (
                <p className="text-sm text-ivory/70">Dealing…</p>
              ) : (
                <Button variant="parlor" onClick={dealCards}>Deal</Button>
              )}
            </div>
          )}
          {state.phase === "passing" && (
            <Button variant="parlor" disabled={passSelection.length !== 3} onClick={confirmPass}>
              Pass {passSelection.length}/3 cards
            </Button>
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
              hand={state.hands.leo ?? []}
              selectedIds={state.passSelections.leo ?? []}
              isTurn={state.turn === "leo" && state.phase === "playing"}
              cardRef={setSeatRef("leo")}
              trickRef={setTrickRef("leo")}
              tricks={state.tricks.leo ?? []}
              side="right"
            />
          </div>
        </div>

        <div>
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
          <div className="mt-2 flex items-center justify-center gap-2">
            <img
              src={playerAvatar}
              alt={playerName}
              className="size-12 rounded-full object-cover ring-1 ring-ivory/20"
            />
            <div className="flex flex-col items-start gap-0.5">
              <p className="font-display text-sm font-bold">{playerName}</p>
              <div className="flex items-center gap-1.5">
                <PlayerFlag flag={playerFlag} onClick={() => setFlagOpen(true)} className="size-4" />
                <p className="inline-block rounded-full bg-gold/15 px-2 py-0.5 text-xs font-bold text-gold">
                  {state.points.you ?? 0} pts
                </p>
                <div ref={setTrickRef("you")}>
                  <TrickPile tricks={state.tricks.you ?? []} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {flying.map((flight) => (
        <FlyingCardView key={flight.key} flight={flight} />
      ))}
      <FlagPicker open={flagOpen} onOpenChange={setFlagOpen} onSelect={setPlayerFlag} />
    </TableShell>
  );
}

function SeatPanel({
  avatar,
  name,
  isTurn,
  cardRef,
  trickRef,
  side = "top",
  hand = [],
  selectedIds = [],
  tricks = [],
}: {
  avatar: string;
  name: string;
  isTurn: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
  trickRef?: (el: HTMLDivElement | null) => void;
  side?: "top" | "left" | "right";
  hand?: Card[];
  selectedIds?: string[];
  tricks?: Card[][];
}) {
  const identity = (
    <div className="flex flex-col items-center gap-1">
      <img
        src={avatar}
        alt={name}
        className={`size-12 rounded-full object-cover ${isTurn ? "ring-2 ring-gold" : "ring-1 ring-ivory/20"}`}
      />
      <p className="font-display text-sm font-bold">{name}</p>
      <div ref={trickRef} className="flex items-center gap-1.5">
        <TrickPile tricks={tricks} />
      </div>
    </div>
  );

  const rotation = side === "left" ? "rotate-90" : "-rotate-90";
  const verticalFan =
    hand.length > 0 ? (
      <div className="flex flex-col items-center">
        {hand.map((card, i) => {
          const selected = selectedIds.includes(card.id);
          const base = `${rotation} ${i > 0 ? "-mt-16" : ""}`;
          const offset = selected
            ? `${side === "left" ? "translate-x-2" : "-translate-x-2"} ring-2 ring-gold`
            : "";
          return <CardBack key={card.id} className={`h-[88px] w-[68px] ${base} ${offset}`} />;
        })}
      </div>
    ) : null;

  const horizontalFan =
    hand.length > 0 ? (
      <div className="flex items-end">
        {hand.map((card, i) => {
          const selected = selectedIds.includes(card.id);
          const offset = selected ? "translate-y-2 ring-2 ring-gold" : "";
          return (
            <CardBack
              key={card.id}
              className={`h-[88px] w-[68px] ${i > 0 ? "-ml-8" : ""} ${offset}`}
            />
          );
        })}
      </div>
    ) : null;

  if (side === "right") {
    return (
      <div className="flex items-center gap-2">
        {/* Reserve the 13-card fan footprint so seats don't shift after dealing. */}
        <div ref={cardRef} className="flex min-h-[376px] min-w-[88px] flex-col items-center">
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
        {/* Reserve the 13-card fan footprint so seats don't shift after dealing. */}
        <div ref={cardRef} className="flex min-h-[376px] min-w-[88px] flex-col items-center">
          {verticalFan}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <img
          src={avatar}
          alt={name}
          className={`size-12 rounded-full object-cover ${isTurn ? "ring-2 ring-gold" : "ring-1 ring-ivory/20"}`}
        />
        <div className="flex flex-col items-start gap-0.5">
          <p className="font-display text-sm font-bold">{name}</p>
          <div ref={trickRef} className="flex items-center gap-1.5">
            <TrickPile tricks={tricks} />
          </div>
        </div>
      </div>
      <div ref={cardRef} className="flex min-h-[88px] items-end justify-center">
        {horizontalFan}
      </div>
    </div>
  );
}

// A won trick rendered as a single face-down miniature card (37.5% of the
// corner-card size — the previous 25% size increased by half).
function MiniCard({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <img
      src={cardBackAsset}
      alt=""
      aria-hidden="true"
      className={`block h-[33px] w-[25.5px] rounded-[3px] object-cover shadow-sm ${className}`}
      style={style}
    />
  );
}

// The stack of tricks a seat has won, kept at the side of the player. Each trick
// is one face-down card; multiple tricks overlap into a pile with a running count.
function TrickPile({ tricks }: { tricks: Card[][] }) {
  if (!tricks.length) return null;
  return (
    <div className="flex items-center gap-1">
      <div className="relative h-[33px] w-[25.5px]">
        {tricks.map((_, i) => (
          <MiniCard
            key={i}
            className="absolute left-0 top-0"
            style={{ transform: `translateY(${-i}px)` }}
          />
        ))}
      </div>
      <span className="text-[10px] font-semibold leading-none text-gold">{tricks.length}</span>
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
        <HeartsCard
          card={flight.card}
          corner
          className={flight.rotate === "cw" ? "rotate-90" : flight.rotate === "ccw" ? "-rotate-90" : ""}
        />
      ) : (
        <CardBack
          className={`h-[88px] w-[68px] ${
            flight.rotate === "cw" ? "rotate-90" : flight.rotate === "ccw" ? "-rotate-90" : ""
          }`}
        />
      )}
    </div>
  );
}



