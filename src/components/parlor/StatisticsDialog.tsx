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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GameMeta } from "@/lib/games";
import {
  fetchLeaderboard,
  fetchOpponentStats,
  isSoloGame,
  type LeaderboardEntry,
  type OpponentStats,
} from "@/lib/stats";
import { useSolitaireStats } from "@/lib/solitaireStats";
import { getNickname, getSessionId } from "@/lib/multiplayer";
import { flagName, flagUrl } from "@/lib/flags";
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
              {solo ? "Your record" : game.name}
            </DialogTitle>
            <DialogDescription className="text-ivory/70">
              {solo
                ? "Your single-player wins and losses for this table."
                : "See the top players at this table, or your own record against each opponent."}
            </DialogDescription>
          </DialogHeader>
          {solo ? (
            <SoloStats played={played} won={won} lost={lost} />
          ) : (
            <Tabs defaultValue="top">
              <TabsList className="grid w-full grid-cols-2 rounded-xl border border-gold/25 bg-surface p-1">
                <TabsTrigger
                  value="top"
                  className="data-[state=active]:bg-gold data-[state=active]:text-brand"
                >
                  Top 10 Players
                </TabsTrigger>
                <TabsTrigger
                  value="wins"
                  className="data-[state=active]:bg-gold data-[state=active]:text-brand"
                >
                  Your Wins / Losses
                </TabsTrigger>
              </TabsList>
              <TabsContent value="top" className="h-[26rem] overflow-y-auto">
                <Leaderboard game={game} />
              </TabsContent>
              <TabsContent value="wins" className="h-[26rem] overflow-y-auto">
                <Opponents game={game} />
              </TabsContent>
            </Tabs>
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
      <div className="sticky top-0 z-10 grid grid-cols-[2rem_1fr_4.5rem_4.5rem_4.5rem] gap-2 border-b border-gold/15 bg-surface py-2 text-[11px] uppercase tracking-[0.18em] text-ivory/50">
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

function Opponents({ game }: { game: GameMeta }) {
  const [rows, setRows] = useState<OpponentStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetchOpponentStats(game.id, getSessionId()).then((next) => {
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
  return <OpponentTable rows={rows} />;
}

function OpponentTable({ rows }: { rows: OpponentStats[] }) {
  return (
    <div className="mt-1">
      <div className="sticky top-0 z-10 grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-2 border-b border-gold/15 bg-surface py-2 text-[11px] uppercase tracking-[0.18em] text-ivory/50 sm:grid-cols-[1fr_3.5rem_3.5rem_3.5rem_4rem]">
        <span>Opponent</span>
        <span className="text-right">Played</span>
        <span className="text-right">Won</span>
        <span className="text-right">Lost</span>
        <span className="hidden text-right sm:block">Win %</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={row.opponentSession}
            className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] items-center gap-2 border-b border-gold/10 py-2.5 text-sm last:border-0 sm:grid-cols-[1fr_3.5rem_3.5rem_3.5rem_4rem]"
          >
            <div className="flex min-w-0 items-center gap-2">
              {row.avatar ? (
                <img
                  src={row.avatar}
                  alt={`${row.nickname}'s avatar`}
                  className="size-8 shrink-0 rounded-full border border-gold/40 bg-surface object-cover"
                />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-surface text-xs font-semibold text-ivory/70">
                  {row.nickname.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate font-medium">{row.nickname}</span>
              {row.flag && (
                <img
                  src={flagUrl(row.flag)}
                  alt={flagName(row.flag) ?? ""}
                  title={flagName(row.flag) ?? ""}
                  className="size-5 shrink-0 rounded-sm border border-black/20 object-cover shadow-sm shadow-black/30"
                />
              )}
            </div>
            <span className="text-right text-ivory/80">{row.played}</span>
            <span className="text-right text-gold">{row.won}</span>
            <span className="text-right text-ivory/60">{row.lost}</span>
            <span className="hidden text-right text-ivory/80 sm:block">{winPercent(row)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function winPercent(row: OpponentStats): string {
  if (row.played === 0) return "—";
  return `${Math.round((row.won / row.played) * 100)}%`;
}
