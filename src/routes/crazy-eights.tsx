import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { ADA_AVATAR, readAvatar } from "@/lib/avatars";
import { getGame } from "@/lib/games";
import { useMatch } from "@/lib/multiplayer";
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


export const Route = createFileRoute("/crazy-eights")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
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

type Seat = "human" | "cpu";
type LogEntry = { side: Seat | null; text: string };

type State = {
  phase: "play" | "suit" | "over";
  turn: Seat;
  deck: Card[];
  pile: Card[];
  wildSuit: Suit | null;
  hands: { human: Card[]; cpu: Card[] };
  log: LogEntry[];
  winner: Seat | null;
  /** True once the player has taken their one card this turn. */
  drew: boolean;
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

function freshState(random: () => number = Math.random): State {
  const deck = newDeck(random);
  const human = deck.splice(0, HAND_SIZE);
  const cpu = deck.splice(0, HAND_SIZE);
  let start = deck.shift()!;
  // Never open on a wild eight — bury it and take the next card.
  while (start.rank === WILD_RANK && deck.length) {
    deck.push(start);
    start = deck.shift()!;
  }
  return {
    phase: "play",
    turn: "human",
    deck,
    pile: [start],
    wildSuit: null,
    hands: { human, cpu },
    log: [
      {
        side: null,
        text: `Seven cards each. ${cardLabel(start)} turned up — follow the suit or the rank.`,
      },
    ],
    winner: null,
    drew: false,
  };
}

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);
const flip = (side: Seat): Seat => (side === "human" ? "cpu" : "human");

function mirror(state: State): State {
  return {
    ...state,
    hands: { human: state.hands.cpu, cpu: state.hands.human },
    turn: flip(state.turn),
    winner: state.winner ? flip(state.winner) : null,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? flip(entry.side) : null })),
  };
}

