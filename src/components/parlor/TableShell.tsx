import { Link } from "@tanstack/react-router";
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
import { WaitingRoom } from "@/components/parlor/WaitingRoom";
import { ChatDialog } from "@/components/parlor/ChatDialog";
import { ChatContext } from "@/components/parlor/ChatContext";
import type { GameMeta } from "@/lib/games";

export function TableShell({
  game,
  opponentName,
  opponentStatus,
  onMatched,
  onNewGame,
  gameInProgress = false,
  rail,
  children,
  hideOpponent = false,
}: {
  game: GameMeta;
  opponentName: string;
  opponentStatus: string;
  onMatched: (opponent: string, matchId: string) => void;
  onNewGame: () => void;
  gameInProgress?: boolean;
  rail: ReactNode;
  children: ReactNode;
  hideOpponent?: boolean;
}) {
  const [confirming, setConfirming] = useState<"new" | "human" | null>(null);
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
    []
  );
  const startNewGame = () => (gameInProgress ? setConfirming("new") : onNewGame());
  const openWaitingRoom = () => (gameInProgress ? setConfirming("human") : setHumanOpen(true));
  return (
    <div className="min-h-screen bg-brand text-cream">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              aria-label="Love Card Games home"
              className="grid size-10 place-items-center rounded-full bg-gold text-brand transition-colors hover:bg-gold-bright"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="currentColor">
                <path d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0 1 12 6.4 5.3 5.3 0 0 1 21.3 12c-1.8 4.3-9.3 9-9.3 9Z" />
              </svg>
            </Link>
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-gold">Now on the table</p>
              <h1 className="font-display text-2xl font-bold leading-tight">
                {game.name} — vs {opponentName}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xs uppercase tracking-[0.2em] text-ivory/50 hover:text-gold">
              ← Back to the game room
            </Link>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div className="rounded-2xl border border-gold/20 bg-surface/40 p-5 sm:p-8">
            <ChatContext.Provider value={chatMessage}>{children}</ChatContext.Provider>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-gold/20 bg-surface/60 p-5">
              <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-ivory/60">
                Table actions
              </p>
              <div className="space-y-2.5">
                <Button variant="parlor" className="w-full" onClick={startNewGame}>
                  New game
                </Button>
                <Button variant="parlorOutline" className="w-full" onClick={openWaitingRoom}>
                  Human
                </Button>
                <WaitingRoom
                  game={game}
                  onMatched={onMatched}
                  open={humanOpen}
                  onOpenChange={setHumanOpen}
                />
                <RulesDialog
                  game={game}
                  trigger={
                    <Button variant="parlorGhost" className="w-full">
                      Rules
                    </Button>
                  }
                />
                <Button
                  variant="parlorGhost"
                  className="w-full"
                  onClick={() => setChatOpen(true)}
                >
                  Chat
                </Button>
                <ChatDialog
                  open={chatOpen}
                  onOpenChange={setChatOpen}
                  onSend={sendChat}
                />
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
                      {confirming === "human"
                        ? "Leaving for the waiting room will abandon the hand you're playing."
                        : "Starting a new game will abandon the hand you're playing."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep playing</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (confirming === "human") setHumanOpen(true);
                        else onNewGame();
                        setConfirming(null);
                      }}
                    >
                      Yes, leave the game
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {!hideOpponent && (
              <div className="rounded-xl border border-gold/15 bg-brand/50 p-5">
                <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-ivory/60">Opponent</p>
                <p className="font-display text-xl">{opponentName}</p>
                <p className="mt-1 text-sm text-ivory/60">{opponentStatus}</p>
              </div>
            )}

            {rail}
          </aside>
        </div>
      </div>
    </div>
  );
}
