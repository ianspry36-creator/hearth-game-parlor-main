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

/**
 * Menu control for agreeing to switch off the per-turn clock in a live match.
 * The local player proposes it (showing the button); their opponent is then
 * prompted to accept or decline. Once the proposal is answered the button is
 * gone for good either way.
 */
export function TurnOffTimerControl({
  showButton,
  showPrompt,
  opponentName,
  onRequest,
  onAccept,
  onDecline,
}: {
  showButton: boolean;
  showPrompt: boolean;
  opponentName: string;
  onRequest: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <>
      {showButton && (
        <Button variant="parlorGhost" size="sm" className="w-full h-6" onClick={onRequest}>
          Turn Off Timer
        </Button>
      )}
      <AlertDialog open={showPrompt}>
        <AlertDialogContent className="border-gold/25 bg-brand text-cream">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">
              {opponentName} requests turning off timer?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/65">
              Agree and the turn clock is switched off for the rest of the game.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onDecline}>No</AlertDialogCancel>
            <AlertDialogAction onClick={onAccept}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
