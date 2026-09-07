import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { GameMeta } from "@/lib/games";
import { fetchLeaderboard, isSoloGame, type LeaderboardEntry } from "@/lib/stats";
import { useSolitaireStats } from "@/lib/solitaireStats";
import { getNickname } from "@/lib/multiplayer";
import type { ReactNode } from "react";

export function StatisticsDialog({ game, trigger }: { game: GameMeta; trigger: ReactNode }) {
  const solo = isSoloGame(game.id);
  return (
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
        {solo ? <SoloStats game={game} /> : <Leaderboard game={game} />}
      </DialogContent>
    </Dialog>
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

function SoloStats({ game }: { game: GameMeta }) {
  const { played, won, lost } = useSolitaireStats(game.id);
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
