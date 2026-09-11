import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { SpeechBubble } from "@/components/parlor/SpeechBubble";
import { ADA_AVATAR, AVATAR_OPTIONS, readAvatar } from "@/lib/avatars";
import { getGame } from "@/lib/games";
import { getNickname, useMatch } from "@/lib/multiplayer";
import { useRecordMatchResult } from "@/lib/stats";
import { isStalePlayingRoom, leaveRoom, useCrazyEightsRoom } from "@/lib/crazyEightsLobby";
import { CrazyEightsLobby } from "@/components/parlor/CrazyEightsLobby";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, type Card, type Suit } from "@/lib/cribbage";
import cardBackAsset from "@/assets/card-back.png";
import {
  HAND_SIZE,
  SUITS,
  SUIT_NAME,
  WILD_RANK,
  canFollow,
  chooseCard,
  chooseSuit,
  drawOne,
  handPenalty,
  hasPlayable,
  newDeck,
} from "@/lib/crazyeights";
import { mulberry32 } from "@/lib/random";
import { useIsMobile } from "@/hooks/use-mobile";

const FLIGHT_MS = 550;
const STAGGER_MS = 400;

export const Route = createFileRoute("/crazy-eights")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
    room: typeof search["room"] === "string" ? (search["room"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Play Crazy Eights — Cards and Games" },
      {
        name: "description",
        content:
          "Match suit or rank, nominate a suit with a wild eight, and shed your hand first against Ada or a live opponent.",
      },
      { property: "og:title", content: "Play Crazy Eights — Cards and Games" },
      {
        property: "og:description",
        content: "Crazy Eights in the parlor: follow suit or rank, and let the eights run wild.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CrazyEightsTable,
});

type Seat = "you" | "ada" | "ace" | "leo";
type PlayerCount = 2 | 3 | 4;
type LogEntry = { side: Seat | null; text: string };

const SEAT_NAMES: Record<Seat, string> = {
  you: "You",
  ada: "Ada",
  ace: "Ace",
  leo: "Leo",
};

const ORDER_BY_COUNT: Record<PlayerCount, Seat[]> = {
  2: ["you", "ada"],
  3: ["you", "ace", "ada"],
  4: ["you", "ace", "ada", "leo"],
};

const ACE_AVATAR = AVATAR_OPTIONS[3]!.url;
const LEO_AVATAR = AVATAR_OPTIONS[7]!.url;

/** A player may draw up to this many cards on a turn before passing. */
const MAX_DRAWS = 3;

/** Ordinal labels for each card drawn in a turn, indexed by 1-based draw number. */
const DRAW_ORDINAL = ["", "first", "second", "third"];

type State = {
  phase: "play" | "suit" | "over";
  turn: Seat;
  order: Seat[];
  deck: Card[];
  pile: Card[];
  wildSuit: Suit | null;
  hands: Record<Seat, Card[]>;
  log: LogEntry[];
  winner: Seat | null;
  /** Monotonic id bumped on each fresh deal; keys the dealing animation. */
  dealId: number;
  /** Cards drawn so far this turn — a player may draw up to MAX_DRAWS. */
  drew: number;
};

type FlyingCard = {
  key: number;
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

// The opening deal must match the server, so the first render uses a fixed
// seed and is reshuffled once the client mounts.
const SSR_SEED = 20260829;

// Monotonic id bumped on every fresh deal. It keys the dealing animation so
// that recycling the discard pile mid-game (which changes `pile[0]`) never
// re-runs the whole dealing animation and briefly stalls the table.
let dealCounter = 0;

function freshState(count: PlayerCount = 2, random: () => number = Math.random): State {
  const deck = newDeck(random);
  const order = ORDER_BY_COUNT[count];
  const hands: Record<Seat, Card[]> = { you: [], ada: [], ace: [], leo: [] };
  for (const seat of order) hands[seat] = deck.splice(0, HAND_SIZE);
  let start = deck.shift()!;
  // Never open on a wild eight — bury it and take the next card.
  while (start.rank === WILD_RANK && deck.length) {
    deck.push(start);
    start = deck.shift()!;
  }
  return {
    phase: "play",
    turn: order[0]!,
    order,
    deck,
    pile: [start],
    wildSuit: null,
    hands,
    log: [
      {
        side: null,
        text: `${HAND_SIZE} cards each. ${cardLabel(start)} turned up — follow the suit or the rank.`,
      },
    ],
    winner: null,
    dealId: ++dealCounter,
    drew: 0,
  };
}

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);
const nextTurn = (side: Seat, order: Seat[]): Seat =>
  order[(order.indexOf(side) + 1) % order.length]!;

function mirror(state: State): State {
  const swap = (seat: Seat): Seat => (seat === "you" ? "ada" : seat === "ada" ? "you" : seat);
  return {
    ...state,
    hands: {
      you: state.hands.ada ?? [],
      ada: state.hands.you ?? [],
      ace: state.hands.ace ?? [],
      leo: state.hands.leo ?? [],
    },
    turn: swap(state.turn),
    winner: state.winner ? swap(state.winner) : null,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? swap(entry.side) : null })),
  };
}

