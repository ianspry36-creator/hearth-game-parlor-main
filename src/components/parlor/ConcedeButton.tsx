import { useState } from "react";
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
 * A shared "concede" affordance for every table game. It stays disabled until
 * the player has completed `minMoves` moves, then, once confirmed, hands off to
 * the parent so the game can record a loss and show its loss screen.
 */
export function ConcedeButton({
  moves,
  minMoves = 5,
  disabled = false,
  onConcede,
  className,
  label = "Concede",
  size,
  description = "Conceding counts as a loss in your statistics.",
}: {
  moves: number;
  minMoves?: number;
  disabled?: boolean;
  onConcede: () => void;
  className?: string;
  label?: string;
  size?: "default" | "sm" | "lg" | "icon";
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const ready = moves >= minMoves;
  return (
    <>
      <Button
        variant="parlorGhost"
        size={size}
        className={`${className ?? ""} text-ivory/70 hover:bg-gold/5`}
        disabled={disabled || !ready}
        onClick={() => setOpen(true)}
        title={
          ready
            ? "Concede this game (counts as a loss)"
            : `Concede unlocks after ${minMoves} moves`
        }
      >
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="border-gold/25 bg-brand text-cream">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">
              Concede this game?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/65">
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                onConcede();
              }}
            >
              Yes, concede
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
