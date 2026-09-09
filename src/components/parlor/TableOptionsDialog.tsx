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
import {
  CLASSIC_PALETTE,
  TABLE_OPTIONS,
  writeTableGraphic,
  type TablePalette,
} from "@/lib/backgammonTables";

type Props = {
  tableGraphic: TablePalette | null;
  onSelect: (palette: TablePalette | null) => void;
};

/** A miniature rendering of the board so the player can preview each colour scheme. */
function TablePreview({ palette }: { palette: TablePalette }) {
  const topRow = Array.from({ length: 12 }, (_, i) => i);
  const bottomRow = Array.from({ length: 12 }, (_, i) => i);
  return (
    <span
      className="flex aspect-[4/3] w-full flex-col gap-1 overflow-hidden p-1.5"
      style={{
        backgroundColor: palette.surface,
        border: `4px solid ${palette.border}`,
      }}
    >
      <span className="grid flex-1 grid-cols-12 gap-0.5">
        {topRow.map((i) => (
          <span
            key={i}
            style={{
              backgroundColor: i % 2 === 0 ? palette.pointLight : palette.pointDark,
              clipPath: "polygon(0 0, 100% 0, 50% 100%)",
            }}
          />
        ))}
      </span>
      <span
        className="flex h-6 shrink-0 items-center justify-center rounded-sm"
        style={{ backgroundColor: palette.bar }}
      >
        <span
          className="text-[8px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: palette.barText }}
        >
          Bar
        </span>
      </span>
      <span className="grid flex-1 grid-cols-12 gap-0.5">
        {bottomRow.map((i) => (
          <span
            key={i}
            style={{
              backgroundColor: i % 2 === 0 ? palette.pointLight : palette.pointDark,
              clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
            }}
          />
        ))}
      </span>
    </span>
  );
}

/** Options menu that lets the player change the backgammon board colour scheme. */
export function TableOptionsDialog({ tableGraphic, onSelect }: Props) {
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
          <DialogTitle className="font-display text-2xl">Table colour</DialogTitle>
          <DialogDescription className="text-ivory/65">
            Choose the colour scheme of your backgammon board.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          {TABLE_OPTIONS.map((option) => {
            const selected = option.palette === tableGraphic;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  writeTableGraphic(option.id);
                  onSelect(option.palette);
                  setOpen(false);
                }}
                className={`group overflow-hidden rounded-lg ring-2 transition-transform hover:scale-[1.03] ${
                  selected ? "ring-gold" : "ring-gold/20"
                }`}
              >
                <TablePreview palette={option.palette ?? CLASSIC_PALETTE} />
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
