import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CRIB_BOARD_OPTIONS, writeCribBoardGraphic } from "@/lib/cribbageBoards";

type Props = {
  boardGraphic: string;
  onSelect: (src: string) => void;
};

/** Options menu that lets the player change the cribbage peg board. */
export function CribBoardOptionsDialog({ boardGraphic, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="parlorGhost" size="sm" className="w-full h-6">
          Options
        </Button>
      </DialogTrigger>
      <DialogContent className="border-gold/25 bg-brand text-cream sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Peg board</DialogTitle>
          <DialogDescription className="text-ivory/65">
            Choose the peg board used to track the score on your cribbage table.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {CRIB_BOARD_OPTIONS.map((option) => {
            const selected = option.src === boardGraphic;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  writeCribBoardGraphic(option.id);
                  onSelect(option.src);
                  setOpen(false);
                }}
                className={`group overflow-hidden rounded-lg ring-2 transition-transform hover:scale-[1.03] ${
                  selected ? "ring-gold" : "ring-gold/20"
                }`}
              >
                <span className="flex aspect-[9/16] w-full items-center justify-center overflow-hidden bg-brand/60 p-1">
                  <img
                    src={option.src}
                    alt={option.label}
                    className="h-full w-full object-contain"
                  />
                </span>
                <span className="block bg-brand/80 py-1 text-center text-xs text-ivory/80">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
