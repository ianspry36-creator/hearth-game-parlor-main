import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import type { GameMeta } from "@/lib/games";
import { fetchLeaderboard, isSoloGame, type LeaderboardEntry } from "@/lib/stats";
import { useSolitaireStats } from "@/lib/solitaireStats";
import { getNickname } from "@/lib/multiplayer";
import type { ReactNode } from "react";

export function StatisticsDialog({ game, trigger }: { game: GameMeta; trigger: ReactNode }) {
  const solo = isSoloGame(game.id);
  const { played, won, lost, reset } = useSolitaireStats(game.id);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="max-h-[80vh] overflow-y-auto border-gold/25 bg-surface sm:max-w-lg">
          <DialogHeader>
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Statistics</p>
            <DialogTitle className="font-display text-3xl font-bold">
              {solo ? "Your record" : `Top players at ${game.name}`}
            </DialogTitle>
            <DialogDescription className="text-ivory/70">
              {solo
                ? "Your single-player wins and losses for this table."
                : "The ten most accomplished nicknamed players at this table."}
            </DialogDescription>
          </DialogHeader>
          {solo ? (
            <SoloStats played={played} won={won} lost={lost} />
          ) : (
            <Leaderboard game={game} />
          )}
          {solo && played > 0 && (
            <div className="flex justify-end">
              <Button variant="parlorOutline" size="sm" onClick={() => setConfirmReset(true)}>
                Reset
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="border-gold/30 bg-brand text-cream sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center font-display text-2xl">
              Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-ivory/70">
              This clears all your statistics for {game.name}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-center">
            <AlertDialogCancel asChild>
              <Button variant="parlorOutline">No</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="parlor" onClick={reset}>
                Yes
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Leaderboard({ game }: { game: GameMeta }) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetchLeaderboard(game.id).then((next) => {
      if (!live) return;
      setRows(next);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [game.id]);

  if (loading) return <p className="py-8 text-center text-sm text-ivory/55">Loading…</p>;
  if (rows.length === 0) return <EmptyState />;
  return <StatTable rows={rows} />;
}

function SoloStats({ played, won, lost }: { played: number; won: number; lost: number }) {
  const nickname = getNickname();
  const rows: LeaderboardEntry[] = [
    { nickname: nickname ?? "You", played, won, lost },
  ];
  if (played === 0) return <EmptyState />;
  return <StatTable rows={rows} />;
}

function StatTable({ rows }: { rows: LeaderboardEntry[] }) {
  return (
    <div className="mt-1">
      <div className="grid grid-cols-[2rem_1fr_4.5rem_4.5rem_4.5rem] gap-2 border-b border-gold/15 pb-2 text-[11px] uppercase tracking-[0.18em] text-ivory/50">
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Played</span>
        <span className="text-right">Won</span>
        <span className="text-right">Lost</span>
      </div>
      <ul>
        {rows.map((row, i) => (
          <li
            key={row.nickname + i}
            className="grid grid-cols-[2rem_1fr_4.5rem_4.5rem_4.5rem] items-center gap-2 border-b border-gold/10 py-2.5 text-sm last:border-0"
          >
            <span className="text-ivory/45">{i + 1}</span>
            <span className="truncate font-medium">{row.nickname}</span>
            <span className="text-right text-ivory/80">{row.played}</span>
            <span className="text-right text-gold">{row.won}</span>
            <span className="text-right text-ivory/60">{row.lost}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="rounded-lg border border-dashed border-gold/20 bg-brand/30 p-6 text-center text-sm text-ivory/55">
      No games recorded yet — play a hand and the record will appear here.
    </p>
  );
}
