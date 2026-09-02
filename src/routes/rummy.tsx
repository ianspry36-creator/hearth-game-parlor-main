import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { CHARLOTTE_AVATAR, readAvatar } from "@/lib/avatars";
import { getGame } from "@/lib/games";
import { useMatch } from "@/lib/multiplayer";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, cardValue, shuffle, type Card, type Suit } from "@/lib/cribbage";
import cardBackAsset from "@/assets/card-back.png";
import {
  HAND_SIZE,
  WIN_SCORE,
  KNOCK_LIMIT,
  GIN_BONUS,
  UNDERCUT_BONUS,
  bestMelds,
  canKnock,
  chooseDiscard,
  chooseKnockCard,
  deadwoodPoints,
  layOffResult,
  newDeck,
  shouldTakeDiscard,
} from "@/lib/rummy";
import { mulberry32 } from "@/lib/random";

// Extra deal ticks kept past the last card so the final fly-in/fly-out
// animation (deal-out runs 0.55s) completes before dealing flips false.
const DEAL_TAIL = 5;

export const Route = createFileRoute("/rummy")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Play Gin Rummy — Love Card Games" },
      {
        name: "description",
        content:
          "Meld your runs and sets, shed the deadwood, and knock for gin before Charlotte or a live opponent.",
      },
      { property: "og:title", content: "Play Gin Rummy — Love Card Games" },
      {
        property: "og:description",
        content: "Gin Rummy in the parlor: draw, discard, meld, and knock for gin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RummyTable,
});

type Seat = "human" | "cpu";
type Phase = "draw" | "discard" | "reveal" | "over";
type LogEntry = { side: Seat | null; text: string };

type RevealBlock = { melds: Card[][]; deadwood: Card[]; laidOff: Card[]; points: number };
type RoundResult = { winner: Seat; points: number; gin: boolean; undercut: boolean };

type State = {
  phase: Phase;
  turn: Seat;
  firstTurn: Seat;
  deck: Card[];
  discard: Card[];
  hands: { human: Card[]; cpu: Card[] };
  drew: Card | null;
  drewFromDiscard: boolean;
  scores: { human: number; cpu: number };
  knocker: Seat | null;
  reveal: { human: RevealBlock; cpu: RevealBlock } | null;
  round: RoundResult | null;
  log: LogEntry[];
  winner: Seat | null;
};

// The opening deal must match the server, so the first render uses a fixed
// seed and is reshuffled once the client mounts.
const SSR_SEED = 20260830;

function dealRound(scores: { human: number; cpu: number }, firstTurn: Seat, random: () => number = Math.random): State {
  const deck = newDeck(random);
  const human = deck.splice(0, HAND_SIZE);
  const cpu = deck.splice(0, HAND_SIZE);
  const up = deck.shift()!;
  return {
    phase: "draw",
    turn: firstTurn,
    firstTurn,
    deck,
    discard: [up],
    hands: { human, cpu },
    drew: null,
    drewFromDiscard: false,
    scores,
    knocker: null,
    reveal: null,
    round: null,
    log: [
      {
        side: null,
        text: `Ten cards each. ${cardLabel(up)} turned up — draw, then discard, and knock when your deadwood is ten or fewer.`,
      },
    ],
    winner: null,
  };
}

const freshState = (random: () => number = Math.random) => dealRound({ human: 0, cpu: 0 }, "human", random);

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);
const flip = (side: Seat): Seat => (side === "human" ? "cpu" : "human");

function mirror(state: State): State {
  return {
    ...state,
    hands: { human: state.hands.cpu, cpu: state.hands.human },
    turn: flip(state.turn),
    firstTurn: flip(state.firstTurn),
    winner: state.winner ? flip(state.winner) : null,
    knocker: state.knocker ? flip(state.knocker) : null,
    reveal: state.reveal ? { human: state.reveal.cpu, cpu: state.reveal.human } : null,
    round: state.round ? { ...state.round, winner: flip(state.round.winner) } : null,
    log: state.log.map((entry) => ({ ...entry, side: entry.side ? flip(entry.side) : null })),
  };
}

