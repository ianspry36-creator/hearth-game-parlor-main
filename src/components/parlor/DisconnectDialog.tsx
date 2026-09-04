import { useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Overlay shown when the live opponent drops. While the reconnect window is open it
 * counts down; if the opponent does not return in time, the match is awarded to the
 * player who stayed connected.
 */
export function DisconnectDialog({
  open,
  secondsLeft,
  expired,
  opponentName,
}: {
  open: boolean;
  secondsLeft: number;
  expired: boolean;
  opponentName: string;
}) {
  const navigate = useNavigate();

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="border-gold/30 bg-brand text-cream sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center font-display text-3xl">
            {expired ? "You win!" : "Player has disconnected!"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-ivory/70">
            {expired
              ? `${opponentName} left the table — the game is yours.`
              : `Trying to reconnect ${opponentName}…`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {expired ? null : (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="grid size-20 place-items-center rounded-full border-2 border-gold/40">
              <span className="font-display text-3xl text-gold">{secondsLeft}</span>
            </div>
            <p className="text-xs uppercase tracking-[0.22em] text-ivory/45">
              Reconnecting in {secondsLeft}s…
            </p>
          </div>
        )}

        <AlertDialogFooter className="sm:justify-center">
          {expired ? (
            <AlertDialogAction asChild>
              <Button variant="parlor" onClick={() => void navigate({ to: "/" })}>
                Return to the game room
              </Button>
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