function CrazyEightsTable() {
  const game = getGame("crazy-eights");
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
  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dealt, setDealt] = useState(HAND_SIZE * 2);
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const pileRef = useRef<HTMLDivElement>(null);
  const handEls = useRef(new Map<string, HTMLButtonElement>());
  const cpuHandEls = useRef(new Map<string, HTMLElement>());
  const stateRef = useRef(state);
  stateRef.current = state;

  // Deal the hand out one card at a time whenever a new hand is turned up.
  const handKey = state.pile[0]?.id ?? "";
  useEffect(() => {
    setDealt(0);
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      setDealt(step);
      if (step >= HAND_SIZE * 2) clearInterval(timer);
    }, 140);
    return () => clearInterval(timer);
  }, [handKey]);
  const dealing = dealt < HAND_SIZE * 2;


  const isMulti = Boolean(matchId);
  const opponentName = liveOpponent ?? opponent ?? "Ada";

  // Reshuffle the opening deal once we're on the client (avoids an SSR mismatch).
  const didDeal = useRef(false);
  useEffect(() => {
    if (isMulti || didDeal.current) return;
    didDeal.current = true;
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

  const top = state.pile[state.pile.length - 1]!;
  const myHand = state.hands.human;
  const myTurn = state.turn === "human" && state.phase === "play";
  const iChooseSuit = state.phase === "suit" && state.turn === "human";

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
      drew: false,
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
    return { ...logged, turn: flip(side) };
  };

  const nominate = (current: State, side: Seat, suit: Suit): State => ({
    ...current,
    phase: "play",
    wildSuit: suit,
    turn: flip(side),
    log: note(current.log, { side, text: `call ${SUIT_NAME[suit]}.` }),
  });

  const takeCard = (current: State, side: Seat): State => {
    const { card, deck, pile } = drawOne(current.deck, current.pile);
    if (!card) {
      return {
        ...current,
        turn: flip(side),
        drew: false,
        log: note(current.log, { side, text: "cannot draw — the stock is gone. Pass." }),
      };
    }
    const hands = { ...current.hands, [side]: [...current.hands[side], card] };
    return {
      ...current,
      deck,
      pile,
      hands,
      drew: true,
      log: note(current.log, { side, text: "draw a card." }),
    };
  };

  const selectedCards = selectedIds
    .map((id) => myHand.find((card) => card.id === id))
    .filter((card): card is Card => Boolean(card));
  const leadCard = selectedCards[0] ?? null;
  const canPlaySelected = Boolean(
    leadCard && myTurn && canFollow(leadCard, top, state.wildSuit),
  );

  /** A card may join the selection if it leads legally, or matches the rank already chosen. */
  const selectable = (card: Card) => {
    if (!myTurn) return false;
    if (!leadCard) return canFollow(card, top, state.wildSuit);
    return card.rank === leadCard.rank;
  };

  const select = (card: Card) => {
    if (!selectable(card) && !selectedIds.includes(card.id)) return;
    setSelectedIds((current) =>
      current.includes(card.id)
        ? current.filter((id) => id !== card.id)
        : [...current, card.id],
    );
  };

  const playSelected = () => {
    if (!canPlaySelected) return;
    const cards = selectedCards;
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
    apply((current) => playCards(current, "human", cards));
    if (flights.length) {
      setFlying((current) => [...current, ...flights]);
      window.setTimeout(() => {
        setFlying((current) =>
          current.filter((f) => !flights.some((x) => x.key === f.key)),
        );
      }, 600);
    }
  };

  const pickSuit = (suit: Suit) => {
    if (!iChooseSuit) return;
    apply((current) => nominate(current, "human", suit));
  };

  const draw = () => {
    if (!myTurn || state.drew) return;
    setSelectedIds([]);
    apply((current) => takeCard(current, "human"));
  };

  const pass = () => {
    if (!myTurn || !state.drew) return;
    setSelectedIds([]);
    apply((current) => ({ ...current, turn: flip("human"), drew: false }));
  };

  // Ada's turn, one deliberate step at a time (solo play only).
  useEffect(() => {
    if (isMulti || dealing) return;

    if (state.turn !== "cpu" || (state.phase !== "play" && state.phase !== "suit")) return;
    const timer = setTimeout(() => {
      const current = stateRef.current;
      if (current.turn !== "cpu") return;
      const currentTop = current.pile[current.pile.length - 1]!;
      let next: State;
      let played: Card[] = [];
      if (current.phase === "suit") {
        next = nominate(current, "cpu", chooseSuit(current.hands.cpu));
      } else {
        const card = chooseCard(current.hands.cpu, currentTop, current.wildSuit);
        if (card) {
          // Ada leads with her legal card, then sheds the rest of that rank —
          // saving the suit she holds most of for last.
          const counts = new Map<Suit, number>();
          for (const c of current.hands.cpu)
            counts.set(c.suit, (counts.get(c.suit) ?? 0) + 1);
          const extras = current.hands.cpu
            .filter((c) => c.rank === card.rank && c.id !== card.id)
            .sort((a, b) => (counts.get(a.suit) ?? 0) - (counts.get(b.suit) ?? 0));
          played = [card, ...extras];
          next = playCards(current, "cpu", played);
        } else if (!current.drew) {
          next = takeCard(current, "cpu");
        } else {
          next = {
            ...current,
            turn: "human",
            drew: false,
            log: note(current.log, { side: "cpu", text: "pass." }),
          };
        }
      }

      // Fly the opponent's cards onto the up card, like the player's lay.
      if (played.length) {
        const pileRect = pileRef.current?.getBoundingClientRect();
        const flights: FlyingCard[] = [];
        if (pileRect) {
          played.forEach((card, index) => {
            const el = cpuHandEls.current.get(card.id);
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
        if (flights.length) {
          setFlying((currentFlying) => [...currentFlying, ...flights]);
          window.setTimeout(() => {
            setFlying((currentFlying) =>
              currentFlying.filter((f) => !flights.some((x) => x.key === f.key)),
            );
          }, 600);
        }
      }

      stateRef.current = next;
      setState(next);
    }, 900);
    return () => clearTimeout(timer);
  }, [
    isMulti,
    dealing,
    state.phase,
    state.turn,
    state.drew,
    state.pile.length,
    state.hands.cpu.length,
  ]);

  const canPlayNow = hasPlayable(myHand, top, state.wildSuit);

  const status = dealing
    ? "Dealing…"
    : isMulti && !match
      ? "Opening the shared table…"

      : state.winner
        ? state.winner === "human"
          ? "You shed your last card — you win"
          : `${opponentName} went out first`
        : iChooseSuit
          ? "Name the suit"
          : state.phase === "suit"
            ? `${opponentName} is naming a suit…`
            : myTurn
              ? canPlayNow
                ? "Your lay"
                : state.drew
                  ? "Nothing to lay — pass the turn"
                  : "Nothing follows — draw a card"
              : isMulti
                ? `Waiting for ${opponentName}…`
                : "Ada is thinking…";

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus={status}
      opponentDisconnected={opponentDisconnected}
      disconnectSecondsLeft={disconnectSecondsLeft}
      disconnectExpired={disconnectExpired}
      gameInProgress={state.phase !== "over" && state.pile.length > 1}
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/crazy-eights", search: { opponent: nickname, match: newMatchId } });
        reset();
      }}
      onNewGame={reset}
      rail={null}
    >
      <GameOverDialog
        open={state.phase === "over"}
        result={state.winner === "human" ? "win" : "loss"}
        playerScore={handPenalty(myHand)}
        opponentScore={handPenalty(state.hands.cpu)}
        scoreLabel="Penalty points left in hand — lowest wins"
        opponentName={opponentName}
        playerAvatar={playerAvatar}
        onPlayAgain={reset}
      />
      <div className="space-y-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold">
              {state.winner
                ? "Hand over"
                : state.turn === "human"
                  ? "Your turn"
                  : `${opponentName}'s turn`}
            </p>
            <p className="mt-1 font-display text-3xl font-bold">
              {state.wildSuit ? (
                <>
                  Suit called{" "}
                  <span className={isRed(state.wildSuit) ? "text-destructive" : "text-ivory"}>
                    {SUIT_SYMBOL[state.wildSuit]}
                  </span>
                </>
              ) : (
                `Follow ${RANK_LABEL[top.rank]} or ${SUIT_SYMBOL[top.suit]}`
              )}
            </p>
            <p className="mt-1 text-sm text-ivory/55">{status}</p>
          </div>
          {state.phase === "over" && (
            <Button variant="parlor" onClick={reset}>
              Play again
            </Button>
          )}
        </section>

        {/* Opponent's hand, face down */}
        <section>
          <div className="mb-2 flex items-center gap-3">
            <img
              src={ADA_AVATAR}
              alt=""
              aria-hidden="true"
              className="size-10 rounded-full border border-gold/40 object-cover"
            />
            <p className="text-[10px] uppercase tracking-[0.22em] text-ivory/45">
              {opponentName} — {state.hands.cpu.length} cards
            </p>
          </div>
          <div className="flex">
            {state.hands.cpu.map((card, index) => {
              const arrived = !dealing || dealt > index * 2 + 1;
              if (!arrived) return null;
              return (
                <span
                  key={card.id}
                  ref={(el) => {
                    if (el) cpuHandEls.current.set(card.id, el);
                    else cpuHandEls.current.delete(card.id);
                  }}
                  className={`-ml-6 first:ml-0 ${dealing ? "animate-deal-out" : ""}`}
                >
                  <FaceDownCard small />
                </span>
              );
            })}
          </div>
        </section>

        {/* Stock and discard */}
        <section className="rounded-2xl border border-gold/25 bg-brand/70 p-6 shadow-2xl shadow-black/40">
          <div className="flex flex-wrap items-center gap-8">
            <div className="text-center">
              <button
                type="button"
                onClick={draw}
                disabled={!myTurn || state.drew || !state.deck.length}
                aria-label="Draw a card"
                className="block transition-transform enabled:hover:-translate-y-1 disabled:opacity-60"
              >
                <FaceDownCard />
              </button>
              <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-ivory/45">
                Stock {state.deck.length}
              </p>
            </div>
            <div className="text-center" ref={pileRef}>
              <div className="relative">
                <PlayingCard card={top} />
                {state.wildSuit && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
                  >
                    <span
                      className={`grid size-12 place-items-center rounded-full border border-gold/60 bg-cream/95 font-display text-2xl shadow-lg shadow-black/40 ${
                        isRed(state.wildSuit) ? "text-destructive" : "text-brand"
                      }`}
                    >
                      {SUIT_SYMBOL[state.wildSuit]}
                    </span>
                  </span>
                )}
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-ivory/45">Up card</p>
            </div>
            {iChooseSuit && (
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-ivory/45">
                  Name a suit
                </p>
                <div className="flex gap-2">
                  {SUITS.map((suit) => (
                    <button
                      key={suit}
                      type="button"
                      onClick={() => pickSuit(suit)}
                      aria-label={SUIT_NAME[suit]}
                      className={`grid size-11 place-items-center rounded-lg border border-gold/40 bg-cream font-display text-2xl transition-transform hover:-translate-y-1 hover:border-gold ${
                        isRed(suit) ? "text-destructive" : "text-brand"
                      }`}
                    >
                      {SUIT_SYMBOL[suit]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Your hand */}
        <section>
          <div className="mb-2 flex items-center gap-3">
            <PlayerAvatar avatar={playerAvatar} onSelect={setPlayerAvatar} />
            <p className="text-[10px] uppercase tracking-[0.22em] text-ivory/45">
              Your hand — {myHand.length} cards
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {myHand.map((card, index) => {
              const arrived = !dealing || dealt > index * 2;
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
                  disabled={!legal}
                  aria-pressed={chosen}
                  aria-label={`Select ${cardLabel(card)}`}
                  className={`relative transition-transform focus:z-20 focus:outline-none ${
                    dealing ? "animate-deal-in-player" : ""
                  } ${chosen ? "z-20 -translate-y-4" : legal ? "z-10 hover:z-20 hover:-translate-y-2" : "opacity-70"}`}
                >
                  <PlayingCard card={card} highlighted={chosen} />
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {canPlaySelected && (
              <Button variant="parlor" onClick={playSelected}>
                Play {selectedCards.map(cardLabel).join(", ")}
              </Button>
            )}
            {myTurn && !canPlayNow && !state.drew && state.deck.length > 0 && (
              <Button variant="parlor" onClick={draw}>
                Draw a card
              </Button>
            )}
            {myTurn && state.drew && !canPlayNow && (
              <Button variant="parlorOutline" onClick={pass}>
                Pass the turn
              </Button>
            )}
          </div>
        </section>

      </div>
      {flying.map((flight) => (
        <FlyingCardView key={flight.key} flight={flight} />
      ))}
    </TableShell>
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
      <PlayingCard card={flight.card} />
    </div>
  );
}

function FaceDownCard({ small = false }: { small?: boolean }) {
  return (
    <img
      src={cardBackAsset}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={`block rounded-lg object-cover shadow-md shadow-black/30 ${
        small ? "h-16 w-11" : "h-24 w-16"
      }`}
    />
  );
}

function PlayingCard({
  card,
  small = false,
  highlighted = false,
}: {
  card: Card;
  small?: boolean;
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
      } ${small ? "h-[4.5rem] w-12" : "h-28 w-[4.75rem]"} ${
        red ? "text-destructive" : "text-brand"
      }`}
    >
      {/* Rank and suit, stacked in the top-left corner */}
      <span
        className={`absolute left-1.5 top-1 flex flex-col items-center font-display font-bold leading-none ${
          small ? "text-base" : "text-2xl"
        }`}
      >
        <span>{rank}</span>
        <span className={small ? "text-sm" : "text-xl"}>{suit}</span>
      </span>

      {/* Pip cluster in the lower body of the card */}
      <span
        aria-hidden
        className={`absolute bottom-1.5 right-1.5 flex w-[58%] flex-wrap-reverse justify-end gap-x-[1px] gap-y-[1px] leading-[0.85] ${
          small ? "text-[7px]" : "text-[10px]"
        }`}
      >
        {isFace ? (
          <span className={`font-display font-bold ${small ? "text-lg" : "text-2xl"}`}>{rank}</span>
        ) : (
          Array.from({ length: pips }, (_, index) => <span key={index}>{suit}</span>)
        )}
      </span>

      <span className="sr-only">{cardLabel(card)}</span>
    </span>
  );
}