/** Draw from the stock or take the top discard, moving the player into the discard phase. */
function draw(current: State, side: Seat, fromDiscard: boolean): State {
  let deck = current.deck;
  let discard = current.discard;
  let card: Card;

  if (fromDiscard) {
    card = discard[discard.length - 1]!;
    discard = discard.slice(0, -1);
  } else {
    // Recycle the discard pile beneath the top card when the stock runs dry.
    if (!deck.length && discard.length > 1) {
      deck = shuffle(discard.slice(0, -1));
      discard = [discard[discard.length - 1]!];
    }
    if (!deck.length) {
      // A rare stalemate — deal a fresh hand with no points scored.
      return dealRound(current.scores, flip(current.firstTurn));
    }
    card = deck[0]!;
    deck = deck.slice(1);
  }

  return {
    ...current,
    phase: "discard",
    deck,
    discard,
    hands: { ...current.hands, [side]: [...current.hands[side], card] },
    drew: card,
    drewFromDiscard: fromDiscard,
    log: note(current.log, {
      side,
      text: fromDiscard ? `take ${cardLabel(card)} from the discard.` : "draw from the stock.",
    }),
  };
}

/** Lay one card onto the discard pile and pass the turn. */
function discard(current: State, side: Seat, card: Card): State {
  return {
    ...current,
    hands: { ...current.hands, [side]: current.hands[side].filter((other) => other.id !== card.id) },
    discard: [...current.discard, card],
    drew: null,
    drewFromDiscard: false,
    turn: flip(side),
    log: note(current.log, { side, text: `discard ${cardLabel(card)}.` }),
  };
}

/** Lay a card face down to knock and end the hand. */
function knock(current: State, side: Seat, knockCard: Card): State {
  const base: State = {
    ...current,
    hands: { ...current.hands, [side]: current.hands[side].filter((other) => other.id !== knockCard.id) },
    discard: [...current.discard, knockCard],
    drew: null,
    drewFromDiscard: false,
    knocker: side,
    log: note(current.log, { side, text: `knock, laying ${cardLabel(knockCard)} face down.` }),
  };
  return reveal(base);
}

/** Show both hands, lay off the defender's deadwood, and settle the score. */
function reveal(current: State): State {
  const knocker = current.knocker!;
  const defender = flip(knocker);
  const knockHand = current.hands[knocker];
  const defendHand = current.hands[defender];

  const knockMelds = bestMelds(knockHand);
  const knockDead = knockMelds.deadwood.reduce((sum, card) => sum + cardValue(card), 0);
  const gin = knockDead === 0;

  const layOff = layOffResult(defendHand, knockMelds.melds);
  const defendMelds = bestMelds(layOff.remaining);
  const defendDead = defendMelds.deadwood.reduce((sum, card) => sum + cardValue(card), 0);

  let handWinner: Seat;
  let undercut = false;
  let gain: number;
  if (defendDead <= knockDead) {
    undercut = true;
    handWinner = defender;
    gain = UNDERCUT_BONUS + (knockDead - defendDead);
  } else {
    handWinner = knocker;
    gain = defendDead - knockDead + (gin ? GIN_BONUS : 0);
  }

  const scores = {
    human: current.scores.human + (handWinner === "human" ? gain : 0),
    cpu: current.scores.cpu + (handWinner === "cpu" ? gain : 0),
  };

  const knockerBlock: RevealBlock = { melds: knockMelds.melds, deadwood: knockMelds.deadwood, laidOff: [], points: knockDead };
  const defenderBlock: RevealBlock = {
    melds: defendMelds.melds,
    deadwood: defendMelds.deadwood,
    laidOff: layOff.laidOff,
    points: defendDead,
  };

  const over = scores.human >= WIN_SCORE || scores.cpu >= WIN_SCORE;

  return {
    ...current,
    phase: over ? "over" : "reveal",
    scores,
    reveal: knocker === "human" ? { human: knockerBlock, cpu: defenderBlock } : { human: defenderBlock, cpu: knockerBlock },
    round: { winner: handWinner, points: gain, gin, undercut },
    winner: over ? handWinner : null,
    log: note(current.log, {
      side: null,
      text: over
        ? `${handWinner === "human" ? "You" : "Charlotte"} ${gin ? "gin" : undercut ? "undercut" : "win"} the hand by ${gain} — the table is won.`
        : `${handWinner === "human" ? "You" : "Charlotte"} ${gin ? "gin" : undercut ? "undercut" : "win"} the hand by ${gain}.`,
    }),
  };
}

/** Deal the next hand of the match, alternating who draws first. */
function nextHand(current: State): State {
  return dealRound(current.scores, flip(current.firstTurn));
}

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
/** Sort by suit then rank so runs sit together and read naturally. */
const sortHand = (cards: Card[]) =>
  [...cards].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || a.rank - b.rank);
