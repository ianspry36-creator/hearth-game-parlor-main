import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { CryingTears } from "@/components/parlor/CryingTears";
import { getGame } from "@/lib/games";
import { getNickname } from "@/lib/multiplayer";
import { ACE_AVATAR, ADA_AVATAR, LEO_AVATAR, readAvatar } from "@/lib/avatars";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card } from "@/lib/cribbage";
import cardBackAsset from "@/assets/card-back.png";
import { readFlag } from "@/lib/flags";
import { FlagPicker } from "@/components/parlor/FlagPicker";
import { PlayerFlag } from "@/components/parlor/PlayerFlag";
import { AvatarPicker } from "@/components/parlor/AvatarPicker";
import { NicknameDialog } from "@/components/parlor/NicknameDialog";
import {
  SEATS,
  SEAT_NAMES,
  choosePassCards,
  choosePlay,
  idleState,
  initGame,
  isFirstTrick,
  isQueenOfSpades,
  isValidState,
  legalPlays,
  play,
  rankValue,
  redeal,
  remapState,
  resolvePass,
  resolveTrick,
  setPass,
  trickPenalty,
  trickWinner,
  type PlayedCard,
  type Seat,
  type State,
} from "@/lib/hearts";
import { playHeartsBroken } from "@/lib/hearts-sounds";
import { isStalePlayingRoom, leaveRoom, useCrazyEightsRoom } from "@/lib/crazyEightsLobby";
import { HeartsLobby } from "@/components/parlor/HeartsLobby";

const BOTS: Seat[] = ["ace", "ada", "leo"];
const DEAL_ORDER: Seat[] = ["ace", "ada", "leo", "you"];

type FlyingCard = {
  key: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  card?: Card;
  rotate?: "cw" | "ccw";
  rotateFrom?: "cw" | "ccw"; // starting orientation (the source hand); rotates into `rotate` in flight
  duration?: number; // flight duration in ms (defaults to FLIGHT_MS for the deal)
  shrinkTo?: number; // scale the card down to as it flies (used when sweeping a trick away)
};

const FLIGHT_MS = 500; // deal flight duration
const PLAY_FLIGHT_MS = 1000; // card movement (play/pass/collect) — twice as slow as the deal
const DEAL_STAGGER_MS = 100;
// Mobile (<640px) uses compact cards; desktop uses larger ones. The breakpoint
// matches the `sm:` classes used for the rendered cards below.
const isDesktop = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;

// Face-up player and trick cards — larger on desktop (75×97 vs 56×73).
const cardW = () => (isDesktop() ? 75 : 56);
const cardH = () => (isDesktop() ? 97 : 73);

// Player's horizontal fan step: only the rank and suit corner stays visible.
// Desktop overlaps 21px (step 54); mobile overlaps 32px (step 24) — 10% less
// reveal than the previous 27px step, so the hand stays tighter on small screens.
const hFanStep = () => (isDesktop() ? 54 : 24);
// Opponent fan reveal: a thin sliver of each back — 20% wider on desktop.
const OPP_H_STEP = () => (isDesktop() ? 7.2 : 6);
const OPP_V_STEP = () => (isDesktop() ? 9.6 : 8);
const TRICK_PAUSE_MS = 2000; // hold the completed trick on the table before sweeping it away
const miniScale = () => 42 / cardW(); // shrink sweeping trick cards to the mini-card size on arrival

// Position a card so its centre lands on a rectangle's midpoint.
const centreOn = (rect: DOMRect) => ({
  x: rect.left + rect.width / 2 - cardW() / 2,
  y: rect.top + rect.height / 2 - cardH() / 2,
});

// Top-left position for a played card so it lands in its slot within the trick
// row (each card overlaps the previous by 24px via -ml-6, so the slot step is 32).
const trickSlotPosition = (rect: DOMRect, index: number) => {
  const centre = centreOn(rect);
  return { x: centre.x + (index * (cardW() - 24)) / 2, y: centre.y };
};

// Top-left position for a card so its centre lands on a specific fan slot.
const fanSlotPosition = (
  rect: DOMRect,
  index: number,
  total: number,
  orientation: "horizontal" | "vertical",
  step: number,
) => {
  if (orientation === "horizontal") {
    const totalWidth = cardW() + (total - 1) * step;
    const startX = rect.left + rect.width / 2 - totalWidth / 2;
    return { x: startX + index * step, y: rect.bottom - cardH() };
  }
  return {
    x: rect.left + rect.width / 2 - cardW() / 2,
    y: rect.top + index * step,
  };
};

// Fan step for a seat: the player's own hand spreads fully, opponents overlap more.
const fanStep = (seat: Seat, orientation: "horizontal" | "vertical"): number =>
  seat === "you" ? hFanStep() : orientation === "horizontal" ? OPP_H_STEP() : OPP_V_STEP();

