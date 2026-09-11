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
import { ADA_HAPPY, ADA_SAD, ADA_AVATAR } from "@/lib/avatars";
import skunk from "@/assets/skunk.png";
import { getNickname } from "@/lib/multiplayer";
import type { ReactNode } from "react";

export type GameOverResult = "win" | "loss" | "draw";

export type GameOverSeat = {
  name: string;
  score: number | string;
  avatar: string;
  won: boolean;
};

/**
 * Shared end-of-game summary: winner congratulated, loser commiserated,
 * with an optional skunk overlay for a thrashing.
 */
export function GameOverDialog({
  open,
  result,
  playerScore,
  opponentScore,
  scoreLabel,
  opponentName,
  playerAvatar,
  skunk: isSkunk = false,
  headline,
  detail,
  onPlayAgain,
  footerExtra,
  results,
}: {
  open: boolean;
  result: GameOverResult;
  playerScore: number | string;
  opponentScore: number | string;
  scoreLabel?: string;
  opponentName: string;
  playerAvatar: string;
  skunk?: boolean;
  headline?: string;
  detail?: string;
  onPlayAgain: () => void;
  footerExtra?: ReactNode;
  results?: GameOverSeat[];
}) {
  const title =
    headline ??
    (result === "draw" ? "An even game" : result === "win" ? "You won!" : `${opponentName} won!`);
  const description =
    detail ??
    (result === "draw"
      ? "Honours shared — here is how the table finished."
      : isSkunk
        ? `A skunk! ${result === "win" ? `${opponentName} was` : "You were"} well and truly beaten.`
        : "The game is over — here is how the table finished.");

  const you = {
    name: getNickname() ?? "You",
    score: playerScore,
    avatar: playerAvatar,
    won: result === "win",
    lost: result === "loss",
  };
  const them = {
    name: opponentName,
    score: opponentScore,
    avatar: result === "loss" ? ADA_HAPPY : result === "win" ? ADA_SAD : ADA_AVATAR,
    won: result === "loss",
    lost: result === "win",
  };

  const seats = results
    ? results.map((seat) => ({ ...seat, lost: !seat.won }))
    : result === "loss"
      ? [them, you]
      : [you, them];

  // With 4 players the row gets crowded, so shrink each seat by ~25%.
  const compact = seats.length >= 4;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        className={`border-gold/30 bg-brand text-cream ${
          seats.length >= 4 ? "sm:max-w-xl" : "sm:max-w-md"
        }`}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center font-display text-3xl">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-center text-ivory/70">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center justify-center gap-6 py-4">
          {seats.map((seat, index) => (
            <div key={seat.name + index} className="flex items-center gap-6">
              {index > 0 && seats.length === 2 && (
                <span className="font-display text-2xl text-ivory/40">vs</span>
              )}
              <div className="relative flex flex-col items-center gap-2">
                {seat.lost && isSkunk ? (
                  <img
                    src={skunk}
                    alt="Skunk"
                    width={96}
                    height={96}
                    className="pointer-events-none absolute -top-2 left-1/2 z-10 size-24 -translate-x-1/2 animate-bounce"
                  />
                ) : null}
                <div className="relative">
                  <img
                    src={seat.avatar}
                    alt={seat.name}
                    width={compact ? 72 : 96}
                    height={compact ? 72 : 96}
                    className={`${compact ? "size-[4.5rem]" : "size-24"} rounded-full border-2 object-cover shadow-lg shadow-black/30 ${
                      seat.won ? "border-gold" : "border-ivory/40"
                    } ${seat.lost && seat.avatar === playerAvatar ? "grayscale brightness-90" : ""}`}
                  />
                  {seat.won ? (
                    <span className="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full bg-gold text-sm text-brand shadow-md">
                      🏆
                    </span>
                  ) : null}
                </div>
                <p className={`font-display ${compact ? "text-sm" : "text-lg"} ${seat.won ? "text-gold" : "text-ivory/80"}`}>
                  {seat.name}
                </p>
                <p className={`${compact ? "text-lg" : "text-2xl"} font-bold`}>{seat.score}</p>
                <p className={`${compact ? "text-[9px]" : "text-xs"} text-ivory/70`}>
                  {result === "draw"
                    ? "Well played."
                    : seat.won
                      ? "Congratulations!"
                      : "Commiserations."}
                </p>
              </div>
            </div>
          ))}
        </div>

        {scoreLabel ? (
          <p className="text-center text-[11px] uppercase tracking-[0.22em] text-ivory/45">
            {scoreLabel}
          </p>
        ) : null}

        <AlertDialogFooter className="gap-2 sm:justify-center">
          {footerExtra}
          <AlertDialogAction asChild>
            <Button variant="parlor" onClick={onPlayAgain}>
              Play again
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
