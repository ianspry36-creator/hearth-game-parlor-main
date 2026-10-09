import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useDeveloperMode } from "@/lib/dev-mode";
import { CardMark } from "@/components/parlor/CardMark";

type StartedGame = {
  id: string;
  game_name: string;
  nickname: string | null;
  session_id: string | null;
  device_type: string | null;
  ip_address: string | null;
  completed_status: string;
  start_date: string;
  start_time: string;
  created_at: string;
};

type GameAction = {
  id: string;
  action_type: string;
  detail: string | null;
  created_at: string;
};

type IpInfo = {
  city: string | null;
  region: string | null;
  country: string | null;
  isp: string | null;
  org: string | null;
  asn: string | null;
  type: string | null;
};

const ipInfoCache = new Map<string, IpInfo | null>();

/**
 * Look up the city / country, ISP and network info for a recorded IP address
 * via the free ipwho.is service. Cached, time-boxed and fail-soft so a slow or
 * failed lookup never blocks the log screen.
 */
async function fetchIpInfo(ip: string): Promise<IpInfo | null> {
  const cached = ipInfoCache.get(ip);
  if (cached !== undefined) return cached;
  const fail = (): IpInfo | null => {
    ipInfoCache.set(ip, null);
    return null;
  };
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return fail();
    const data = (await res.json()) as {
      success?: boolean;
      type?: string;
      city?: string;
      region?: string;
      country?: string;
      connection?: { isp?: string; org?: string; asn?: number };
    };
    if (!data.success) return fail();
    const info: IpInfo = {
      city: data.city ?? null,
      region: data.region ?? null,
      country: data.country ?? null,
      isp: data.connection?.isp ?? data.connection?.org ?? null,
      org: data.connection?.org ?? null,
      asn: data.connection?.asn != null ? `AS${data.connection.asn}` : null,
      type: data.type ?? null,
    };
    ipInfoCache.set(ip, info);
    return info;
  } catch {
    return fail();
  }
}

export const Route = createFileRoute("/games-log")({
  head: () => ({
    meta: [{ title: "Game Log — Cards and Games (Dev)" }],
  }),
  component: GamesLogPage,
});

