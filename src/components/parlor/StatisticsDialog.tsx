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
  deletePlayerMatches,
  isHybridGame,
  isSoloGame,
  type LeaderboardEntry,
  type OpponentStats,
} from "@/lib/stats";
import { clearSolitaireStats, useSolitaireStats } from "@/lib/solitaireStats";
import { readDifficulty as readCheckersDifficulty } from "@/lib/checkers";
import { readDifficulty as readReversiDifficulty } from "@/lib/reversi";
import { DIFFICULTY_NAME, type SpiderDifficulty } from "@/lib/spider";
import { clearBestScores } from "@/lib/spiderScores";
import { fetchSpiderLeaderboard, type SpiderLeaderboardEntry } from "@/lib/spiderLeaderboard";
import { getNickname, getSessionId } from "@/lib/multiplayer";
import { useDeveloperMode } from "@/lib/dev-mode";
import { flagName, flagUrl } from "@/lib/flags";
import type { ReactNode } from "react";

export function StatisticsDialog({ game, trigger }: { game: GameMeta; trigger: ReactNode }) {
  const solo = isSoloGame(game.id);
  const hybrid = isHybridGame(game.id);
  const isDifficultyGame = game.id === "checkers" || game.id === "reversi";
  const isSpider = game.id === "spider";
  const showSolo = solo || hybrid;
  const showMulti = !solo;
  const { played, won, lost, abandoned, reset } = useSolitaireStats(game.id);

  // Checkers and reversi record their vs-Ada results per difficulty, so read
  // all three here. These hooks are cheap (localStorage) and simply unused on
  // other tables (the variant keys are never written there).
  const easy = useSolitaireStats(game.id, "easy");
  const medium = useSolitaireStats(game.id, "medium");
  const hard = useSolitaireStats(game.id, "hard");
  const difficultyRows: DifficultyRow[] = [
    {
      label: "Easy",
      played: easy.played,
      won: easy.won,
      lost: easy.lost,
      abandoned: easy.abandoned,
    },
    {
      label: "Medium",
      played: medium.played,
      won: medium.won,
      lost: medium.lost,
      abandoned: medium.abandoned,
    },
    {
      label: "Hard",
      played: hard.played,
      won: hard.won,
      lost: hard.lost,
      abandoned: hard.abandoned,
    },
  ];
  const difficultyPlayed = easy.played + medium.played + hard.played;
  const totalPlayed = isDifficultyGame ? difficultyPlayed : played;
  const [confirmReset, setConfirmReset] = useState(false);

  const handleReset = () => {
    if (isDifficultyGame) {
      clearSolitaireStats(game.id, "easy");
      clearSolitaireStats(game.id, "medium");
      clearSolitaireStats(game.id, "hard");
    } else {
      reset();
      if (isSpider) {
        clearBestScores(1);
        clearBestScores(2);
        clearBestScores(4);
      }
    }
  };

  const currentDifficulty =
    game.id === "checkers" ? readCheckersDifficulty() : readReversiDifficulty();
  const title = solo
    ? "Your record"
    : isDifficultyGame
      ? `${game.name} (${capitalize(currentDifficulty)})`
      : game.name;
  const description = solo
    ? "Your single-player wins and losses for this table."
    : isDifficultyGame
      ? "Your record against Ada by difficulty, plus the top players online."
      : hybrid
        ? "Your record against Ada, plus the top players online."
        : "See the top players at this table, or your own record against each opponent.";

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="max-h-[80vh] overflow-y-auto border-gold/25 bg-surface sm:max-w-lg">
          <DialogHeader>
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Statistics</p>
            <DialogTitle className="font-display text-3xl font-bold">{title}</DialogTitle>
            <DialogDescription className="text-ivory/70">{description}</DialogDescription>
          </DialogHeader>
          {showSolo && (
            <>
              {hybrid && (
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-ivory/50">
                  vs Ada
                </p>
              )}
              {isDifficultyGame ? (
                <DifficultyStatsTable rows={difficultyRows} />
              ) : (
                <SoloStats played={played} won={won} lost={lost} abandoned={abandoned} />
              )}
              {isSpider && <SpiderBestScores />}
            </>
          )}
          {showMulti && (
            <>
              {hybrid && (
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-ivory/50">
                  Online
                </p>
              )}
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
            </>
          )}
          {showSolo && totalPlayed > 0 && (
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
              <Button variant="parlor" onClick={handleReset}>
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
  const [reload, setReload] = useState(0);
  const devMode = useDeveloperMode();

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
  }, [game.id, reload]);

  const remove = async (nickname: string) => {
    await deletePlayerMatches(game.id, { nickname });
    setReload((n) => n + 1);
  };

  if (loading) return <p className="py-8 text-center text-sm text-ivory/55">Loading…</p>;
  if (rows.length === 0) return <EmptyState />;
  return <StatTable rows={rows} devMode={devMode} onDelete={remove} />;
}