// Resting orientation of a seat's hand: Ace (left) and Leo (right) fan vertically
// (rotated), while the player (bottom) and Ada (top) fan horizontally.
const seatRotation = (seat: Seat): "cw" | "ccw" | undefined =>
  seat === "ace" ? "cw" : seat === "leo" ? "ccw" : undefined;

export const Route = createFileRoute("/hearts")({
  validateSearch: (search: Record<string, unknown>) => ({
    room: typeof search["room"] === "string" ? (search["room"] as string) : undefined,
  }),
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
  const { room: roomId } = Route.useSearch();
  const handlePlay = useCallback(
    (id: string) => navigate({ to: "/hearts", search: { room: id } }),
    [navigate],
  );
  const {
    room: liveRoom,
    players: roomPlayers,
    mySeat,
    isHost: roomIsHost,
    remoteState: roomRemoteState,
    publish: publishRoom,
    loading: roomLoading,
  } = useCrazyEightsRoom(roomId);
  const [state, setState] = useState<State>(() => idleState());
  const [passSelection, setPassSelection] = useState<string[]>([]);
  const [isDealing, setIsDealing] = useState(false);
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [sweepWinner, setSweepWinner] = useState<Seat | null>(null);
  const [cryingSeat, setCryingSeat] = useState<Seat | null>(null);
  const packRef = useRef<HTMLDivElement>(null);
  const trickRowRef = useRef<HTMLDivElement>(null);
  const seatRefs = useRef<Partial<Record<Seat, HTMLDivElement | null>>>({});
  const trickRefs = useRef<Partial<Record<Seat, HTMLDivElement | null>>>({});
  const flightKeyRef = useRef(0);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const scheduleFlights = useCallback((flights: FlyingCard[]) => {
    const duration = flights[0]?.duration ?? FLIGHT_MS;
    flights.forEach((flight, index) => {
      window.setTimeout(() => {
        setFlying((current) => [...current, flight]);
      }, index * DEAL_STAGGER_MS);
    });
    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => !flights.some((x) => x.key === f.key)));
    }, (flights.length - 1) * DEAL_STAGGER_MS + duration);
  }, []);

  // Sweep a completed trick's four cards from the centre into the winner's pile.
  const collectTrick = useCallback(
    (trick: PlayedCard[], winner: Seat) => {
      const fromRect = trickRowRef.current?.getBoundingClientRect();
      const toRect = trickRefs.current[winner]?.getBoundingClientRect();
      const fallback = {
        x: window.innerWidth / 2 - cardW() / 2,
        y: window.innerHeight / 2 - cardH() / 2,
      };
      const from = fromRect ? centreOn(fromRect) : fallback;
      const to = toRect ? centreOn(toRect) : fallback;
      const flights = trick.map((played) => ({
        key: flightKeyRef.current++,
        from,
        to,
        duration: PLAY_FLIGHT_MS,
        card: played.card,
        shrinkTo: miniScale(),
      }));
      scheduleFlights(flights);
    },
    [scheduleFlights],
  );

  // Live multiplayer table: humans join seats and the rest are played by computers.
  const isRoom = Boolean(roomId);
  const roomSeatOf = (seat: Seat): number => (mySeat + SEATS.indexOf(seat)) % 4;
  const isBotSeat = (seat: Seat): boolean => {
    if (!isRoom) return seat !== "you";
    const occ = roomPlayers.find((p) => p.seat === roomSeatOf(seat));
    return Boolean(occ?.is_bot);
  };

  // Fly a played card from its seat to its slot in the trick, then commit the play.
  const animatePlay = useCallback(
    (seat: Seat, card: Card) => {
      const fromRect = seatRefs.current[seat]?.getBoundingClientRect();
      const trickRect = trickRowRef.current?.getBoundingClientRect();
      const fallback = { x: window.innerWidth / 2 - cardW() / 2, y: window.innerHeight / 2 - cardH() / 2 };
      // Fly from the card's own slot in the fan, not the centre of the whole hand.
      const hand = stateRef.current.hands[seat] ?? [];
      const index = hand.findIndex((c) => c.id === card.id);
      const orientation = seat === "you" || seat === "ada" ? ("horizontal" as const) : ("vertical" as const);
      const from = fromRect
        ? fanSlotPosition(fromRect, index, hand.length, orientation, fanStep(seat, orientation))
        : fallback;
      const to = trickRect ? trickSlotPosition(trickRect, stateRef.current.trick.length) : fallback;
      const key = flightKeyRef.current++;

      // Work out the play's outcome up front so the hearts-broken smash fires the
      // moment the heart is played, in sync with the card — not after it lands.
      const prev = stateRef.current;
      const completing = prev.trick.length === 3;
      const next = play(prev, seat, card.id, !completing);
      const brokeHearts = !prev.heartsBroken && next.heartsBroken;

      // Remove the card from the hand straight away so it leaves the fan as it
      // flies, instead of lingering in place until the flight lands.
      setState((current) => ({
        ...current,
        hands: {
          ...current.hands,
          [seat]: (current.hands[seat] ?? []).filter((c) => c.id !== card.id),
        },
      }));

      // Played cards are always shown face up — including the opposition's.
      setFlying((current) => [...current, { key, from, to, duration: PLAY_FLIGHT_MS, card }]);

      // The smash plays immediately, in parallel with the card's flight.
      if (brokeHearts) void playHeartsBroken();

      window.setTimeout(() => {
        setFlying((current) => current.filter((f) => f.key !== key));
        setState(next);
        if (isRoom) void publishRoom(remapState(next, mySeat));
        // A completed trick: pause, then sweep its four cards into the winner's pile.
        if (completing) {
          const fullTrick = [...prev.trick, { seat, card }];
          const winner = trickWinner(fullTrick);
          const leadSuit = fullTrick[0]!.card.suit;
          const winning = fullTrick.reduce(
            (best, p) => (p.card.suit === leadSuit && rankValue(p.card) > rankValue(best.card) ? p : best),
            fullTrick[0]!,
          );
          const pen = trickPenalty(fullTrick);
          setCommentary(
            `${seatName(winner)} won the trick with ${cardLabel(winning.card)}${
              pen ? ` (+${pen} point${pen === 1 ? "" : "s"})` : ""
            }.`,
          );
          window.setTimeout(() => {
            const resolved = resolveTrick(stateRef.current);
            setState(resolved);
            if (isRoom) void publishRoom(remapState(resolved, mySeat));
            // Hide the winner's new mini-card while the four cards are still
            // flying into the pile, then reveal it once the sweep lands.
            setSweepWinner(resolved.turn);
            collectTrick(fullTrick, resolved.turn);
            window.setTimeout(() => {
              setSweepWinner(null);
            }, (fullTrick.length - 1) * DEAL_STAGGER_MS + PLAY_FLIGHT_MS + 80);
          }, TRICK_PAUSE_MS);
        }
      }, PLAY_FLIGHT_MS);
    },
    [collectTrick, isRoom, mySeat, publishRoom],
  );

  // The lobby host deals the opening hand once the room flips to "playing".
  useEffect(() => {
    if (!isRoom || !roomIsHost || roomLoading) return;
    if (isValidState(roomRemoteState)) return;
    if (liveRoom?.status !== "playing") return;
    if (roomPlayers.length < 2) return;
    const fresh = initGame(Math.random);
    stateRef.current = fresh;
    setState(fresh);
    setPassSelection([]);
    setCommentary(null);
    void publishRoom(remapState(fresh, mySeat));
  }, [isRoom, roomIsHost, roomRemoteState, roomLoading, liveRoom?.status, roomPlayers.length, mySeat, publishRoom]);

  // Read the live room's canonical state into our own seat's view.
  useEffect(() => {
    if (!isRoom || !roomRemoteState || !isValidState(roomRemoteState)) return;
    const view = remapState(roomRemoteState as State, -mySeat);
    stateRef.current = view;
    setState(view);
  }, [isRoom, roomRemoteState, mySeat]);

  // If we land on a table whose host vanished before dealing, leave it.
  useEffect(() => {
    if (!isRoom || !roomId || roomLoading || !liveRoom) return;
    if (!isStalePlayingRoom(liveRoom)) return;
    void leaveRoom(roomId).then(() =>
      navigate({ to: "/hearts", search: { room: undefined } }),
    );
  }, [isRoom, roomId, roomLoading, liveRoom, navigate]);

  // Release our seat when navigating away from the table.
  useEffect(() => {
    return () => {
      if (roomId) void leaveRoom(roomId);
    };
  }, [roomId]);

  // Computer seats pass three cards automatically.
  useEffect(() => {
    if (state.phase !== "passing") return;
        if (isRoom) return; // the host resolves passing in a live room
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
        if (isRoom && (!roomIsHost || !isBotSeat(state.turn))) return;
    const seat = state.turn;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== "playing" || current.turn !== seat) return;
      const cardId = choosePlay(current, seat);
      if (!cardId) return;
      const card = current.hands[seat]?.find((c) => c.id === cardId);
      if (card) animatePlay(seat, card);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.turn, state.trick.length, animatePlay, isRoom, roomIsHost, isBotSeat]);

  // After a scored hand the table sits in "dealing" briefly, then deals again.
  useEffect(() => {
    if (state.phase !== "dealing") return;
    if (isRoom && !roomIsHost) return;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== "dealing") return;
      const next = redeal(current, Math.random);
      stateRef.current = next;
      setState(next);
      if (isRoom) void publishRoom(remapState(next, mySeat));
      setPassSelection([]);
      setCommentary(null);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [state.phase, isRoom, roomIsHost, mySeat, publishRoom]);

  // In a live room the host fills computer passes and resolves once all four
  // selections are in.
  useEffect(() => {
    if (!isRoom || !roomIsHost) return;
    if (state.phase !== "passing") return;
    let selections = state.passSelections;
    let changed = false;
    for (const seat of BOTS) {
      if (isBotSeat(seat) && selections[seat] === null) {
        selections = { ...selections, [seat]: choosePassCards(state.hands[seat] ?? []) };
        changed = true;
      }
    }
    if (changed) {
      const next = { ...state, passSelections: selections };
      stateRef.current = next;
      setState(next);
      void publishRoom(remapState(next, mySeat));
      return;
    }
    if (SEATS.every((s) => selections[s] !== null)) {
      const resolved = resolvePass({ ...state, passSelections: selections });
      if (resolved) {
        stateRef.current = resolved.next;
        setState(resolved.next);
        setPassSelection([]);
        void publishRoom(remapState(resolved.next, mySeat));
      }
    }
  }, [isRoom, roomIsHost, state, isBotSeat, mySeat, publishRoom]);

  const myHand = state.hands.you ?? [];
  const queenHolder = useMemo(
    () =>
      SEATS.find((seat) =>
        (state.tricks[seat] ?? []).some((trick) => trick.some((c) => isQueenOfSpades(c))),
      ),
    [state.tricks],
  );
  useEffect(() => {
    if (!queenHolder) return;
    setCryingSeat(queenHolder);
    const timer = window.setTimeout(() => setCryingSeat(null), 4000);
    return () => window.clearTimeout(timer);
  }, [queenHolder]);

  const [playerAvatar, setPlayerAvatar] = useState<string>(() => readAvatar());
  const [playerFlag, setPlayerFlag] = useState<string | null>(readFlag);
  const [flagOpen, setFlagOpen] = useState(false);
  const [playerName, setPlayerName] = useState<string>(() => getNickname() ?? "You");
  const seatName = (seat: Seat): string => {
    if (seat === "you") return playerName;
    if (!isRoom) return SEAT_NAMES[seat];
    const occ = roomPlayers.find((p) => p.seat === roomSeatOf(seat));
    return occ ? occ.nickname : SEAT_NAMES[seat];
  };
  const seatAvatar = (seat: Seat): string => {
    if (seat === "you") return playerAvatar;
    if (!isRoom) return seat === "ace" ? ACE_AVATAR : seat === "ada" ? ADA_AVATAR : LEO_AVATAR;
    const occ = roomPlayers.find((p) => p.seat === roomSeatOf(seat));
    if (occ?.avatar) return occ.avatar;
    return seat === "ace" ? ACE_AVATAR : seat === "ada" ? ADA_AVATAR : LEO_AVATAR;
  };
  const seatFlag = (seat: Seat): string | null => {
    if (seat === "you") return playerFlag;
    if (!isRoom) return null;
    const occ = roomPlayers.find((p) => p.seat === roomSeatOf(seat));
    return occ?.flag ?? null;
  };

  const isPassing = state.phase === "passing";
  const needsToPass = isPassing && state.passSelections.you === null;
  const myTurn = state.phase === "playing" && state.turn === "you";
  const mustLeadTwo = myTurn && isFirstTrick(state) && myHand.some((c) => c.rank === 2 && c.suit === "C");

  const legalIds = useMemo(() => {
    if (!myTurn) return new Set<string>();
    return new Set(legalPlays(state, "you").map((card) => card.id));
  }, [state, myTurn]);

  const winnerName =
    state.winner === "you"
      ? playerName
      : state.winner
        ? seatName(state.winner)
        : "Opponent";

  const seatNames: Record<Seat, string> = {
    you: playerName,
    ace: seatName("ace"),
    ada: seatName("ada"),
    leo: seatName("leo"),
  };

  const results = useMemo(() => {
    if (!state.winner) return undefined;
    return SEATS.map((seat) => ({
      name: seatName(seat),
      score: state.points[seat] ?? 0,
      avatar: seatAvatar(seat),
      won: seat === state.winner,
    }));
  }, [state.winner, state.points, playerAvatar, playerName]);

  const startNewGame = useCallback(() => {
    setState(idleState());
    setPassSelection([]);
    setIsDealing(false);
    setFlying([]);
    setCryingSeat(null);
    setCommentary(null);
    setSweepWinner(null);
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
      : { x: window.innerWidth / 2 - cardW() / 2, y: window.innerHeight / 2 - cardH() / 2 };

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
          to: fanSlotPosition(rect, index, 13, orientation, fanStep(seat, orientation)),
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

        // In a live room we publish our choice; the host resolves once everyone
        // has selected.
        if (isRoom) {
          const next = { ...state, passSelections: { ...state.passSelections, you: passSelection } };
          stateRef.current = next;
          setState(next);
          setPassSelection([]);
          void publishRoom(remapState(next, mySeat));
          return;
        }

    // Make sure every seat has a selection (computers choose automatically).
    const selections: Record<Seat, string[] | null> = { ...state.passSelections, you: passSelection };
    for (const seat of BOTS) {
      if (selections[seat] === null) selections[seat] = choosePassCards(state.hands[seat] ?? []);
    }
    const resolved = resolvePass({ ...state, passSelections: selections });
    if (!resolved) return;

    // Fly each passed card from its hand to its new hand, then commit.
    const fallback = { x: window.innerWidth / 2 - cardW() / 2, y: window.innerHeight / 2 - cardH() / 2 };
    const flights = resolved.transfers.map((t) => {
      const srcRect = seatRefs.current[t.from]?.getBoundingClientRect();
      const dstRect = seatRefs.current[t.to]?.getBoundingClientRect();
      const index = (state.hands[t.from] ?? []).findIndex((c) => c.id === t.card.id);
      const orientation =
        t.from === "you" || t.from === "ada" ? ("horizontal" as const) : ("vertical" as const);
      const from = srcRect
        ? fanSlotPosition(srcRect, index, 13, orientation, fanStep(t.from, orientation))
        : fallback;
      const to = dstRect ? centreOn(dstRect) : fallback;
      const rotateFrom = seatRotation(t.from);
      const rotate = seatRotation(t.to);
      return {
        key: flightKeyRef.current++,
        from,
        to,
        duration: PLAY_FLIGHT_MS,
        // Cards passed from the opposition stay face down; only the player's own
        // passed cards are shown face up.
        ...(t.from === "you" ? { card: t.card } : {}),
        // Each card leaves its own hand's orientation and arrives matching the
        // receiving hand (e.g. Ace's vertical cards rotate flat for Ada).
        ...(rotateFrom ? { rotateFrom } : {}),
        ...(rotate ? { rotate } : {}),
      };
    });

    scheduleFlights(flights);
    window.setTimeout(() => {
      setState(resolved.next);
      setPassSelection([]);
    }, (flights.length - 1) * DEAL_STAGGER_MS + PLAY_FLIGHT_MS + 80);
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
      gameInProgress={state.phase !== "ready" && state.phase !== "over"}
      onMatched={() => {}}
      onNewGame={startNewGame}
      lobby={({ open, onOpenChange }) => (
        <HeartsLobby game={game} open={open} onOpenChange={onOpenChange} onPlay={handlePlay} />
      )}
      containerClassName="px-1.5 sm:px-3"
      boxClassName="pl-[5px] sm:pl-8"
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

      <div className="relative flex flex-col">
        <div className="absolute right-0 top-0 z-20">
          <Scoreboard points={state.points} names={seatNames} />
        </div>
        <div className="mb-4 flex justify-center">
          <SeatPanel
            avatar={seatAvatar("ada")}
            name={seatName("ada")}
            flag={seatFlag("ada")}
            isBot={isBotSeat("ada")}
            hand={state.hands.ada ?? []}
            selectedIds={state.passSelections.ada ?? []}
            isTurn={state.turn === "ada" && state.phase === "playing"}
            cardRef={setSeatRef("ada")}
            trickRef={setTrickRef("ada")}
            tricks={state.tricks.ada ?? []}
            hideLastTrick={sweepWinner === "ada"}
            crying={cryingSeat === "ada"}
            side="top"
          />
        </div>

        <div className="mb-[3px] flex items-center gap-0.5">
          <div className="shrink-0">
            <SeatPanel
              avatar={seatAvatar("ace")}
              name={seatName("ace")}
              flag={seatFlag("ace")}
              isBot={isBotSeat("ace")}
              hand={state.hands.ace ?? []}
              selectedIds={state.passSelections.ace ?? []}
              isTurn={state.turn === "ace" && state.phase === "playing"}
              cardRef={setSeatRef("ace")}
              trickRef={setTrickRef("ace")}
              tricks={state.tricks.ace ?? []}
              hideLastTrick={sweepWinner === "ace"}
              crying={cryingSeat === "ace"}
              side="left"
            />
          </div>

        <div className="flex min-h-[65px] flex-1 flex-col items-center justify-center gap-1 text-center">
          {state.phase === "ready" && (
            <div className="flex flex-col items-center gap-3">
              <div ref={packRef} className="relative h-[49px] w-[38px] sm:h-[117px] sm:w-[90px]">
                <CardBack className="absolute left-0 top-0 h-[49px] w-[38px] sm:h-[117px] sm:w-[90px]" />
                <CardBack className="absolute left-[2px] top-[2px] h-[49px] w-[38px] sm:left-[4px] sm:top-[4px] sm:h-[117px] sm:w-[90px]" />
                <CardBack className="absolute left-[4px] top-[4px] h-[49px] w-[38px] sm:left-[8px] sm:top-[8px] sm:h-[117px] sm:w-[90px]" />
              </div>
              {isDealing ? (
                <p className="text-sm text-ivory/70">Dealing…</p>
              ) : (
                <Button variant="parlor" onClick={dealCards}>Deal</Button>
              )}
            </div>
          )}
          {state.phase === "passing" &&
            (needsToPass ? (
              <Button variant="parlor" disabled={passSelection.length !== 3} onClick={confirmPass}>
                Pass {passSelection.length}/3
              </Button>
            ) : (
              <p className="font-display text-base text-gold">
                Waiting for opponents to choose their cards…
              </p>
            ))}
          {state.phase === "dealing" && <p className="text-sm text-ivory/70">Dealing the next hand…</p>}
          {state.phase === "playing" && (
            <>
              {/* Fixed-height status block: pin the text to the top so the turn,
                  hearts-broken and trick-won messages never shift as cards move. */}
              <div className="flex min-h-[68px] flex-col items-center justify-start gap-0.5">
                <p className="text-sm text-ivory/70">
                  {state.turn === "you" ? "Your turn" : `${seatName(state.turn)} is playing`}
                </p>
                {mustLeadTwo && (
                  <p className="text-sm font-semibold text-gold">You must lead the 2 of Clubs</p>
                )}
                {state.heartsBroken && (
                  <p className="text-xs text-destructive">Hearts have been broken</p>
                )}
                {commentary && (
                  <p className="font-display text-base text-gold">{commentary}</p>
                )}
              </div>
              {/* Fixed-height trick row: reserve the four-card footprint so the text
                  above stays put while cards enter and leave the table. */}
              <div ref={trickRowRef} className="flex min-h-[115px] items-center justify-center sm:min-h-[160px]">
                {state.trick.length > 0 ? (
                  <TrickRow trick={state.trick} names={seatNames} />
                ) : (
                  <p className="text-xs text-ivory/40">Lead a card to start the trick</p>
                )}
              </div>
            </>
          )}
        </div>
          <div className="shrink-0">
            <SeatPanel
              avatar={seatAvatar("leo")}
              name={seatName("leo")}
              flag={seatFlag("leo")}
              isBot={isBotSeat("leo")}
              hand={state.hands.leo ?? []}
              selectedIds={state.passSelections.leo ?? []}
              isTurn={state.turn === "leo" && state.phase === "playing"}
              cardRef={setSeatRef("leo")}
              trickRef={setTrickRef("leo")}
              tricks={state.tricks.leo ?? []}
              hideLastTrick={sweepWinner === "leo"}
              crying={cryingSeat === "leo"}
              side="right"
            />
          </div>
        </div>

        <div>
          <div ref={setSeatRef("you")} className="flex min-h-24 items-end justify-center sm:min-h-[150px]">
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
                  className={i > 0 ? "-ml-[32px] sm:-ml-[21px]" : ""}
                />
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <div className="relative">
              <div className={cryingSeat === "you" ? "animate-cry" : undefined}>
                <AvatarPicker avatar={playerAvatar} onSelect={setPlayerAvatar} size="size-[30px] sm:size-[72px]" />
              </div>
              {cryingSeat === "you" && <CryingTears />}
            </div>
            <div className="flex flex-col items-start gap-0.5">
              <NicknameDialog
                trigger={
                  <button
                    type="button"
                    title="Change your name"
                    className="font-display text-sm font-bold transition-colors hover:text-gold"
                  >
                    {playerName}
                  </button>
                }
                onSaved={setPlayerName}
              />
              <div className="flex items-center gap-1.5">
                <PlayerFlag flag={playerFlag} onClick={() => setFlagOpen(true)} className="size-4" />
                <p className="inline-block rounded-full bg-gold/15 px-2 py-0.5 text-xs font-bold text-gold">
                  {(state.handPoints.you ?? 0)} pts
                </p>
                <div ref={setTrickRef("you")}>
                  <TrickPile tricks={state.tricks.you ?? []} horizontal hideLastTrick={sweepWinner === "you"} />
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

function TrickRow({ trick, names }: { trick: PlayedCard[]; names: Record<Seat, string> }) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevLeft = useRef<Record<string, number>>({});

  // FLIP: when a new card lands, glide the existing cards into their new slots
  // instead of letting the centred row snap left.
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    trick.forEach((p) => {
      next[p.card.id] = rowRefs.current[p.card.id]?.getBoundingClientRect().left ?? 0;
    });
    const prev = prevLeft.current;
    for (const p of trick) {
      const el = rowRefs.current[p.card.id];
      const prevVal = prev[p.card.id];
      const nextVal = next[p.card.id];
      if (!el || prevVal == null || nextVal == null) continue;
      const delta = prevVal - nextVal;
      if (Math.abs(delta) > 0.5) {
        el.style.transition = "none";
        el.style.transform = `translateX(${delta}px)`;
        void el.offsetHeight;
        el.style.transition = "transform 300ms ease-out";
        el.style.transform = "translateX(0px)";
      }
    }
    prevLeft.current = next;
  }, [trick]);

  return (
    <div className="flex items-center">
      {trick.map((played, i) => (
        <div
          key={played.card.id}
          ref={(el) => {
            rowRefs.current[played.card.id] = el;
          }}
          className={`relative ${i > 0 ? "-ml-6" : ""}`}
        >
          <HeartsCard card={played.card} corner />
          <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] text-ivory/60">{names[played.seat]}</span>
        </div>
      ))}
    </div>
  );
}

