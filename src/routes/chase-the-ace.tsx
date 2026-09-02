import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableShell } from "@/components/parlor/TableShell";
import { GameOverDialog } from "@/components/parlor/GameOverDialog";
import { PlayerAvatar } from "@/components/parlor/PlayerAvatar";
import { getGame } from "@/lib/games";
import { CHARLOTTE_AVATAR, readAvatar } from "@/lib/avatars";
import { RANK_LABEL, SUIT_SYMBOL, cardLabel, freshDeck, type Card } from "@/lib/cribbage";
import { STARTING_LIVES, cardFullName, cpuShouldSwap } from "@/lib/chase-the-ace";
import { mulberry32 } from "@/lib/random";
import cardBackAsset from "@/assets/card-back.png";

export const Route = createFileRoute("/chase-the-ace")({
  validateSearch: (search: Record<string, unknown>) => ({
    opponent: typeof search["opponent"] === "string" ? (search["opponent"] as string) : undefined,
    match: typeof search["match"] === "string" ? (search["match"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Play Chase the Ace — Love Card Games" },
      {
        name: "description",
        content:
          "One card each and three lives apiece: keep your card or chase a better one, and never be caught holding the ace.",
      },
      { property: "og:title", content: "Play Chase the Ace — Love Card Games" },
      {
        property: "og:description",
        content: "Chase the Ace in the parlor: a single card, three lives, and the nerve to swap.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChaseTheAceTable,
});

type Seat = "human" | "cpu";
type LogEntry = { side: Seat | null; text: string };
type Phase = "human" | "cpu" | "reveal" | "over";

type State = {
  phase: Phase;
  deck: Card[];
  humanCard: Card | null;
  cpuCard: Card | null;
  cpuSwapped: boolean;
  lives: { human: number; cpu: number };
  round: number;
  log: LogEntry[];
  loser: Seat | null;
  winner: Seat | null;
};

// A fixed seed so the server and the first client render deal the same hand,
// avoiding a hydration mismatch before the deck is reshuffled on mount.
const SSR_SEED = 20260901;

function freshState(random: () => number = Math.random): State {
  const deck = freshDeck(random);
  const humanCard = deck.shift()!;
  const cpuCard = deck.shift()!;
  return {
    phase: "human",
    deck,
    humanCard,
    cpuCard,
    cpuSwapped: false,
    lives: { human: STARTING_LIVES, cpu: STARTING_LIVES },
    round: 1,
    log: [
      {
        side: null,
        text: "One card each — chase the ace and never be caught holding the lowest.",
      },
    ],
    loser: null,
    winner: null,
  };
}

const note = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 40);

const drawTop = (deck: Card[]): { card: Card; deck: Card[] } => {
  const [card, ...rest] = deck;
  return { card: card!, deck: rest };
};

function reveal(current: State): State {
  const human = current.humanCard!;
  const cpu = current.cpuCard!;
  if (human.rank === cpu.rank) {
    return {
      ...current,
      loser: null,
      log: note(current.log, {
        side: null,
        text: `Tie on the ${cardFullName(human)} — no one loses a life.`,
      }),
    };
  }
  const loser: Seat = human.rank < cpu.rank ? "human" : "cpu";
  const lower = loser === "human" ? human : cpu;
  const lives = { ...current.lives, [loser]: current.lives[loser] - 1 };
  const out = lives[loser] <= 0;
  return {
    ...current,
    lives,
    loser,
    winner: out ? (loser === "human" ? "cpu" : "human") : null,
    phase: out ? "over" : "reveal",
    log: note(current.log, {
      side: loser,
      text: `caught with the ${cardFullName(lower)} and loses a life.`,
    }),
  };
}

function swapHuman(current: State): State {
  const { card, deck } = drawTop(current.deck);
  return {
    ...current,
    phase: "cpu",
    deck,
    humanCard: card,
    log: note(current.log, {
      side: "human",
      text: `chases the ace and draws the ${cardFullName(card)}.`,
    }),
  };
}

function keepHuman(current: State): State {
  return {
    ...current,
    phase: "cpu",
    log: note(current.log, { side: "human", text: "keeps the card." }),
  };
}

function cpuAct(current: State): State {
  if (!current.cpuCard) return current;
  if (cpuShouldSwap(current.cpuCard)) {
    const { card, deck } = drawTop(current.deck);
    return reveal({
      ...current,
      phase: "reveal",
      deck,
      cpuCard: card,
      cpuSwapped: true,
      log: note(current.log, { side: "cpu", text: "chases the ace and swaps." }),
    });
  }
  return reveal({
    ...current,
    phase: "reveal",
    cpuSwapped: false,
    log: note(current.log, { side: "cpu", text: "keeps her card." }),
  });
}

function dealRound(current: State): State {
  let deck = current.deck;
  if (deck.length < 2) deck = freshDeck();
  const humanCard = deck[0]!;
  const cpuCard = deck[1]!;
  deck = deck.slice(2);
  return {
    ...current,
    phase: "human",
    deck,
    humanCard,
    cpuCard,
    cpuSwapped: false,
    loser: null,
    round: current.round + 1,
    log: note(current.log, {
      side: null,
      text: `Round ${current.round + 1} — deal one card each.`,
    }),
  };
}

function ChaseTheAceTable() {
  const game = getGame("chase-the-ace");
  const [state, setState] = useState<State>(() => freshState(mulberry32(SSR_SEED)));
  const [playerAvatar, setPlayerAvatar] = useState<string>(readAvatar);

  // Reshuffle on the client so every fresh table deals a new hand.
  useEffect(() => {
    setState(freshState());
  }, []);

  // Charlotte keeps or chases after a beat, then the round is revealed.
  useEffect(() => {
    if (state.phase !== "cpu") return;
    const timer = setTimeout(() => setState(cpuAct), 900);
    return () => clearTimeout(timer);
  }, [state.phase]);

  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showAvatarMessage = (text: string) => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setAvatarMessage(text);
    messageTimer.current = setTimeout(() => setAvatarMessage(null), 2200);
  };

  const [cpuMessage, setCpuMessage] = useState<string | null>(null);
  const cpuMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCpuMessage = (text: string) => {
    if (cpuMessageTimer.current) clearTimeout(cpuMessageTimer.current);
    setCpuMessage(text);
    cpuMessageTimer.current = setTimeout(() => setCpuMessage(null), 2200);
  };

  useEffect(
    () => () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
      if (cpuMessageTimer.current) clearTimeout(cpuMessageTimer.current);
    },
    [],
  );

  // Charlotte announces when she chases a fresh card.
  useEffect(() => {
    if (state.phase === "reveal" && state.cpuSwapped) showCpuMessage("Chased the ace!");
  }, [state.phase, state.cpuSwapped]);

  // The player is told when they drop a life.
  const prevHumanLives = useRef(state.lives.human);
  useEffect(() => {
    if (state.lives.human < prevHumanLives.current) showAvatarMessage("Caught with the low card!");
    prevHumanLives.current = state.lives.human;
  }, [state.lives.human]);

  const reset = () => setState(freshState());

  const revealed = state.phase === "reveal" || state.phase === "over";
  const myTurn = state.phase === "human";

  return (
    <TableShell
      game={game}
      opponentName="Charlotte"
      opponentStatus={`${state.lives.cpu} ${state.lives.cpu === 1 ? "life" : "lives"} left`}
      onMatched={() => {}}
      onNewGame={reset}
      gameInProgress={state.phase !== "over"}
      rail={
        <div className="rounded-xl border border-gold/15 bg-brand/50 p-5">
          <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-ivory/60">Table talk</p>
          <ul className="space-y-2 text-sm text-ivory/80">
            {state.log.map((entry, index) => (
              <li key={index} className="flex gap-2">
                {entry.side && (
                  <span
                    className={`shrink-0 font-display font-bold ${
                      entry.side === "human" ? "text-gold" : "text-ivory/50"
                    }`}
                  >
                    {entry.side === "human" ? "You" : "Charlotte"}
                  </span>
                )}
                <span className={entry.side ? "" : "text-ivory/55"}>{entry.text}</span>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Round {state.round}</p>
          <p className="mt-2 font-display text-lg text-ivory/80">
            Never be caught holding the lowest card.
          </p>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              <PlayerAvatar
                avatar={playerAvatar}
                onSelect={setPlayerAvatar}
                {...(state.loser === "human" && revealed ? { sad: true } : {})}
                {...(avatarMessage ? { message: avatarMessage } : {})}
              />
              <div>
                <p className="font-display text-lg font-bold">You</p>
                <Lives count={state.lives.human} max={STARTING_LIVES} />
              </div>
            </div>
            {state.humanCard ? (
              <CardView card={state.humanCard} loser={state.loser === "human" && revealed} />
            ) : (
              <FaceDownCard />
            )}
          </div>

          <div className="flex flex-col items-center gap-3 pt-8">
            <DeckPile count={state.deck.length} />
            {state.phase === "reveal" && state.loser === null && (
              <span className="rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold">
                Tie
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              <CharlotteAvatar message={cpuMessage} />
              <div>
                <p className="font-display text-lg font-bold">Charlotte</p>
                <Lives count={state.lives.cpu} max={STARTING_LIVES} />
              </div>
            </div>
            {state.cpuCard ? (
              revealed ? (
                <CardView card={state.cpuCard} loser={state.loser === "cpu" && revealed} />
              ) : (
                <FaceDownCard />
              )
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {myTurn && (
            <>
              <Button variant="parlor" onClick={() => setState(keepHuman)}>
                Keep
              </Button>
              <Button variant="parlorOutline" onClick={() => setState(swapHuman)}>
                Swap with the deck
              </Button>
            </>
          )}
          {state.phase === "cpu" && (
            <p className="text-sm text-ivory/60">Charlotte is deciding&hellip;</p>
          )}
          {state.phase === "reveal" && (
            <Button variant="parlor" onClick={() => setState(dealRound)}>
              Next round
            </Button>
          )}
        </div>
      </div>

      <GameOverDialog
        open={state.phase === "over"}
        result={state.winner === "human" ? "win" : "loss"}
        playerScore={state.lives.human}
        opponentScore={state.lives.cpu}
        scoreLabel="lives remaining"
        opponentName="Charlotte"
        playerAvatar={playerAvatar}
        headline={state.winner === "human" ? "You outlasted her!" : "Charlotte outlasted you!"}
        detail={
          state.winner === "human"
            ? "Charlotte ran out of lives first — the ace was chased clean off the table."
            : "You were caught holding the low card one time too many."
        }
        onPlayAgain={reset}
      />
    </TableShell>
  );
}

function CharlotteAvatar({ message }: { message: string | null }) {
  return (
    <div className="relative inline-block">
      <img
        src={CHARLOTTE_AVATAR}
        alt="Charlotte"
        width={64}
        height={64}
        className="size-8 rounded-full object-cover ring-1 ring-gold/40"
      />
      {message && (
        <div className="absolute bottom-full left-full z-10 mb-2 ml-2 w-max max-w-[16rem]">
          <div className="relative rounded-2xl border border-gold/30 bg-cream px-3 py-1.5 text-sm font-medium text-brand shadow-lg">
            <span
              aria-hidden
              className="absolute -bottom-2 left-5 size-3 rotate-45 border-b border-r border-gold/30 bg-cream"
            />
            {message}
          </div>
        </div>
      )}
    </div>
  );
}

function Lives({ count, max }: { count: number; max: number }) {
  return (
    <div className="flex items-center gap-1 text-gold" aria-label={`${count} of ${max} lives`}>
      {Array.from({ length: max }, (_, index) => (
        <svg key={index} viewBox="0 0 24 24" aria-hidden className="size-4">
          <path
            d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0 1 12 6.4 5.3 5.3 0 0 1 21.3 12c-1.8 4.3-9.3 9-9.3 9Z"
            className={index < count ? "fill-current" : "fill-transparent"}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      ))}
    </div>
  );
}

function DeckPile({ count }: { count: number }) {
  return (
    <div className="relative">
      <div className="absolute -left-1.5 -top-1.5 opacity-40">
        <FaceDownCard />
      </div>
      <div className="relative">
        <FaceDownCard />
      </div>
      <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2 py-0.5 text-[10px] text-ivory/70">
        {count}
      </span>
    </div>
  );
}

function FaceDownCard() {
  return (
    <img
      src={cardBackAsset}
      alt="Face-down card"
      aria-hidden
      loading="lazy"
      className="block h-28 w-[4.75rem] rounded-lg object-cover shadow-md shadow-black/30"
    />
  );
}

const isRed = (suit: Card["suit"]) => suit === "H" || suit === "D";

function CardView({ card, loser = false }: { card: Card; loser?: boolean }) {
  const red = isRed(card.suit);
  const rank = RANK_LABEL[card.rank];
  const suit = SUIT_SYMBOL[card.suit];
  const isFace = card.rank > 10;
  const pips = isFace || card.rank === 1 ? 1 : card.rank;
  return (
    <span
      className={`relative block overflow-hidden rounded-lg bg-white shadow-md shadow-black/30 ${
        loser ? "opacity-50 grayscale" : ""
      } h-28 w-[4.75rem] ${red ? "text-destructive" : "text-brand"}`}
    >
      <span className="absolute left-1.5 top-1 flex flex-col items-center font-display text-2xl font-bold leading-none">
        <span>{rank}</span>
        <span className="text-xl">{suit}</span>
      </span>
      <span
        aria-hidden
        className="absolute bottom-1.5 right-1.5 flex w-[58%] flex-wrap-reverse justify-end gap-x-[1px] gap-y-[1px] text-[10px] leading-[0.85]"
      >
        {isFace ? (
          <span className="font-display text-2xl font-bold">{rank}</span>
        ) : (
          Array.from({ length: pips }, (_, index) => <span key={index}>{suit}</span>)
        )}
      </span>
      <span className="sr-only">{cardLabel(card)}</span>
    </span>
  );
}