/** Developer-only replay of every started game and its recorded actions. */
function GamesLogPage() {
  const isDev = useDeveloperMode();
  const [games, setGames] = useState<StartedGame[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [actions, setActions] = useState<GameAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);
  const [ipLoading, setIpLoading] = useState(false);

  useEffect(() => {
    if (!isDev) return;
    void supabase
      .from("games_started")
      .select("id, game_name, nickname, session_id, device_type, ip_address, completed_status, start_date, start_time, created_at")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setGames((data as StartedGame[]) ?? []);
      });
  }, [isDev]);

  useEffect(() => {
    if (!selected) {
      setActions(null);
      return;
    }
    setActions(null);
    void supabase
      .from("game_actions")
      .select("id, action_type, detail, created_at")
      .eq("game_started_id", selected)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setActions((data as GameAction[]) ?? []);
      });
  }, [selected]);

  useEffect(() => {
    const ip = games?.find((g) => g.id === selected)?.ip_address ?? null;
    if (!ip) {
      setIpInfo(null);
      setIpLoading(false);
      return;
    }
    let cancelled = false;
    setIpLoading(true);
    void fetchIpInfo(ip).then((info) => {
      if (!cancelled) {
        setIpInfo(info);
        setIpLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [games, selected]);

  if (!isDev) {
    return (
      <div className="min-h-screen text-cream">
        <div className="mx-auto max-w-xl px-6 pt-24 text-center">
          <h1 className="font-display text-3xl font-bold">Developer access required</h1>
          <p className="mt-3 text-ivory/60">
            Enable Developer Mode from the home page first.
          </p>
          <Link to="/" className="mt-6 inline-block text-gold transition-colors hover:text-gold-bright">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  const selectedGame = games?.find((g) => g.id === selected) ?? null;

  const locationText = ipInfo
    ? [ipInfo.city, ipInfo.region, ipInfo.country].filter(Boolean).join(", ") || "—"
    : "—";
  const networkText = ipInfo
    ? [ipInfo.asn, ipInfo.type].filter(Boolean).join(" · ") || "—"
    : "—";

  const allChecked = games !== null && games.length > 0 && checked.size === games.length;
  const someChecked = checked.size > 0 && !allChecked;

  const toggleChecked = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!games) return;
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(games.map((g) => g.id)));
  };

  const deleteSelected = async () => {
    if (checked.size === 0) return;
    setDeleting(true);
    setError(null);
    const ids = [...checked];
    // Remove actions explicitly first, then the games. The FK's ON DELETE
    // CASCADE also covers actions, so a missing game_actions table never blocks
    // deleting the game rows themselves.
    await supabase.from("game_actions").delete().in("game_started_id", ids);
    const { data, error } = await supabase
      .from("games_started")
      .delete()
      .in("id", ids)
      .select("id");
    if (error) {
      setError(`Delete failed: ${error.message}`);
    } else if (!data || data.length < ids.length) {
      // Row-level security silently blocks a DELETE (0 rows, no error). If fewer
      // rows come back than we asked to remove, the delete policy is missing on
      // the live database, so surface that instead of pretending it worked.
      setError(
        `Delete blocked: ${data?.length ?? 0} of ${ids.length} rows were removed. ` +
          `Apply migration 20261008000000_add_game_actions.sql to the database — ` +
          `the "Anyone can delete a started game" policy is missing.`,
      );
    } else {
      setGames((prev) => (prev ? prev.filter((g) => !checked.has(g.id)) : prev));
      setChecked(new Set());
      if (selected && checked.has(selected)) {
        setSelected(null);
        setActions(null);
      }
    }
    setDeleting(false);
  };

  return (
    <div className="min-h-screen text-cream">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              aria-label="Cards and Games home"
              className="grid size-10 place-items-center rounded-full bg-gold text-brand transition-colors hover:bg-gold-bright"
            >
              <CardMark className="size-5" />
            </Link>
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-gold">Developer tools</p>
              <h1 className="font-display text-2xl font-bold leading-tight">Game Log</h1>
            </div>
          </div>
          <Link
            to="/"
            className="text-xs uppercase tracking-[0.2em] text-ivory/50 transition-colors hover:text-gold"
          >
            Home
          </Link>
        </header>

        {error && (
          <p className="mb-4 rounded-lg border border-red-400/30 bg-red-900/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-4 md:flex-row">
          <aside className="md:w-1/3 md:shrink-0">
            <div className="rounded-2xl border border-gold/20 bg-surface/20 p-2">
              <h2 className="px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-gold/60">
                Games started
              </h2>
              <label className="flex items-center gap-2 border-b border-gold/15 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  className="size-4 shrink-0 accent-gold"
                  aria-label="Select all games"
                />
                <span className="text-[11px] uppercase tracking-[0.2em] text-gold/60">
                  {checked.size > 0 ? `${checked.size} selected` : "Select all"}
                </span>
              </label>
              <div className="max-h-[70vh] overflow-y-auto">
                {games === null ? (
                  <p className="px-3 py-6 text-center text-sm text-ivory/40">Loading…</p>
                ) : games.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-ivory/40">No games yet.</p>
                ) : (
                  games.map((g) => (
                    <div
                      key={g.id}
                      className={`flex items-start gap-2 rounded-xl px-2 py-2 transition-colors ${
                        selected === g.id ? "bg-gold/20" : "hover:bg-gold/10"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(g.id)}
                        onChange={() => toggleChecked(g.id)}
                        className="mt-1 size-4 shrink-0 accent-gold"
                        aria-label={`Select ${g.game_name}`}
                      />
                      <button
                        type="button"
                        onClick={() => setSelected(g.id)}
                        className={`min-w-0 flex-1 text-left ${
                          selected === g.id ? "text-cream" : "text-ivory/70"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{g.game_name}</span>
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-ivory/40">
                            {g.device_type ?? "?"}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-ivory/45">
                          {formatWhen(g.created_at)} · {g.nickname ?? "anon"} · {g.completed_status}
                        </div>
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-gold/20 p-2">
                <button
                  type="button"
                  onClick={() => void deleteSelected()}
                  disabled={checked.size === 0 || deleting}
                  className="w-full rounded-lg bg-red-900/30 px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deleting ? "Deleting…" : `Delete selected (${checked.size})`}
                </button>
              </div>
            </div>
          </aside>

          <section className="flex-1">
            {selectedGame && (
              <div className="mb-4 rounded-2xl border border-gold/20 bg-surface/20 p-4">
                <h2 className="mb-3 text-[11px] uppercase tracking-[0.2em] text-gold/60">
                  Game details
                </h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                  <Detail label="ID" value={selectedGame.id} />
                  <Detail label="Game" value={selectedGame.game_name} />
                  <Detail label="Nickname" value={selectedGame.nickname ?? "—"} />
                  <Detail label="Session" value={selectedGame.session_id ?? "—"} />
                  <Detail label="Status" value={selectedGame.completed_status} />
                  <Detail label="Device" value={selectedGame.device_type ?? "—"} />
                  <Detail label="IP address" value={selectedGame.ip_address ?? "—"} />
                  <Detail label="Location" value={ipLoading ? "Looking up…" : locationText} />
                  <Detail label="ISP" value={ipLoading ? "…" : ipInfo?.isp ?? "—"} />
                  <Detail label="Network" value={ipLoading ? "…" : networkText} />
                  <Detail label="Start date" value={selectedGame.start_date ?? "—"} />
                  <Detail label="Start time" value={selectedGame.start_time ?? "—"} />
                  <Detail label="Created" value={formatWhen(selectedGame.created_at)} />
                </dl>
              </div>
            )}
            <div className="rounded-2xl border border-gold/20 bg-surface/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-gold/60">Actions</h2>
                {selectedGame && (
                  <div className="truncate text-right text-[11px] text-ivory/40">
                    {selectedGame.ip_address ?? "no IP"} · {selectedGame.nickname ?? "anon"}
                  </div>
                )}
              </div>
              {selected === null ? (
                <p className="py-10 text-center text-sm text-ivory/40">
                  Select a game to view its actions.
                </p>
              ) : actions === null ? (
                <p className="py-10 text-center text-sm text-ivory/40">Loading…</p>
              ) : actions.length === 0 ? (
                <p className="py-10 text-center text-sm text-ivory/40">No actions recorded.</p>
              ) : (
                <ul className="space-y-1">
                  {actions.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 hover:bg-gold/5"
                    >
                      <span className="shrink-0 text-[11px] tabular-nums text-ivory/35">
                        {formatTime(a.created_at)}
                      </span>
                      <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold">
                        {a.action_type}
                      </span>
                      {a.detail && <span className="text-sm text-ivory/70">{a.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ivory/40">{label}</dt>
      <dd className="break-all text-sm text-ivory/80">{value}</dd>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