function SeatAvatar({
  avatar,
  name,
  isTurn,
  crying = false,
}: {
  avatar: string;
  name: string;
  isTurn: boolean;
  crying?: boolean;
}) {
  return (
    <div className="relative">
      <div className={crying ? "animate-cry" : undefined}>
        <img
          src={avatar}
          alt={name}
          className={`size-[30px] rounded-full object-cover sm:size-[72px] ${
            isTurn ? "ring-2 ring-gold" : "ring-1 ring-ivory/20"
          }`}
        />
      </div>
      {crying && <CryingTears />}
    </div>
  );
}

function Scoreboard({ points, names }: { points: Record<Seat, number>; names: Record<Seat, string> }) {
  // Lowest score wins in Hearts, so the leader (lowest) sits at the top. When
  // everyone is tied (e.g. at the start of a game) players are listed alphabetically.
  const order = useMemo(
    () =>
      [...SEATS].sort((a, b) => {
        const pa = points[a] ?? 0;
        const pb = points[b] ?? 0;
        if (pa !== pb) return pa - pb;
        return names[a].toLowerCase().localeCompare(names[b].toLowerCase());
      }),
    [points, names],
  );

  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevTop = useRef<Record<string, number>>({});
  const prevOrder = useRef<string | null>(null);

  // FLIP: when the ordering changes, glide each row from its old slot to its new one.
  // Only animate on an actual reorder (not on every render), and clear any in-flight
  // transform first so we always measure the true layout positions.
  useLayoutEffect(() => {
    order.forEach((seat) => {
      const el = rowRefs.current[seat];
      if (el) el.style.transform = "";
    });

    const next: Record<string, number> = {};
    order.forEach((seat) => {
      next[seat] = rowRefs.current[seat]?.getBoundingClientRect().top ?? 0;
    });

    const orderKey = order.join(",");
    const changed = prevOrder.current !== null && prevOrder.current !== orderKey;
    prevOrder.current = orderKey;

    if (changed) {
      const prev = prevTop.current;
      for (const seat of order) {
        const el = rowRefs.current[seat];
        const prevVal = prev[seat];
        const nextVal = next[seat];
        if (!el || prevVal == null || nextVal == null) continue;
        const delta = prevVal - nextVal;
        if (Math.abs(delta) > 0.5) {
          el.style.transition = "none";
          el.style.transform = `translateY(${delta}px)`;
          void el.offsetHeight;
          el.style.transition = "transform 400ms ease";
          el.style.transform = "translateY(0px)";
        }
      }
    }

    prevTop.current = next;
  }, [order]);

  return (
    <div className="rounded-xl border-2 border-gold/30 bg-surface/80 px-[8.82px] py-[6.3px] shadow-md shadow-black/30 sm:px-[12.6px] sm:py-[9px]">
      <p className="mb-[2.52px] text-center text-[10.08px] uppercase tracking-[0.18em] text-gold sm:mb-[3.6px] sm:text-[14.4px]">Scoreboard</p>
      <div className="space-y-[2.52px] sm:space-y-[3.6px]">
        {order.map((seat) => (
          <div
            key={seat}
            ref={(el) => {
              rowRefs.current[seat] = el;
            }}
            className="flex items-center justify-between gap-[15.12px] text-[11.34px] sm:gap-[21.6px] sm:text-[16.2px]"
          >
            <span className="scoreboard-text text-ivory/80">{names[seat]}</span>
            <span className="scoreboard-text font-display font-bold text-gold">{points[seat] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A small computer badge shown in place of a flag for computer opponents. */
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
  hideLastTrick = false,
  crying = false,
  flag = null,
  isBot = false,
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
  hideLastTrick?: boolean;
  crying?: boolean;
  flag?: string | null;
  isBot?: boolean;
}) {
  const badge = isBot ? (
    <ComputerIcon className="size-3.5" />
  ) : (
    <PlayerFlag flag={flag} className="size-3.5" />
  );

  const identity = (
    <div className="flex flex-col items-center gap-1">
      <SeatAvatar avatar={avatar} name={name} isTurn={isTurn} crying={crying} />
      <div className="flex items-center gap-1">
        <p className="font-display text-sm font-bold">{name}</p>
        {badge}
      </div>
      <div ref={trickRef} className="flex items-center gap-1.5">
        <TrickPile tricks={tricks} horizontal={side === "top"} hideLastTrick={hideLastTrick} />
      </div>
    </div>
  );

  const rotation = side === "left" ? "rotate-90" : "-rotate-90";
  const verticalFan =
    hand.length > 0 ? (
      <div className="flex flex-col items-center">
        {hand.map((card, i) => {
          const selected = selectedIds.includes(card.id);
          const base = `${rotation} ${i > 0 ? "-mt-[41px] sm:-mt-[107.4px]" : ""}`;
          const offset = selected
            ? `${side === "left" ? "translate-x-2" : "-translate-x-2"} ring-2 ring-gold`
            : "";
          return <CardBack key={card.id} className={`h-[49px] w-[38px] sm:h-[117px] sm:w-[90px] ${base} ${offset}`} />;
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
              className={`h-[49px] w-[38px] sm:h-[117px] sm:w-[90px] ${i > 0 ? "-ml-[32px] sm:-ml-[82.8px]" : ""} ${offset}`}
            />
          );
        })}
      </div>
    ) : null;

  if (side === "right") {
    return (
      <div className="flex items-center gap-2">
        {/* Reserve the 13-card fan footprint so seats don't shift after dealing. */}
        <div ref={cardRef} className="flex min-h-[145px] min-w-[49px] flex-col items-center sm:min-h-[213px] sm:min-w-[117px]">
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
        <div ref={cardRef} className="flex min-h-[145px] min-w-[49px] flex-col items-center sm:min-h-[213px] sm:min-w-[117px]">
          {verticalFan}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <SeatAvatar avatar={avatar} name={name} isTurn={isTurn} crying={crying} />
        <div className="flex flex-col items-start gap-0.5">
          <div className="flex items-center gap-1">
            <p className="font-display text-sm font-bold">{name}</p>
            {badge}
          </div>
          <div ref={trickRef} className="flex items-center gap-1.5">
            <TrickPile tricks={tricks} horizontal hideLastTrick={hideLastTrick} />
          </div>
        </div>
      </div>
      <div ref={cardRef} className="flex min-h-[49px] items-end justify-center sm:min-h-[117px]">
        {horizontalFan}
      </div>
    </div>
  );
}

// A won trick rendered as a single face-down miniature card.
function MiniCard({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <img
      src={cardBackAsset}
      alt=""
      aria-hidden="true"
      className={`block h-[55px] w-[42px] rounded-[4px] object-cover shadow-sm ${className}`}
      style={style}
    />
  );
}

// The stack of tricks a seat has won, kept at the side of the player. Each trick
// is one face-down card; the cards stagger so the won count is visible at a glance.
// Seats whose hand fans horizontally (the player and Ada) overlap across the screen
// instead of stacking downward.
function TrickPile({
  tricks,
  horizontal = false,
  hideLastTrick = false,
}: {
  tricks: Card[][];
  horizontal?: boolean;
  hideLastTrick?: boolean;
}) {
  const count = hideLastTrick ? tricks.length - 1 : tricks.length;
  if (count <= 0) return null;
  return (
    <div className={horizontal ? "flex items-center" : "flex flex-col items-center"}>
      {tricks.slice(0, count).map((_, i) => (
        <MiniCard
          key={i}
          className={horizontal ? (i > 0 ? "-ml-[30px]" : "") : i > 0 ? "-mt-[42px]" : ""}
        />
      ))}
    </div>
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
      className={`relative flex shrink-0 flex-col items-center justify-center rounded-lg border bg-white shadow-md shadow-black/30 ${
        corner ? "h-[73px] w-[56px] sm:h-[97px] sm:w-[75px]" : small ? "h-[158px] w-[110px]" : "h-[202px] w-[136px] sm:h-[238px] sm:w-[158px]"
      } ${red ? "text-destructive" : "text-ink"} ${
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
          <span className="absolute left-[7.2px] top-[3.6px] font-display text-[19.44px] font-bold leading-none sm:left-2 sm:top-1 sm:text-2xl">{rank}</span>
          <span className="absolute left-[7.2px] top-[28.8px] text-[19.44px] leading-none sm:left-2 sm:top-8 sm:text-2xl">{suit}</span>
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
  const fromDeg = flight.rotateFrom === "cw" ? 90 : flight.rotateFrom === "ccw" ? -90 : 0;
  const toDeg = flight.rotate === "cw" ? 90 : flight.rotate === "ccw" ? -90 : 0;
  const scale = moved ? (flight.shrinkTo ?? 1) : 1;
  const transform = `translate(${dx}px, ${dy}px) rotate(${moved ? toDeg : fromDeg}deg) scale(${scale})`;
  const duration = flight.duration ?? FLIGHT_MS;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 transition-transform ease-out"
      style={{ left: flight.from.x, top: flight.from.y, transform, transitionDuration: `${duration}ms` }}
    >
      {flight.card ? <HeartsCard card={flight.card} corner /> : <CardBack className="h-[49px] w-[38px] sm:h-[117px] sm:w-[90px]" />}
    </div>
  );
}