/** Sort by rank then suit so sets of matching ranks sit together. */
const sortHandByRank = (cards: Card[]) =>
  [...cards].sort((a, b) => a.rank - b.rank || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]);

function RummyTable() {
  const game = getGame("rummy");
  const navigate = useNavigate();
  const { opponent, match: matchId } = Route.useSearch();
  const {
    match,
    isHost,
    opponentName: liveOpponent,
    remoteState,
    publish,
  } = useMatch<State>(matchId);
  const [state, setState] = useState<State>(() => freshState(mulberry32(SSR_SEED)));
  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortByRank, setSortByRank] = useState(false);
  const [dealt, setDealt] = useState(HAND_SIZE * 2);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Deal the hand out one card at a time whenever a new hand is turned up.
  const handKey = state.discard[0]?.id ?? "";
  useEffect(() => {
    setDealt(0);
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      setDealt(step);
      // Keep dealing true a few extra steps so the final card's fly-in/fly-out
      // animation (0.55s) finishes instead of snapping into the overlapped fan.
      if (step >= HAND_SIZE * 2 + DEAL_TAIL) clearInterval(timer);
    }, 130);
    return () => clearInterval(timer);
  }, [handKey]);
  const dealing = dealt < HAND_SIZE * 2 + DEAL_TAIL;

  const isMulti = Boolean(matchId);
  const opponentName = liveOpponent ?? opponent ?? "Charlotte";

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
    setSelectedId(null);
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

  const top = state.discard[state.discard.length - 1] ?? null;
  const myHand = sortByRank ? sortHandByRank(state.hands.human) : sortHand(state.hands.human);
  const inDraw = state.phase === "draw" && state.turn === "human";
  const inDiscard = state.phase === "discard" && state.turn === "human";

  const selectedCard = selectedId ? myHand.find((card) => card.id === selectedId) ?? null : null;
  const afterDiscardDeadwood = selectedCard
    ? deadwoodPoints(myHand.filter((card) => card.id !== selectedCard.id))
    : null;
  const canKnockNow = selectedCard ? canKnock(myHand, selectedCard) : false;
  const wouldGin = selectedCard ? afterDiscardDeadwood === 0 : false;

  const myMelds = bestMelds(myHand);
  const myDeadwood = myMelds.deadwood.reduce((sum, card) => sum + cardValue(card), 0);

  const select = (card: Card) => {
    if (!inDiscard) return;
    setSelectedId((current) => (current === card.id ? null : card.id));
  };

  const drawStock = () => {
    if (!inDraw) return;
    setSelectedId(null);
    apply((current) => draw(current, "human", false));
  };

  const takeDiscard = () => {
    if (!inDraw || !top) return;
    setSelectedId(null);
    apply((current) => draw(current, "human", true));
  };

  const doDiscard = () => {
    if (!inDiscard || !selectedCard) return;
    setSelectedId(null);
    apply((current) => discard(current, "human", selectedCard));
  };

  const doKnock = () => {
    if (!inDiscard || !selectedCard || !canKnockNow) return;
    setSelectedId(null);
    apply((current) => knock(current, "human", selectedCard));
  };

  const startNextHand = () => {
    if (state.phase !== "reveal") return;
    setSelectedId(null);
    apply(nextHand);
  };

  // Charlotte's turn, one deliberate step at a time (solo play only).
  useEffect(() => {
    if (isMulti || dealing) return;
    if (state.turn !== "cpu" || (state.phase !== "draw" && state.phase !== "discard")) return;

    const timer = setTimeout(() => {
      setState((current) => {
        if (current.turn !== "cpu") return current;
        let next: State;
        if (current.phase === "draw") {
          const topCard = current.discard[current.discard.length - 1] ?? null;
          next = draw(current, "cpu", shouldTakeDiscard(current.hands.cpu, topCard));
        } else {
          const knockCard = chooseKnockCard(current.hands.cpu);
          next = knockCard ? knock(current, "cpu", knockCard) : discard(current, "cpu", chooseDiscard(current.hands.cpu));
        }
        stateRef.current = next;
        return next;
      });
    }, 950);
    return () => clearTimeout(timer);
  }, [isMulti, dealing, state.phase, state.turn, state.hands.cpu.length, state.deck.length, state.discard.length]);

  const logLine = (entry: LogEntry) =>
    entry.side === null
      ? entry.text
      : entry.side === "human"
        ? `You ${entry.text}`
        : `${opponentName} ${entry.text}`;

  const status = dealing
    ? "Dealing…"
    : isMulti && !match
      ? "Opening the shared table…"
      : state.winner
        ? state.winner === "human"
          ? "You reached one hundred — you win"
          : `${opponentName} reached one hundred first`
        : state.phase === "reveal"
          ? "Hand settled — deal the next"
          : state.phase === "over"
            ? "The table is won"
            : inDraw
              ? "Your draw — stock or discard"
              : inDiscard
                ? afterDiscardDeadwood !== null
                  ? `Discard, or knock (deadwood ${afterDiscardDeadwood})`
                  : "Choose a card to discard or knock"
                : isMulti
                  ? `Waiting for ${opponentName}…`
                  : "Charlotte is thinking…";

  const revealHuman = state.reveal?.human ?? null;
  const revealCpu = state.reveal?.cpu ?? null;

  return (
    <TableShell
      game={game}
      opponentName={opponentName}
      opponentStatus={status}
      gameInProgress={state.phase === "draw" || state.phase === "discard"}
      onMatched={(nickname, newMatchId) => {
        navigate({ to: "/rummy", search: { opponent: nickname, match: newMatchId } });
        reset();
      }}
      onNewGame={reset}
      rail={
        <>
          <div className="rounded-xl border border-gold/15 bg-brand/50 p-5">
            <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-ivory/60">The match</p>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ivory/70">You</span>
                <span className="font-display text-2xl text-gold">{state.scores.human}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ivory/70">{opponentName}</span>
                <span className="font-display text-2xl text-ivory">{state.scores.cpu}</span>
              </div>
              <p className="border-t border-gold/10 pt-3 text-xs text-ivory/45">
                First to {WIN_SCORE} · your deadwood {myDeadwood}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-gold/15 bg-brand/40 p-5">
            <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-ivory/60">Table talk</p>
            <ul className="space-y-1.5 text-xs leading-relaxed text-ivory/65">
              {state.log.slice(0, 7).map((entry, index) => (
                <li key={`${entry.text}-${index}`}>{logLine(entry)}</li>
              ))}
            </ul>
          </div>
        </>
      }
    >
      <GameOverDialog
        open={state.phase === "over"}
        result={state.winner === "human" ? "win" : "loss"}
        playerScore={state.scores.human}
        opponentScore={state.scores.cpu}
        scoreLabel={`First to ${WIN_SCORE} points wins the table`}
        opponentName={opponentName}
        playerAvatar={playerAvatar}
        onPlayAgain={reset}
      />

      <div className="space-y-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold">
              {state.phase === "reveal" || state.phase === "over"
                ? "Hand shown"
                : state.turn === "human"
                  ? "Your turn"
                  : `${opponentName}'s turn`}
            </p>
            <p className="mt-1 font-display text-3xl font-bold">
              {state.knocker
                ? `${state.knocker === "human" ? "You" : opponentName} knocked`
                : state.phase === "draw"
                  ? "Draw a card"
                  : "Discard or knock"}
            </p>
            <p className="mt-1 text-sm text-ivory/55">{status}</p>
          </div>
        </section>

        {/* Opponent's hand, face down */}
        <section>
          <div className="mb-2 flex items-center gap-3">
            <img
              src={CHARLOTTE_AVATAR}
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
                onClick={drawStock}
                disabled={!inDraw}
                aria-label="Draw from the stock"
                className="block transition-transform enabled:hover:-translate-y-1 disabled:opacity-60"
              >
                <FaceDownCard />
              </button>
              <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-ivory/45">
                Stock {state.deck.length}
              </p>
            </div>
            <div className="text-center">
              {top ? (
                <PlayingCard card={top} />
              ) : (
                <div className="grid h-28 w-[4.75rem] place-items-center rounded-lg border border-dashed border-gold/30 text-ivory/40">
                  —
                </div>
              )}
              <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-ivory/45">Discard</p>
            </div>
            <div className="flex flex-col gap-2">
              {inDraw && (
                <>
                  <Button variant="parlor" onClick={takeDiscard} disabled={!top}>
                    Take {top ? cardLabel(top) : "discard"}
                  </Button>
                  <Button variant="parlorOutline" onClick={drawStock} disabled={!state.deck.length}>
                    Draw from stock
                  </Button>
                </>
              )}
              {inDiscard && (
                <>
                  <Button variant="parlor" onClick={doDiscard} disabled={!selectedCard}>
                    Discard {selectedCard ? cardLabel(selectedCard) : "a card"}
                  </Button>
                  <Button
                    variant={wouldGin ? "parlor" : "parlorOutline"}
                    onClick={doKnock}
                    disabled={!canKnockNow}
                    title={
                      canKnockNow
                        ? wouldGin
                          ? "Gin — no deadwood!"
                          : `Knock with ${afterDiscardDeadwood} points of deadwood`
                        : `Knock needs ${KNOCK_LIMIT} or fewer points of deadwood`
                    }
                  >
                    {wouldGin ? "Gin!" : "Knock"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Reveal panel */}
        {state.phase === "reveal" && state.reveal && (
          <section className="rounded-2xl border border-gold/30 bg-brand/70 p-6">
            <p className="mb-4 text-center font-display text-2xl font-bold">
              {state.round?.gin
                ? "Gin!"
                : state.round?.undercut
                  ? "Undercut!"
                  : `${state.round?.winner === "human" ? "You" : opponentName} win the hand`}{" "}
              <span className="text-gold">+{state.round?.points}</span>
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <RevealRow label="Your hand" block={revealHuman} />
              <RevealRow label={`${opponentName}'s hand`} block={revealCpu} />
            </div>
            <div className="mt-6 text-center">
              <Button variant="parlor" onClick={startNextHand}>
                Next hand
              </Button>
            </div>
          </section>
        )}

        {/* Your hand */}
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <PlayerAvatar avatar={playerAvatar} onSelect={setPlayerAvatar} />
            <p className="text-[10px] uppercase tracking-[0.22em] text-ivory/45">
              Your hand — {myHand.length} cards
            </p>
            <Button
              variant="parlorGhost"
              size="sm"
              onClick={() => setSortByRank((value) => !value)}
              aria-pressed={sortByRank}
              title={sortByRank ? "Sort by suit" : "Sort by rank"}
            >
              Sort: {sortByRank ? "Rank" : "Suit"}
            </Button>
            <p className="ml-auto text-xs text-ivory/55">
              Deadwood <span className="font-display text-gold">{myDeadwood}</span>
              {myMelds.melds.length > 0 && (
                <>
                  {" · "}
                  {myMelds.melds.map((meld) => meld.map(cardLabel).join(" ")).join("  ")}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-nowrap justify-center [&>*:not(:first-child)]:-ml-8">
            {myHand.map((card, index) => {
              const arrived = !dealing || dealt > index * 2;
              if (!arrived) return null;
              const chosen = selectedId === card.id;
              const selectable = inDiscard;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => select(card)}
                  disabled={!selectable}
                  aria-pressed={chosen}
                  aria-label={`Select ${cardLabel(card)}`}
                  className={`relative transition-transform focus:z-20 focus:outline-none ${
                    dealing ? "animate-deal-in-player" : ""
                  } ${chosen ? "z-20 -translate-y-4" : selectable ? "z-10 hover:z-20 hover:-translate-y-2" : "opacity-80"}`}
                >
                  <PlayingCard card={card} highlighted={chosen} />
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </TableShell>
  );
}

const isRed = (suit: Suit) => suit === "H" || suit === "D";

function RevealRow({ label, block }: { label: string; block: RevealBlock | null }) {
  if (!block) return null;
  return (
    <div className="rounded-xl border border-gold/20 bg-surface/40 p-4">
      <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-gold">{label}</p>
      <div className="space-y-3">
        {block.melds.map((meld, index) => (
          <MeldGroup key={index} cards={meld} />
        ))}
        {block.laidOff.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-ivory/45">Laid off</p>
            <MeldGroup cards={block.laidOff} dim />
          </div>
        )}
        {block.deadwood.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-ivory/45">
              Deadwood — {block.points}
            </p>
            <MeldGroup cards={block.deadwood} dim />
          </div>
        )}
        {block.melds.length === 0 && block.deadwood.length === 0 && (
          <p className="text-sm text-ivory/50">No cards</p>
        )}
      </div>
    </div>
  );
}

function MeldGroup({ cards, dim = false }: { cards: Card[]; dim?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${dim ? "opacity-70" : ""}`}>
      {cards.map((card) => (
        <PlayingCard key={card.id} card={card} small />
      ))}
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
      <span
        className={`absolute left-1.5 top-1 flex flex-col items-center font-display font-bold leading-none ${
          small ? "text-base" : "text-2xl"
        }`}
      >
        <span>{rank}</span>
        <span className={small ? "text-sm" : "text-xl"}>{suit}</span>
      </span>

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






