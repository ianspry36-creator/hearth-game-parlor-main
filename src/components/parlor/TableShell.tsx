import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RulesDialog } from "@/components/parlor/RulesDialog";
import { StatisticsDialog } from "@/components/parlor/StatisticsDialog";
import { WaitingRoom } from "@/components/parlor/WaitingRoom";
import { ChatDialog } from "@/components/parlor/ChatDialog";
import { ChatContext } from "@/components/parlor/ChatContext";
import { CardMark } from "@/components/parlor/CardMark";
import { DisconnectDialog } from "@/components/parlor/DisconnectDialog";
import { FavouriteSwitch } from "@/components/parlor/FavouriteSwitch";
import type { GameMeta } from "@/lib/games";

export function TableShell({
  game,
  opponentName,
  opponentStatus,
  onMatched,
  onNewGame,
  gameInProgress = false,
  rail,
  middle,
  children,
  hideOpponent = false,
  opponentDisconnected = false,
  disconnectSecondsLeft = 10,
  disconnectExpired = false,
  waitingRoomLabel = "Human",
  onPlayerCount,
  playerCount,
  lobby,
  menuExtra,
  containerClassName = "px-6",
  boxClassName = "",
}: {
  game: GameMeta;
  opponentName: string;
  opponentStatus: string;
  onMatched: (opponent: string, matchId: string) => void;
  onNewGame: () => void;
  gameInProgress?: boolean;
  rail?: ReactNode;
  middle?: ReactNode;
  children: ReactNode;
  hideOpponent?: boolean;
  opponentDisconnected?: boolean;
  disconnectSecondsLeft?: number;
  disconnectExpired?: boolean;
  waitingRoomLabel?: string;
  onPlayerCount?: (count: 2 | 3 | 4) => void;
  playerCount?: 2 | 3 | 4;
  lobby?: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
  menuExtra?: ReactNode;
  containerClassName?: string;
  boxClassName?: string;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState<"new" | "human" | "home" | "2" | "3" | "4" | null>(null);
  const [humanOpen, setHumanOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState<string | null>(null);
  const chatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendChat = (message: string) => {
    if (chatTimer.current) clearTimeout(chatTimer.current);
    setChatMessage(message);
    chatTimer.current = setTimeout(() => {
      setChatMessage(null);
      chatTimer.current = null;
    }, 2000);
  };
  useEffect(
    () => () => {
      if (chatTimer.current) clearTimeout(chatTimer.current);
    },
    [],
  );
  const startNewGame = () => (gameInProgress ? setConfirming("new") : onNewGame());
  const openWaitingRoom = () => (gameInProgress ? setConfirming("human") : setHumanOpen(true));
  const goHome = () => (gameInProgress ? setConfirming("home") : void navigate({ to: "/" }));
  const startPlayerCount = (count: 2 | 3 | 4) =>
    gameInProgress
      ? setConfirming(count === 3 ? "3" : count === 4 ? "4" : "2")
      : onPlayerCount?.(count);
  return (
    <div className="min-h-screen bg-brand text-cream">
      <DisconnectDialog
        open={opponentDisconnected || disconnectExpired}
        secondsLeft={disconnectSecondsLeft}
        expired={disconnectExpired}
        opponentName={opponentName}
      />
      <div className={`mx-auto max-w-6xl py-8 ${containerClassName}`}>
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              aria-label="Cards and Games home"
              className="grid size-10 place-items-center rounded-full bg-gold text-brand transition-colors hover:bg-gold-bright"
            >
              <CardMark className="size-5" />
            </Link>
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-gold">Now on the table</p>
              <h1 className="font-display text-2xl font-bold leading-tight">
                {game.name} — vs {opponentName}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goHome}
              className="text-xs uppercase tracking-[0.2em] text-ivory/50 hover:text-gold"
            >
              ← Back to the game room
            </button>
          </div>
        </header>

        <div className={`grid gap-6 ${middle ? "lg:grid-cols-[1fr_230px_260px]" : "lg:grid-cols-[1fr_260px]"}`}>
          <div className={`rounded-2xl border border-gold/20 bg-surface/40 p-5 sm:p-8 ${boxClassName}`}>
            <ChatContext.Provider value={chatMessage}>{children}</ChatContext.Provider>
          </div>

          {middle ? <div className="hidden self-start lg:block">{middle}</div> : null}

          <aside className="space-y-4">
            <div className="rounded-xl border border-gold/20 bg-surface/60 p-3">
              <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-ivory/60">
                Table actions
              </p>
              <div className="space-y-2">
                <Button variant="parlor" size="sm" className="w-full h-6" onClick={startNewGame}>
                  New game
                </Button>
                {onPlayerCount ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="parlorOutline"
                      size="sm"
                      className="w-full px-1 h-6"
                      disabled={playerCount === 2}
                      onClick={() => startPlayerCount(2)}
                    >
                      2 Player
                    </Button>
                    <Button
                      variant="parlorOutline"
                      size="sm"
                      className="w-full px-1 h-6"
                      disabled={playerCount === 3}
                      onClick={() => startPlayerCount(3)}
                    >
                      3 Player
                    </Button>
                    <Button
                      variant="parlorOutline"
                      size="sm"
                      className="w-full px-1 h-6"
                      disabled={playerCount === 4}
                      onClick={() => startPlayerCount(4)}
                    >
                      4 Player
                    </Button>
                  </div>
                ) : null}
                <Button variant="parlorOutline" size="sm" className="w-full h-6" onClick={openWaitingRoom}>
                  {waitingRoomLabel}
                </Button>
                {lobby ? (
                  lobby({ open: humanOpen, onOpenChange: setHumanOpen })
                ) : (
                  <WaitingRoom
                    game={game}
                    onMatched={onMatched}
                    open={humanOpen}
                    onOpenChange={setHumanOpen}
                  />
                )}
                <RulesDialog
                  game={game}
                  trigger={
                    <Button variant="parlorGhost" size="sm" className="w-full h-6">
                      How to Play
                    </Button>
                  }
                />
                <StatisticsDialog
                  game={game}
                  trigger={
                    <Button variant="parlorGhost" size="sm" className="w-full h-6">
                      Statistics
                    </Button>
                  }
                />
                {menuExtra}
                <Button variant="parlorGhost" size="sm" className="w-full h-6" onClick={() => setChatOpen(true)}>
                  Chat
                </Button>
                <FavouriteSwitch gameId={game.id} />
                <ChatDialog open={chatOpen} onOpenChange={setChatOpen} onSend={sendChat} />
              </div>

              <AlertDialog
                open={confirming !== null}
                onOpenChange={(next) => !next && setConfirming(null)}
              >
                <AlertDialogContent className="border-gold/25 bg-brand text-cream">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-display text-2xl">
                      Game in progress. Are you sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-ivory/65">
                      {confirming === "home"
                        ? "Leaving for the game room will abandon the hand you're playing."
                        : confirming === "human"
                          ? "Leaving for the waiting room will abandon the hand you're playing."
                          : confirming === "new"
                            ? "Starting a new game will abandon the hand you're playing."
                            : `Starting a ${confirming}-player game will abandon the hand you're playing.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep playing</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (confirming === "home") void navigate({ to: "/" });
                        else if (confirming === "human") setHumanOpen(true);
                        else if (confirming === "new") onNewGame();
                        else if (confirming === "2") onPlayerCount?.(2);
                        else if (confirming === "3") onPlayerCount?.(3);
                        else if (confirming === "4") onPlayerCount?.(4);
                        setConfirming(null);
                      }}
                    >
                      Yes, leave the game
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {rail}
          </aside>
        </div>
      </div>
    </div>
  );
}
