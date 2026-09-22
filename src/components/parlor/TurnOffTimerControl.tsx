import { useEffect, useState } from "react";
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
 * gone for good either way. When the proposal is declined, the player who made
 * it is told so (`declined`).
 */
export function TurnOffTimerControl({
  showButton,
  showPrompt,
  opponentName,
  declined = false,
  agreed = false,
  onRequest,
  onAccept,
  onDecline,
}: {
  showButton: boolean;
  showPrompt: boolean;
  opponentName: string;
  /** Our own request was declined — surface a short notice to the instigator. */
  declined?: boolean;
  /** Our own request was accepted — surface a short notice to the instigator. */
  agreed?: boolean;
  onRequest: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [showDeclined, setShowDeclined] = useState(false);
  useEffect(() => {
    if (!declined) return;
    setShowDeclined(true);
    const timer = setTimeout(() => setShowDeclined(false), 6000);
    return () => clearTimeout(timer);
  }, [declined]);

  const [showAgreed, setShowAgreed] = useState(false);
  useEffect(() => {
    if (!agreed) return;
    setShowAgreed(true);
    const timer = setTimeout(() => setShowAgreed(false), 6000);
    return () => clearTimeout(timer);
  }, [agreed]);

  return (
    <>
      {showButton && (
        <Button variant="parlorGhost" size="sm" className="w-full h-6" onClick={onRequest}>
          Turn Off Timer
        </Button>
      )}
      {showAgreed && (
        <p className="text-xs leading-snug text-ivory/60">
          {opponentName} has agreed to turn off Timer.
        </p>
      )}
      {showDeclined && (
        <p className="text-xs leading-snug text-ivory/60">
          {opponentName} has not agreed to turn off Timer. Timer function will continue.
        </p>
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