/**
 * Rotate the seats of a game state by `shift` positions. A positive shift maps
 * a seat in the local (view) frame back to the canonical host frame; a negative
 * shift maps the canonical frame into a given player's view. Used for the live
 * 2-4 player lobby so every player sees themselves in the "you" seat.
 */
function remapState(state: State, shift: number, count: PlayerCount): State {
  const base = ORDER_BY_COUNT[count];
  const map = (seat: Seat): Seat => {
    const index = base.indexOf(seat);
    return base[(((index + shift) % count) + count) % count]!;
  };
  // Seed every seat so `hands.ace`/`hands.leo` are never `undefined` in smaller
  // games — the render reads `state.hands[seat].length` unconditionally.
  const hands = { you: [], ada: [], ace: [], leo: [] } as Record<Seat, Card[]>;
  for (const seat of base) hands[map(seat)] = state.hands[seat] ?? [];
  return {
    ...state,
    order: base.map((seat) => map(seat)),
    hands,
    turn: map(state.turn),
    winner: state.winner ? map(state.winner) : null,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? map(entry.side) : null })),
  };
}

/**
 * The room's `state` column is written over the wire and can be `null`, a stale
 * partial write, or a shape from an older build. Guard every seat remap behind
 * this check so a malformed value can never crash the table.
 */
function isValidState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<State>;
  if (
    !Array.isArray(s.order) ||
    s.order.length < 2 ||
    !Array.isArray(s.deck) ||
    !Array.isArray(s.pile) ||
    s.pile.length === 0 ||
    !Array.isArray(s.log) ||
    typeof s.turn !== "string" ||
    !s.hands ||
    typeof s.hands !== "object"
  ) {
    return false;
  }
  // The top card is rendered directly; a malformed card (e.g. from a stale or
  // partially-written room state) must never reach `PlayingCard` and crash the
  // table. Guard it here, then guard every seat's hand below.
  if (!isCard(s.pile[s.pile.length - 1])) return false;
  const hands = s.hands as Record<string, unknown>;
  for (const seat of ["you", "ada", "ace", "leo"]) {
    const hand = hands[seat];
    if (hand !== undefined && !Array.isArray(hand)) return false;
  }
  return true;
}

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<Card>;
  return typeof c.id === "string" && typeof c.rank === "number" && typeof c.suit === "string";
}

