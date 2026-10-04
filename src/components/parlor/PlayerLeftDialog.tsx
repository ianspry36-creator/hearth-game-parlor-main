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
import type { LeftNotice } from "@/lib/crazyEightsLobby";

/**
 * Tells the remaining players that a human has left and their seat has been
 * handed to a named computer opponent, so the game can carry on.
 */
export function PlayerLeftDialog({
  notice,
  onDismiss,
}: {
  notice: LeftNotice | null;
  onDismiss: () => void;
}) {
  return (
    <AlertDialog open={notice != null} onOpenChange={(open) => !open && onDismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center font-display text-3xl">
            {notice?.playerName} left
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-ivory/70">
            {notice?.playerName} has left the game. Their seat has been taken over
            by <span className="font-semibold text-ivory">{notice?.computerName}</span>{" "}
            (a computer), so the game can continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogAction asChild>
            <Button variant="parlor" onClick={onDismiss}>
              Continue playing
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