type DifficultyRow = {
  label: string;
  played: number;
  won: number;
  lost: number;
  abandoned: number;
};

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Per-difficulty record for checkers and reversi (easy / medium / hard). */
function DifficultyStatsTable({ rows }: { rows: DifficultyRow[] }) {
  const totalPlayed = rows.reduce((n, row) => n + row.played, 0);
  if (totalPlayed === 0) return <EmptyState />;
  const cols =
    "grid-cols-[minmax(0,1fr)_2.75rem_2rem_2rem_4rem] sm:grid-cols-[1fr_4rem_4rem_4rem_4.5rem]";
  return (
    <div className="mt-1">
      <div
        className={`sticky top-0 z-10 grid ${cols} gap-1.5 border-b border-gold/15 bg-surface py-2 text-[10px] uppercase tracking-[0.04em] text-ivory/50 sm:gap-2 sm:text-[11px] sm:tracking-[0.18em]`}
      >
        <span>Difficulty</span>
        <span className="text-right">Played</span>
        <span className="text-right">Won</span>
        <span className="text-right">Lost</span>
        <span className="text-right">Abandoned</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={row.label}
            className={`grid ${cols} items-center gap-1.5 border-b border-gold/10 py-2.5 text-sm last:border-0 sm:gap-2`}
          >
            <span className="font-medium">{row.label}</span>
            <span className="text-right text-ivory/80">{row.played}</span>
            <span className="text-right text-gold">{row.won}</span>
            <span className="text-right text-ivory/60">{row.lost}</span>
            <span className="text-right text-ivory/60">{row.abandoned}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SoloStats({
  played,
  won,
  lost,
  abandoned,
}: {
  played: number;
  won: number;
  lost: number;
  abandoned: number;
}) {
  const nickname = getNickname();
  const rows: LeaderboardEntry[] = [{ nickname: nickname ?? "You", played, won, lost }];
  if (played === 0) return <EmptyState />;
  return <StatTable rows={rows} abandoned={abandoned} />;
}

const SPIDER_DIFFICULTIES: SpiderDifficulty[] = [1, 2, 4];

/** Spider shows the global top-10 best scores for each difficulty (easy / medium / hard). */
function SpiderBestScores() {
  const [boards, setBoards] = useState<
    Partial<Record<SpiderDifficulty, SpiderLeaderboardEntry[]>>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.all(
      SPIDER_DIFFICULTIES.map((d) =>
        fetchSpiderLeaderboard(d).then((rows) => [d, rows] as const),
      ),
    ).then((results) => {
      if (!live) return;
      const next: Partial<Record<SpiderDifficulty, SpiderLeaderboardEntry[]>> = {};
      for (const [d, rows] of results) next[d] = rows;
      setBoards(next);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  if (loading) {
    return <p className="py-4 text-center text-sm text-ivory/55">Loading best scores…</p>;
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ivory/50">
        Best scores — global
      </p>
      <div className="mt-2 space-y-3">
        {SPIDER_DIFFICULTIES.map((d) => {
          const rows = boards[d] ?? [];
          return (
            <div key={d}>
              <p className="text-sm font-medium text-gold">{DIFFICULTY_NAME[d]}</p>
              {rows.length === 0 ? (
                <p className="text-sm text-ivory/50">No scores yet.</p>
              ) : (
                <ol className="mt-1 divide-y divide-gold/10">
                  {rows.map((row, i) => (
                    <li
                      key={`${d}-${i}`}
                      className="flex items-baseline gap-2 py-1.5 text-sm text-ivory/85"
                    >
                      <span className="w-5 shrink-0 text-right text-xs text-ivory/45">
                        {i + 1}.
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{row.nickname}</span>
                      <span className="shrink-0 font-semibold text-gold">{row.score}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatTable({
  rows,
  abandoned,
  devMode,
  onDelete,
}: {
  rows: LeaderboardEntry[];
  abandoned?: number;
  devMode?: boolean;
  onDelete?: (nickname: string) => void;
}) {
  const showAbandoned = abandoned !== undefined;
  const cols = showAbandoned
    ? "grid-cols-[1.25rem_minmax(0,1fr)_2.75rem_2rem_2rem_4rem] sm:grid-cols-[2rem_1fr_4rem_4rem_4rem_4rem]"
    : "grid-cols-[1.25rem_minmax(0,1fr)_2.75rem_2rem_2rem] sm:grid-cols-[2rem_1fr_4.5rem_4.5rem_4.5rem]";
  return (
    <div className="mt-1">
      <div
        className={`sticky top-0 z-10 grid ${cols} gap-1.5 border-b border-gold/15 bg-surface py-2 text-[10px] uppercase tracking-[0.04em] text-ivory/50 sm:gap-2 sm:text-[11px] sm:tracking-[0.18em]`}
      >
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Played</span>
        <span className="text-right">Won</span>
        <span className="text-right">Lost</span>
        {showAbandoned && <span className="text-right">Abandoned</span>}
      </div>
      <ul>
        {rows.map((row, i) => (
          <li
            key={row.nickname + i}
            className={`grid ${cols} items-center gap-1.5 border-b border-gold/10 py-2.5 text-sm last:border-0 sm:gap-2`}
          >
            <span className="text-ivory/45">{i + 1}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium">{row.nickname}</span>
              {devMode && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(row.nickname)}
                  aria-label={`Delete ${row.nickname}`}
                  title={`Delete ${row.nickname}`}
                  className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-full bg-destructive/15 text-[11px] font-bold leading-none text-destructive transition-colors hover:bg-destructive/40"
                >
                  ✕
                </button>
              )}
            </span>
            <span className="text-right text-ivory/80">{row.played}</span>
            <span className="text-right text-gold">{row.won}</span>
            <span className="text-right text-ivory/60">{row.lost}</span>
            {showAbandoned && <span className="text-right text-ivory/60">{abandoned}</span>}
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
  const [reload, setReload] = useState(0);
  const devMode = useDeveloperMode();

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
  }, [game.id, reload]);

  const remove = async (opponentSession: string) => {
    await deletePlayerMatches(game.id, { session: opponentSession });
    setReload((n) => n + 1);
  };

  if (loading) return <p className="py-8 text-center text-sm text-ivory/55">Loading…</p>;
  if (rows.length === 0) return <EmptyState />;
  return <OpponentTable rows={rows} devMode={devMode} onDelete={remove} />;
}

function OpponentTable({
  rows,
  devMode,
  onDelete,
}: {
  rows: OpponentStats[];
  devMode?: boolean;
  onDelete?: (opponentSession: string) => void;
}) {
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
              {devMode && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(row.opponentSession)}
                  aria-label={`Delete ${row.nickname}`}
                  title={`Delete ${row.nickname}`}
                  className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-full bg-destructive/15 text-[11px] font-bold leading-none text-destructive transition-colors hover:bg-destructive/40"
                >
                  ✕
                </button>
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