function CrazyEightsTable() {
  const game = getGame("crazy-eights");
  const navigate = useNavigate();
  const handlePlay = useCallback(
    (id: string) =>
      navigate({ to: "/crazy-eights", search: { room: id, opponent: undefined, match: undefined } }),
    [navigate],
  );
  const { opponent, match: matchId, room: roomId } = Route.useSearch();
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
  const {
    room: liveRoom,
    players: roomPlayers,
    mySeat,
    playerCount: roomPlayerCount,
    isHost: roomIsHost,
    remoteState: roomRemoteState,
    publish: publishRoom,
    loading: roomLoading,
  } = useCrazyEightsRoom(roomId);
  const [playerCount, setPlayerCount] = useState<PlayerCount>(2);
  const [state, setState] = useState<State>(() => freshState(2, mulberry32(SSR_SEED)));
  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dealt, setDealt] = useState(HAND_SIZE * 2);
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const [viewingHand, setViewingHand] = useState(false);
  const [sortDesc, setSortDesc] = useState(false);
  const [handWidth, setHandWidth] = useState(0);
  const isMobile = useIsMobile();
  const pileRef = useRef<HTMLDivElement>(null);
  const stockRef = useRef<HTMLButtonElement>(null);
  const handEls = useRef(new Map<string, HTMLButtonElement>());
  const seatHandEls = useRef(new Map<string, HTMLElement>());
  const handRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  useRecordMatchResult(match, isHost, state.winner);

  const isMulti = Boolean(matchId);
  const isRoom = Boolean(roomId);
  const isLive = isMulti || isRoom;
  const activeCount: PlayerCount = isRoom
    ? (roomPlayerCount >= 2 && roomPlayerCount <= 4 ? (roomPlayerCount as PlayerCount) : 2)
    : playerCount;

  // Deal the hand out one card at a time whenever a new hand is turned up.
  // Key on the deal id rather than `pile[0]` — recycling the discard pile would
  // otherwise change the key and replay the whole deal mid-game.
  const handKey = state.dealId ?? state.pile[0]?.id ?? "";
  useEffect(() => {
    setDealt(0);
    let step = 0;
    const total = HAND_SIZE * activeCount;
    const timer = setInterval(() => {
      step += 1;
      setDealt(step);
      if (step >= total) clearInterval(timer);
    }, 140);
    return () => clearInterval(timer);
  }, [handKey, activeCount]);
  const dealing = dealt < HAND_SIZE * activeCount;

  // Measure the hand row so cards can spread edge-to-edge on small screens.
  useEffect(() => {
    const el = handRef.current;
    if (!el) return;
    const measure = () => setHandWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const seatName = (seat: Seat): string => {
    if (!isRoom) return seat === "you" ? getNickname() ?? SEAT_NAMES[seat] : SEAT_NAMES[seat];
    const base = ORDER_BY_COUNT[activeCount];
    const viewIndex = base.indexOf(seat);
    const canonical = (mySeat + viewIndex) % activeCount;
    const player = roomPlayers.find((p) => p.seat === canonical);
    return player ? player.nickname : SEAT_NAMES[seat];
  };

  const opponentName = isRoom
    ? roomPlayers.length > 1
      ? `${roomPlayers.length - 1} live ${roomPlayers.length - 1 === 1 ? "opponent" : "opponents"}`
      : "Waiting for players"
    : isMulti
      ? (liveOpponent ?? opponent ?? "Ada")
      : playerCount === 2
        ? "Ada"
        : playerCount === 3
          ? "Ada & Ace"
          : "Ada, Ace & Leo";

  // Reshuffle the opening deal once we're on the client (avoids an SSR mismatch).
  const didDeal = useRef(false);
  useEffect(() => {
    if (isLive || didDeal.current) return;
    didDeal.current = true;
    const fresh = freshState(playerCount);
    stateRef.current = fresh;
    setState(fresh);
  }, [isLive, playerCount]);

  const apply = (fn: (current: State) => State) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (isRoom) void publishRoom(remapState(next, mySeat, activeCount));
    else if (isMulti) void publish(isHost ? next : mirror(next));
  };

  const startGame = (count: PlayerCount) => {
    if (isRoom && !roomIsHost) return;
    const n = isRoom ? activeCount : count;
    setPlayerCount(n);
    setSelectedIds([]);
    setViewingHand(false);
    const fresh = freshState(n);
    stateRef.current = fresh;
    setState(fresh);
    if (isRoom) void publishRoom(fresh);
    else if (isMulti) void publish(isHost ? fresh : mirror(fresh));
  };

  const reset = () => startGame(playerCount);

  // The host opens a fresh live table.
  useEffect(() => {
    if (!isMulti || !match || match.state || !isHost) return;
    const fresh = freshState(2);
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

  // The lobby host deals the opening hand once the room is playing.
  useEffect(() => {
    if (!isRoom || !roomIsHost || roomLoading) return;
    if (isValidState(roomRemoteState)) return;
    if (liveRoom?.status !== "playing") return;
    if (roomPlayerCount < 2) return;
    // Abandoned room: don't resurrect a deal nobody is around to receive.
    if (isStalePlayingRoom(liveRoom)) return;
    const fresh = freshState(activeCount);
    stateRef.current = fresh;
    setState(fresh);
    void publishRoom(fresh);
  }, [isRoom, roomIsHost, roomRemoteState, roomLoading, liveRoom?.status, roomPlayerCount, activeCount, publishRoom]);

  // Read the live room's canonical state into our own seat's view.
  useEffect(() => {
    if (!isRoom || !roomRemoteState || !isValidState(roomRemoteState)) return;
    const view = remapState(roomRemoteState as State, -mySeat, activeCount);
    stateRef.current = view;
    setState(view);
  }, [isRoom, roomRemoteState, mySeat, activeCount]);

  // If we land on a table whose host vanished before dealing, leave it and
  // return to the lobby so the player isn't stranded on a dead table.
  useEffect(() => {
    if (!isRoom || !roomId || roomLoading || !liveRoom) return;
    if (!isStalePlayingRoom(liveRoom)) return;
    void leaveRoom(roomId).then(() =>
      navigate({ to: "/crazy-eights", search: { room: undefined, opponent: undefined, match: undefined } }),
    );
  }, [isRoom, roomId, roomLoading, liveRoom, navigate]);

  const top = state.pile[state.pile.length - 1]!;
  const myHand = state.hands.you ?? [];
  const myTurn = state.turn === "you" && state.phase === "play";
  const iChooseSuit = state.phase === "suit" && state.turn === "you";

  /** Lay one or more cards of the same rank; the last one decides the suit going forward. */
  const playCards = (current: State, side: Seat, cards: Card[]): State => {
    if (!cards.length) return current;
    const ids = new Set(cards.map((c) => c.id));
    const hand = current.hands[side].filter((c) => !ids.has(c.id));
    const hands = { ...current.hands, [side]: hand };
    const last = cards[cards.length - 1]!;
    const logged: State = {
      ...current,
      hands,
      pile: [...current.pile, ...cards],
      wildSuit: null,
      drew: 0,
      log: note(current.log, {
        side,
        text: `lay ${cards.map(cardLabel).join(", ")}.`,
      }),
    };
    if (!hand.length) {
      return {
        ...logged,
        phase: "over",
        winner: side,
        log: note(logged.log, { side, text: "are out of cards." }),
      };
    }
    if (last.rank === WILD_RANK) {
      return { ...logged, phase: "suit" };
    }
    return { ...logged, turn: nextTurn(side, current.order) };
  };

  const nominate = (current: State, side: Seat, suit: Suit): State => ({
    ...current,
    phase: "play",
    wildSuit: suit,
    turn: nextTurn(side, current.order),
    log: note(current.log, { side, text: `call ${SUIT_NAME[suit]}.` }),
  });

  const takeCard = (current: State, side: Seat): State => {
    const { card, deck, pile } = drawOne(current.deck, current.pile);
    if (!card) {
      return {
        ...current,
        turn: nextTurn(side, current.order),
        drew: 0,
        log: note(current.log, { side, text: "cannot draw — the stock is gone. Pass." }),
      };
    }
    const hands = { ...current.hands, [side]: [...current.hands[side], card] };
    return {
      ...current,
      deck,
      pile,
      hands,
      drew: current.drew + 1,
      log: note(current.log, { side, text: "draw a card." }),
    };
  };

  const selectedCards = selectedIds
    .map((id) => myHand.find((card) => card.id === id))
    .filter((card): card is Card => Boolean(card));
  const leadCard = selectedCards[0] ?? null;
  const canPlaySelected = Boolean(leadCard && myTurn && canFollow(leadCard, top, state.wildSuit));

  /** A card may join the selection if it leads legally, or matches the rank already chosen. */
  const selectable = (card: Card) => {
    if (!myTurn) return false;
    if (!leadCard) return canFollow(card, top, state.wildSuit);
    return card.rank === leadCard.rank;
  };

  const select = (card: Card) => {
    if (!selectable(card) && !selectedIds.includes(card.id)) return;
    setSelectedIds((current) =>
      current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id],
    );
  };

  /** Reorder the player's hand by rank, toggling low-to-high / high-to-low. */
  const sortHand = () => {
    const dir = sortDesc ? -1 : 1;
    apply((current) => {
      const hand = [...current.hands.you].sort(
        (a, b) => dir * (a.rank - b.rank) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit),
      );
      return { ...current, hands: { ...current.hands, you: hand } };
    });
    setSortDesc((prev) => !prev);
  };

  /** Fly cards onto the up card one at a time, then clear them. */
  const scheduleFlights = (flights: FlyingCard[]) => {
    if (!flights.length) return;
    flights.forEach((flight, index) => {
      window.setTimeout(() => {
        setFlying((current) => [...current, flight]);
      }, index * STAGGER_MS);
    });
    window.setTimeout(() => {
      setFlying((current) => current.filter((f) => !flights.some((x) => x.key === f.key)));
    }, (flights.length - 1) * STAGGER_MS + FLIGHT_MS);
  };

  /** Animate the given cards from the hand to the pile and commit the move. */
  const playCardsNow = (cards: Card[]) => {
    const pileRect = pileRef.current?.getBoundingClientRect();
    const flights: FlyingCard[] = [];
    if (pileRect) {
      cards.forEach((card, index) => {
        const el = handEls.current.get(card.id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        flights.push({
          key: Date.now() + index,
          card,
          from: { x: rect.left, y: rect.top },
          to: { x: pileRect.left, y: pileRect.top },
        });
      });
    }
    setSelectedIds([]);
    apply((current) => playCards(current, "you", cards));
    scheduleFlights(flights);
  };

  const playSelected = () => {
    if (!canPlaySelected) return;
    playCardsNow(selectedCards);
  };

  /** Double-click a card to play it right away. */
  const playCard = (card: Card) => {
    if (!myTurn || !canFollow(card, top, state.wildSuit)) return;
    playCardsNow([card]);
  };

  const pickSuit = (suit: Suit) => {
    if (!iChooseSuit) return;
    apply((current) => nominate(current, "you", suit));
  };

  const draw = () => {
    if (!myTurn || state.drew >= MAX_DRAWS) return;
    if (hasPlayable(myHand, top, state.wildSuit)) return;
    setSelectedIds([]);

    // Fly the drawn card from the stock to its new spot in the hand.
    const stockRect = stockRef.current?.getBoundingClientRect();
    const drawn = drawOne(state.deck, state.pile).card;
    apply((current) => takeCard(current, "you"));
    if (stockRect && drawn) {
      // Wait a frame for the hand to re-render, then read the card's landing spot.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = handEls.current.get(drawn.id);
          if (!el) return;
          const rect = el.getBoundingClientRect();
          scheduleFlights([
            {
              key: Date.now(),
              card: drawn,
              from: { x: stockRect.left, y: stockRect.top },
              to: { x: rect.left, y: rect.top },
            },
          ]);
        });
      });
    }
  };

  const pass = () => {
    if (!myTurn || state.drew < MAX_DRAWS) return;
    setSelectedIds([]);
    apply((current) => ({ ...current, turn: nextTurn("you", current.order), drew: 0 }));
  };

  // Speech bubble above the active computer seat while it draws, one per card.
  const [bubble, setBubble] = useState<{ side: Seat; text: string } | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showBubble = (side: Seat, text: string, duration = 1000) => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    setBubble({ side, text });
    bubbleTimer.current = setTimeout(() => setBubble(null), duration);
  };
  useEffect(
    () => () => {
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    },
    [],
  );

  // Each computer opponent plays one deliberate step at a time (solo play only).
  useEffect(() => {
    if (isMulti || dealing) return;

    const seat = state.turn;
    if (seat === "you" || (state.phase !== "play" && state.phase !== "suit")) return;
    // In a live room the host drives any computer opponents; everyone else
    // waits for the host's published move to arrive over the wire.
    if (isRoom) {
      if (!roomIsHost) return;
      const turnIndex = ORDER_BY_COUNT[activeCount].indexOf(seat);
      const occupant = roomPlayers.find((p) => p.seat === turnIndex);
      if (!occupant?.is_bot) return;
    }
    const timer = setTimeout(() => {
      const current = stateRef.current;
      if (current.turn !== seat) return;
      const hand = current.hands[seat] ?? [];
      const currentTop = current.pile[current.pile.length - 1]!;
      let next: State;
      let played: Card[] = [];
      if (current.phase === "suit") {
        next = nominate(current, seat, chooseSuit(hand));
      } else {
        const card = chooseCard(hand, currentTop, current.wildSuit);
        if (card) {
          // Lead with a legal card, then shed the rest of that rank —
          // saving the suit held most of for last.
          const counts = new Map<Suit, number>();
          for (const c of hand) counts.set(c.suit, (counts.get(c.suit) ?? 0) + 1);
          const extras = hand
            .filter((c) => c.rank === card.rank && c.id !== card.id)
            .sort((a, b) => (counts.get(a.suit) ?? 0) - (counts.get(b.suit) ?? 0));
          played = [card, ...extras];
          next = playCards(current, seat, played);
        } else if (current.drew < MAX_DRAWS) {
          showBubble(seat, `Drawing ${DRAW_ORDINAL[current.drew + 1]} card.`);
          next = takeCard(current, seat);
        } else {
          next = {
            ...current,
            turn: nextTurn(seat, current.order),
            drew: 0,
            log: note(current.log, { side: seat, text: "pass." }),
          };
        }
      }

      // Fly the opponent's cards onto the up card, like the player's lay.
      if (played.length) {
        const pileRect = pileRef.current?.getBoundingClientRect();
        const flights: FlyingCard[] = [];
        if (pileRect) {
          played.forEach((card, index) => {
            const el = seatHandEls.current.get(card.id);
            if (!el) return;
            const rect = el.getBoundingClientRect();
            flights.push({
              key: Date.now() + index,
              card,
              from: { x: rect.left, y: rect.top },
              to: { x: pileRect.left, y: pileRect.top },
            });
          });
        }
        scheduleFlights(flights);
      }

      stateRef.current = next;
      setState(next);
      if (isRoom && roomIsHost) void publishRoom(remapState(next, mySeat, activeCount));
    }, 900);
    return () => clearTimeout(timer);
  }, [
    isRoom,
    isMulti,
    dealing,
    roomIsHost,
    roomPlayers,
    mySeat,
    activeCount,
    state.phase,
    state.turn,
    state.drew,
    state.pile.length,
    state.hands.ada.length,
    state.hands.ace.length,
    state.hands.leo.length,
  ]);

  const canPlayNow = hasPlayable(myHand, top, state.wildSuit);

  const seatAvatar = (seat: Seat): string =>
    seat === "ada"
      ? ADA_AVATAR
      : seat === "ace"
        ? ACE_AVATAR
        : seat === "leo"
          ? LEO_AVATAR
          : playerAvatar;

  const winnerName = state.winner ? seatName(state.winner) : "Ada";

  const results = state.order.map((seat) => ({
    name: seatName(seat),
    score: handPenalty(state.hands[seat] ?? []),
    avatar: seat === "you" ? playerAvatar : seatAvatar(seat),
    won: seat === state.winner,
  }));

  const seatPos = (seat: Seat): number => state.order.indexOf(seat);
  const hasAce = state.order.includes("ace");
  const hasLeo = state.order.includes("leo");

  // Overlap grows as cards are added and shrinks as cards leave. Cards that fit
  // keep a few pixels between them (never touching); otherwise they overlap to
  // fill the row. `CARD_W - 1` keeps at least 1px of every card visible.
  const CARD_W = 48;
  const MIN_GAP = 4;
  const handOverlap = (() => {
    const n = myHand.length;
    if (n <= 1 || handWidth <= 0) return 0;
    const fit = CARD_W - (handWidth - CARD_W) / (n - 1);
    return fit <= 0 ? -MIN_GAP : Math.min(CARD_W - 1, fit);
  })();

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus=""
      opponentDisconnected={opponentDisconnected}
      disconnectSecondsLeft={disconnectSecondsLeft}
      disconnectExpired={disconnectExpired}
      gameInProgress={state.phase !== "over" && state.pile.length > 1}
      hideOpponent
      waitingRoomLabel="Multiplayer"
      lobby={({ open, onOpenChange }) => (
        <CrazyEightsLobby
          game={game}
          open={open}
          onOpenChange={onOpenChange}
          onPlay={handlePlay}
        />
      )}
      onPlayerCount={startGame}
      playerCount={activeCount}
      onMatched={(nickname, newMatchId) => {
        navigate({
          to: "/crazy-eights",
          search: { opponent: nickname, match: newMatchId, room: undefined },
        });
        reset();
      }}
      onNewGame={() => startGame(2)}
      rail={null}
      containerClassName="px-1.5 sm:px-3"
    >
      <GameOverDialog
        open={state.phase === "over" && !viewingHand}
        result={state.winner === "you" ? "win" : "loss"}
        playerScore={handPenalty(myHand)}
        opponentScore={handPenalty(state.hands[state.winner ?? "ada"] ?? [])}
        scoreLabel="Penalty points left in hand — lowest wins"
        opponentName={winnerName}
        playerAvatar={playerAvatar}
        results={results}
        onPlayAgain={reset}
        footerExtra={
          <>
            <Button variant="parlorOutline" onClick={() => setViewingHand(true)}>
              View hand
            </Button>
            <Button variant="parlorOutline" onClick={() => navigate({ to: "/" })}>
              Back to game room
            </Button>
          </>
        }
      />
      <div className="space-y-4 sm:space-y-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          {state.phase === "over" && (
            <Button variant="parlor" onClick={reset}>
              Play again
            </Button>
          )}
        </section>

        {/* Opponents: Ada up top (centered); Ace and Leo flank the stock */}
        <div className="flex justify-center">
          <OpponentSeat
            name={seatName("ada")}
            avatar={ADA_AVATAR}
            cards={state.hands.ada ?? []}
            handEls={seatHandEls.current}
            active={state.turn === "ada"}
            dealing={dealing}
            dealt={dealt}
            playerCount={activeCount}
            seatIndex={seatPos("ada")}
            bubble={bubble?.side === "ada" ? bubble.text : null}
          />
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center justify-items-center gap-3">
          <div className="flex items-center">
            {hasAce ? (
              <OpponentSeat
                name={seatName("ace")}
                avatar={ACE_AVATAR}
                cards={state.hands.ace ?? []}
                handEls={seatHandEls.current}
                vertical
                rotation={isMobile ? "" : "-rotate-90"}
                active={state.turn === "ace"}
                dealing={dealing}
                dealt={dealt}
                playerCount={activeCount}
                seatIndex={seatPos("ace")}
                bubble={bubble?.side === "ace" ? bubble.text : null}
              />
            ) : null}
          </div>

          {/* Stock and discard */}
          <section className="relative justify-self-center">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <div className="text-center">
                <button
                  type="button"
                  onClick={draw}
                  disabled={!myTurn || state.drew >= MAX_DRAWS || !state.deck.length || canPlayNow}
                  aria-label="Draw a card"
                  ref={stockRef}
                  className="block transition-transform enabled:hover:-translate-y-1 disabled:opacity-60"
                >
                  <FaceDownCard small />
                </button>
              </div>
              <div className="text-center" ref={pileRef}>
                <div className="relative">
                  <PlayingCard card={top} tiny />
                  {state.wildSuit && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
                    >
                      <span
                        className={`grid size-7 place-items-center rounded-full border border-gold/60 bg-cream/95 font-display text-base shadow-lg shadow-black/40 ${
                          isRed(state.wildSuit) ? "text-destructive" : "text-brand"
                        }`}
                      >
                        {SUIT_SYMBOL[state.wildSuit]}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            {iChooseSuit && (
              <div
                role="dialog"
                aria-label="Name a suit"
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-brand/95 p-3"
              >
                <p className="text-[10px] uppercase tracking-[0.2em] text-gold">Name a suit</p>
                <div className="flex gap-1.5">
                  {SUITS.map((suit) => (
                    <button
                      key={suit}
                      type="button"
                      onClick={() => pickSuit(suit)}
                      aria-label={SUIT_NAME[suit]}
                      className={`grid size-7 place-items-center rounded-md border border-gold/40 bg-cream font-display text-base transition-transform hover:-translate-y-0.5 hover:border-gold ${
                        isRed(suit) ? "text-destructive" : "text-brand"
                      }`}
                    >
                      {SUIT_SYMBOL[suit]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="flex items-center">
            {hasLeo ? (
              <OpponentSeat
                name={seatName("leo")}
                avatar={LEO_AVATAR}
                cards={state.hands.leo ?? []}
                handEls={seatHandEls.current}
                vertical
                rotation={isMobile ? "" : "rotate-90"}
                avatarSide="right"
                active={state.turn === "leo"}
                dealing={dealing}
                dealt={dealt}
                playerCount={activeCount}
                seatIndex={seatPos("leo")}
                bubble={bubble?.side === "leo" ? bubble.text : null}
              />
            ) : null}
          </div>
        </div>

        {/* Your hand */}
        <section>
          <div className="mb-2 flex items-center justify-center gap-3">
            <PlayerAvatar avatar={playerAvatar} onSelect={setPlayerAvatar} />
            <p className="text-[10px] uppercase tracking-[0.22em] text-ivory/45">
              Your hand
            </p>
          </div>
          <div ref={handRef} className="flex items-end justify-center">
            {myHand.map((card, index) => {
              const arrived = !dealing || dealt > index * playerCount;
              if (!arrived) return null;
              const chosen = selectedIds.includes(card.id);
              const legal = chosen || selectable(card);
              return (
                <button
                  key={card.id}
                  type="button"
                  ref={(el) => {
                    if (el) handEls.current.set(card.id, el);
                    else handEls.current.delete(card.id);
                  }}
                  onClick={() => select(card)}
                  onDoubleClick={() => playCard(card)}
                  disabled={!legal}
                  aria-pressed={chosen}
                  aria-label={`Select ${cardLabel(card)}`}
                  style={index > 0 ? { marginLeft: -handOverlap } : undefined}
                  className={`relative transition-transform focus:z-20 focus:outline-none ${
                    dealing ? "animate-deal-in-player" : ""
                  } ${chosen ? "z-20 -translate-y-4" : legal ? "hover:z-20 hover:-translate-y-2" : "opacity-50"}`}
                >
                  <PlayingCard card={card} small highlighted={chosen} />
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex min-h-9 flex-wrap items-center gap-3">
            {canPlaySelected && (
              <Button variant="parlor" onClick={playSelected}>
                Play {selectedCards.map(cardLabel).join(", ")}
              </Button>
            )}
            {myTurn && !canPlaySelected && !canPlayNow && state.drew < MAX_DRAWS && state.deck.length > 0 && (
              <Button variant="parlor" onClick={draw}>
                Draw a card
              </Button>
            )}
            {myTurn && state.drew >= MAX_DRAWS && !canPlayNow && (
              <Button variant="parlorOutline" onClick={pass}>
                Pass the turn
              </Button>
            )}
            <Button
              variant="parlorOutline"
              onClick={sortHand}
              disabled={!myHand.length}
              aria-label="Sort your hand"
              className="ml-auto"
            >
              Sort
            </Button>
          </div>
        </section>
      </div>
      {flying.map((flight) => (
        <FlyingCardView key={flight.key} flight={flight} />
      ))}
    </TableShell>
  );
}

function OpponentSeat({
  name,
  avatar,
  cards,
  handEls,
  vertical = false,
  rotation = "",
  active = false,
  dealing = false,
  dealt = 0,
  playerCount = 2,
  seatIndex = 1,
  avatarSide = "left",
  bubble,
}: {
  name: string;
  avatar: string;
  cards: Card[];
  handEls: Map<string, HTMLElement>;
  vertical?: boolean;
  rotation?: string;
  active?: boolean;
  dealing?: boolean;
  dealt?: number;
  playerCount?: number;
  seatIndex?: number;
  avatarSide?: "left" | "right";
  bubble?: string | null;
}) {
  return (
    <div className={vertical ? `flex items-center gap-4 ${avatarSide === "right" ? "flex-row-reverse" : ""}` : ""}>
      <div className={`flex items-center gap-3 ${vertical ? "flex-col gap-1" : "mb-2 justify-center"}`}>
        <div className="relative">
          <img
            src={avatar}
            alt=""
            aria-hidden="true"
            className={`rounded-full border object-cover ${
              vertical ? "size-12" : "size-10"
            } ${active ? "border-gold ring-2 ring-gold/40" : "border-gold/40"}`}
          />
          {bubble && (
            <div
              className={`absolute bottom-full z-10 mb-2 ${
                avatarSide === "right" ? "right-full mr-2" : "left-full ml-2"
              }`}
            >
              <SpeechBubble
                text={bubble}
                tail={avatarSide === "right" ? "down-right" : "down-left"}
              />
            </div>
          )}
        </div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-ivory/45">
          {name}
        </p>
      </div>
      {/* Reserve vertical space for up to 10 stacked cards (h-16 minus -mt-11
          overlap = 20px each, so 64 + 9*20 = 244px) so the side seats don't
          make the screen grow deeper card-by-card while dealing. */}
      <div className={vertical ? "flex min-h-[244px] flex-col items-center" : "flex"}>
        {cards.map((card, index) => {
          const arrived = !dealing || dealt > index * playerCount + seatIndex;
          if (!arrived) return null;
          return (
            <span
              key={card.id}
              ref={(el) => {
                if (el) handEls.set(card.id, el);
                else handEls.delete(card.id);
              }}
              className={`${vertical ? "-mt-11 first:mt-0" : "-ml-6 first:ml-0"} ${
                dealing ? "animate-deal-out" : ""
              }`}
            >
              <FaceDownCard small className={rotation} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

const isRed = (suit: Suit) => suit === "H" || suit === "D";

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
      style={{
        left: flight.from.x,
        top: flight.from.y,
        transform: `translate(${dx}px, ${dy}px)`,
      }}
    >
      <PlayingCard card={flight.card} small />
    </div>
  );
}

function FaceDownCard({
  small = false,
  className = "",
}: {
  small?: boolean;
  className?: string;
}) {
  return (
    <img
      src={cardBackAsset}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={`block rounded-lg object-cover shadow-md shadow-black/30 ${
        small ? "h-16 w-11" : "h-24 w-16"
      } ${className}`}
    />
  );
}

function PlayingCard({
  card,
  small = false,
  tiny = false,
  highlighted = false,
}: {
  card: Card;
  small?: boolean;
  tiny?: boolean;
  highlighted?: boolean;
}) {
  const red = isRed(card.suit);
  const rank = RANK_LABEL[card.rank];
  const suit = SUIT_SYMBOL[card.suit];
  const isFace = card.rank > 10;
  const pips = isFace || card.rank === 1 ? 1 : card.rank;
  return (
    <span
      className={`relative block overflow-hidden rounded-lg bg-white shadow-md shadow-black/30 ${
        highlighted ? "border-2 border-gold" : "border border-black/15"
      } ${tiny ? "h-16 w-11" : small ? "h-[4.5rem] w-12" : "h-28 w-[4.75rem]"} ${
        red ? "text-destructive" : "text-brand"
      }`}
    >
      {/* Rank and suit, stacked in the top-left corner */}
      <span
        className={`absolute left-1.5 top-1 flex flex-col items-center font-display font-bold leading-none ${
          small || tiny ? "text-base" : "text-2xl"
        }`}
      >
        <span>{rank}</span>
        <span className={small || tiny ? "text-sm" : "text-xl"}>{suit}</span>
      </span>

      {/* Pip cluster in the lower body of the card */}
      <span
        aria-hidden
        className={`absolute bottom-1.5 right-1.5 flex w-[58%] flex-wrap-reverse justify-end gap-x-[1px] gap-y-[1px] leading-[0.85] ${
          small || tiny ? "text-[7px]" : "text-[10px]"
        }`}
      >
        {isFace ? (
          <span className={`font-display font-bold ${small || tiny ? "text-lg" : "text-2xl"}`}>{rank}</span>
        ) : (
          Array.from({ length: pips }, (_, index) => <span key={index}>{suit}</span>)
        )}
      </span>

      <span className="sr-only">{cardLabel(card)}</span>
    </span>
  );
}
