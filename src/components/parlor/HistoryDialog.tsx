import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { GameMeta } from "@/lib/games";
import type { ReactNode } from "react";

export function HistoryDialog({ game, trigger }: { game: GameMeta; trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto border-gold/25 bg-surface sm:max-w-lg">
        <DialogHeader>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">A little background</p>
          <DialogTitle className="font-display text-3xl font-bold">
            The history of {game.name}
          </DialogTitle>
          <DialogDescription className="text-ivory/70">{game.tagline}</DialogDescription>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-ivory/75">{game.history}</p>
        {game.historySource ? (
          <p className="pt-2 text-xs text-ivory/50">
            Source:{" "}
            <a
              href={game.historySource}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-gold/40 underline-offset-2 hover:text-gold"
            >
              Wikipedia
            </a>
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
