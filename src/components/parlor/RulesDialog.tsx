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

export function RulesDialog({ game, trigger }: { game: GameMeta; trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto border-gold/25 bg-surface sm:max-w-lg">
        <DialogHeader>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">How to play</p>
          <DialogTitle className="font-display text-3xl font-bold">
            The rules of {game.name}
          </DialogTitle>
          <DialogDescription className="text-ivory/70">{game.tagline}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {game.rules.map((rule) => (
            <div key={rule.heading}>
              <h4 className="font-display text-lg font-semibold text-gold">{rule.heading}</h4>
              <p className="mt-1 text-sm leading-relaxed text-ivory/75">{rule.body}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
