import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { GameId } from "@/lib/games";
import { recordMatchResult } from "@/lib/stats";
import { recordDisconnect } from "@/lib/medals";
import { readAvatar } from "@/lib/avatars";
import { logConnectionError } from "@/lib/connection-errors";

export const NICKNAME_KEY = "green-cardroom-nickname";
export const SESSION_KEY = "green-cardroom-session";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function getNickname(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(NICKNAME_KEY);
}

export function setNickname(value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NICKNAME_KEY, value);
}

export type InviteStatus = "pending" | "accepted" | "declined" | "cancelled";

export type InviteRow = {
  id: string;
  game: string;
  from_session: string;
  from_nickname: string;
  from_avatar: string | null;
  to_session: string;
  to_nickname: string;
  status: string;
  match_id: string | null;
  created_at: string;
};

export type MatchRow = {
  id: string;
  game: string;
  host_session: string;
  host_nickname: string;
  host_avatar: string | null;
  guest_session: string;
  guest_nickname: string;
  guest_avatar: string | null;
  state: unknown;
  version: number;
  status: string;
  updated_at: string;
};

/**
 * Identifies a single write to a shared table row: its version plus the moment
 * it was written. A row is only skipped when it matches a write we have already
 * seen — our own echo, or a repeated delivery of the row we just applied.
 *
 * The version on its own is not enough: a client that missed an update writes a
 * *lower* version from its own counter, and the writes that do not touch the
 * game state (the "completed" result recorded when somebody leaves, for
 * instance) keep the previous version. Comparing versions alone discarded both,
 * leaving the other player's table frozen mid-turn with their opponent's move,
 * score and the end of the match never arriving.
 */
export function matchRowWriteKey(row: { version: number; updated_at: string }): string {
  return `${row.version}|${Date.parse(row.updated_at)}`;
}

const INVITE_COLUMNS =
  "id, game, from_session, from_nickname, from_avatar, to_session, to_nickname, status, match_id, created_at";

/** Invites older than this are treated as expired. */
export const INVITE_TTL_MS = 60_000;

/** Seconds a live opponent is given to reconnect before the match is awarded. */
export const RECONNECT_SECONDS = 10;

/** Seconds a player has to take their turn in a live multiplayer match. */
export const TURN_SECONDS = 180;

/** When the turn clock drops to this many seconds, the countdown is shown on the avatar. */
export const TURN_WARNING_SECONDS = 20;

export async function sendInvite(params: {
  game: GameId;
  fromNickname: string;
  toSession: string;
  toNickname: string;
}): Promise<InviteRow | null> {
  const { data, error } = await supabase
    .from("match_invites")
    .insert({
      game: params.game,
      from_session: getSessionId(),
      from_nickname: params.fromNickname,
      from_avatar: readAvatar(),
      to_session: params.toSession,
      to_nickname: params.toNickname,
    })
    .select(INVITE_COLUMNS)
    .single();

  if (error) {
    console.error("[multiplayer] sendInvite failed:", error);
    logConnectionError("send_invite", error, {
      game: params.game,
      to_session: params.toSession,
      to_nickname: params.toNickname,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message);
  }

  return (data as InviteRow | null) ?? null;
}

export async function setInviteStatus(id: string, status: InviteStatus) {
  await supabase.from("match_invites").update({ status }).eq("id", id);
}

/** The invitee opens the shared table; the inviter becomes the host seat. */
export async function acceptInvite(
  invite: InviteRow,
  myNickname: string,
): Promise<MatchRow | null> {
  const { data, error } = await supabase
    .from("matches")
    .insert({
      game: invite.game,
      host_session: invite.from_session,
      host_nickname: invite.from_nickname,
      host_avatar: invite.from_avatar ?? null,
      guest_session: getSessionId(),
      guest_nickname: myNickname,
      guest_avatar: readAvatar(),
      state: null,
      version: 0,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[multiplayer] acceptInvite failed:", error);
    logConnectionError("accept_invite", error, {
      game: invite.game,
      from_session: invite.from_session,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message);
  }

  if (!data) return null;
  const match = data as MatchRow;
  await supabase
    .from("match_invites")
    .update({ status: "accepted", match_id: match.id })
    .eq("id", invite.id);
  return match;
}

export async function fetchIncomingInvites(game: GameId): Promise<InviteRow[]> {
  const cutoff = new Date(Date.now() - INVITE_TTL_MS).toISOString();
  const { data } = await supabase
    .from("match_invites")
    .select(INVITE_COLUMNS)
    .eq("game", game)
    .eq("to_session", getSessionId())
    .eq("status", "pending")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });
  return (data ?? []) as InviteRow[];
}

export async function fetchInvite(id: string): Promise<InviteRow | null> {
  const { data } = await supabase
    .from("match_invites")
    .select(INVITE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as InviteRow | null) ?? null;
}

/**
 * Shared-state hook for a live two-player table. Both devices read the same row;
 * the host's orientation is canonical and the guest mirrors it locally.
 */
export function useMatch<T>(matchId: string | undefined, gameOver = false) {
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [loading, setLoading] = useState(Boolean(matchId));
  const version = useRef(0);
  const navigate = useNavigate();

  // Opponent presence / disconnection tracking.
  const [opponentOnline, setOpponentOnline] = useState(true);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(RECONNECT_SECONDS);
  const [disconnectExpired, setDisconnectExpired] = useState(false);
  const seenOpponentRef = useRef(false);
  const expiredRef = useRef(false);
  // Tracks whether we have already logged the current disconnect episode, so a
  // flapping presence channel doesn't flood the email log with one report per
  // sync/leave event.
  const loggedDisconnectRef = useRef(false);
  // Every write we have made to the shared row, and every row we have adopted, so
  // an echo of our own update (or a repeated delivery) can be told apart from a
  // genuine update from the other player. These are sets, not single slots: a
  // player can fire two shots back-to-back (a hit keeps the turn), and the echo
  // of the first shot would otherwise no longer match the "last write" and be
  // adopted, reverting the second shot's optimistic state.
  const myWriteKeysRef = useRef<Set<string>>(new Set());
  const appliedKeysRef = useRef<Set<string>>(new Set());
  // Set by the presence effect: called when the other player's client has just
  // written to the shared row, which proves it is still at the table.
  const noteOpponentActivityRef = useRef<() => void>(() => {});

  // True once we have adopted a non-completed row for this match, i.e. we were
  // actually seated at the table playing it. Distinguishes a match that just
  // finished (leave the final score on screen for a rematch) from a returning
  // URL to a match that was already over (redirect home).
  const sawActiveMatchRef = useRef(false);

  useEffect(() => {
    if (!matchId) {
      setMatch(null);
      setLoading(false);
      return;
    }
    let live = true;
    version.current = 0;
    myWriteKeysRef.current = new Set();
    appliedKeysRef.current = new Set();
    sawActiveMatchRef.current = false;
    setLoading(true);

    /**
     * Adopt a row from the shared table. Everything the other player writes has
     * to be adopted, even when its version is not higher than ours: a client
     * that missed an update writes a lower version from its own counter, and a
     * result write ("completed") does not move the version at all. Dropping
     * those rows used to leave one player's table frozen — the opponent's throw,
     * their score on the shared scorecard and the end of the game never arrived,
     * with no disconnection shown because the table was still "connected".
     */
    const applyRow = (row: MatchRow) => {
      if (!live) return;
      const key = matchRowWriteKey(row);
      if (myWriteKeysRef.current.has(key) || appliedKeysRef.current.has(key)) return;
      appliedKeysRef.current.add(key);
      version.current = Math.max(version.current, row.version);
      if (row.status !== "completed") sawActiveMatchRef.current = true;
      setMatch(row);
      // The other client reached the server, so it has not walked away: cancel
      // any reconnect countdown that a presence blip started (a backgrounded or
      // suspended mobile tab being the usual false alarm).
      noteOpponentActivityRef.current();
    };

    const readRow = async () => {
      try {
        const { data } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
        if (!live || !data) return;
        applyRow(data as MatchRow);
      } catch (error) {
        // A dropped connection is not fatal: the next poll (or the tab waking
        // up) fetches the row again, so never let it reject unhandled.
        console.error("[multiplayer] read match failed:", error);
      }
    };

    void (async () => {
      await readRow();
      if (live) setLoading(false);
    })();

    const channel = supabase
      .channel(`match-${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        (payload) => applyRow(payload.new as MatchRow),
      )
      .subscribe();

    const poll = window.setInterval(() => void readRow(), 2_500);

    // Mobile browsers freeze timers and drop the realtime socket while a tab is
    // hidden, so catch up the moment it is visible again (or the network comes
    // back) instead of waiting for the next poll.
    const onWake = () => {
      if (document.visibilityState === "visible") void readRow();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    return () => {
      live = false;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      void supabase.removeChannel(channel);
    };
  }, [matchId]);

  const publish = useCallback(
    async (state: T) => {
      if (!matchId) return;
      const next = version.current + 1;
      version.current = next;
      const updatedAt = new Date().toISOString();
      // Remember this write so the realtime/poll echo of it is recognised as
      // ours. Note: we intentionally do NOT optimistically setMatch here — we
      // leave `match` untouched so the remote-state receive effect (which
      // depends on `match.version` / `remoteState`) does not fire for our own
      // move. If it did, a guest's mirrored state would be re-mirrored into a
      // fresh object and re-render the board mid-animation, cancelling the
      // piece fly.
      myWriteKeysRef.current.add(matchRowWriteKey({ version: next, updated_at: updatedAt }));
      await supabase
        .from("matches")
        .update({
          state: state as unknown as never,
          version: next,
          updated_at: updatedAt,
        })
        .eq("id", matchId);
    },
    [matchId],
  );

  const sessionId = typeof window === "undefined" ? "" : getSessionId();
  const isHost = Boolean(match && match.host_session === sessionId);
  const opponentName = match ? (isHost ? match.guest_nickname : match.host_nickname) : null;
  const opponentSession = match ? (isHost ? match.guest_session : match.host_session) : null;
  const opponentAvatar = match ? (isHost ? match.guest_avatar : match.host_avatar) : null;
  // Keep the final state visible even after the match is marked completed so a
  // rematch negotiated from the game-over screen can still sync across seats.
  // A finished match is still not resumable: the redirect effect below bounces
  // a returning URL home before it can resurrect the final-score screen.
  const remoteState = (match?.state ?? null) as T | null;

  // Track the opponent's live connection through a Realtime presence channel so a
  // dropped peer can be detected and given a short window to reconnect.
  useEffect(() => {
    if (!matchId || !opponentSession || gameOver) return;
    const mySession = sessionId || getSessionId();

    const markOnline = () => {
      if (expiredRef.current) return;
      seenOpponentRef.current = true;
      // If we had reported the opponent offline and they came back, log the
      // recovery so a transient "player disconnected" false alarm is visible in
      // the email report (rather than only the final forfeit being logged).
      if (loggedDisconnectRef.current) {
        loggedDisconnectRef.current = false;
        logConnectionError("opponent_reconnect", new Error("opponent presence restored"), {
          match_id: matchId,
          opponent_session: opponentSession,
          my_session: mySession,
        });
      }
      setOpponentOnline(true);
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(RECONNECT_SECONDS);
    };
    const markOffline = () => {
      if (!seenOpponentRef.current || expiredRef.current) return;
      setOpponentOnline(false);
      setOpponentDisconnected(true);
      // Log the first transition of a disconnect episode so the moment the
      // "Player has disconnected!" dialog appears is captured, even when the
      // opponent was never really gone.
      if (!loggedDisconnectRef.current) {
        loggedDisconnectRef.current = true;
        logConnectionError("opponent_disconnect", new Error("opponent presence lost"), {
          match_id: matchId,
          opponent_session: opponentSession,
          my_session: mySession,
        });
      }
    };

    // Proof of life from the shared row: the opponent's client has just written
    // to the server, so any reconnect countdown in flight was a false alarm.
    // Unlike a presence sighting this does not arm the disconnect detection by
    // itself — presence is still what tells us the opponent has left the table,
    // so a player whose presence entry is missing while their moves keep landing
    // is never mistaken for a leaver.
    const noteOpponentActivity = () => {
      if (expiredRef.current) return;
      if (loggedDisconnectRef.current) {
        loggedDisconnectRef.current = false;
        logConnectionError("opponent_reconnect", new Error("opponent activity resumed"), {
          match_id: matchId,
          opponent_session: opponentSession,
          my_session: mySession,
        });
      }
      setOpponentOnline(true);
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(RECONNECT_SECONDS);
    };
    noteOpponentActivityRef.current = noteOpponentActivity;

    const channel = supabase
      .channel(`match-presence-${matchId}`, {
        config: { presence: { key: mySession } },
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        if (state[opponentSession] && state[opponentSession].length > 0) markOnline();
        else if (seenOpponentRef.current) markOffline();
      })
      .on("presence", { event: "join" }, ({ key }) => {
        if (key === opponentSession) markOnline();
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (key === opponentSession) markOffline();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ online_at: new Date().toISOString() });
      });

    // A hidden mobile tab loses its presence entry (and its socket), so announce
    // ourselves again the moment the tab is visible: without this the opponent
    // awards themselves a forfeit against a player who never actually left.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void channel.track({ online_at: new Date().toISOString() });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      noteOpponentActivityRef.current = () => {};
      void supabase.removeChannel(channel);
    };
  }, [matchId, opponentSession, sessionId, gameOver]);

  // Count the reconnect window down; when it reaches zero the match is awarded
  // to the player who stayed connected.
  useEffect(() => {
    if (!opponentDisconnected || gameOver) return;
    if (disconnectSecondsLeft <= 0) {
      expiredRef.current = true;
      setDisconnectExpired(true);
      setOpponentDisconnected(false);
      return;
    }
    const timer = setTimeout(() => setDisconnectSecondsLeft((s) => s - 1), 1_000);
    return () => clearTimeout(timer);
  }, [opponentDisconnected, disconnectSecondsLeft, gameOver]);

  // Record a forfeit when the opponent fails to reconnect: the player who
  // stayed connected wins and the leaver is counted as a loss.
  useEffect(() => {
    if (!disconnectExpired || !matchId || !sessionId || gameOver) return;
    logConnectionError("realtime_disconnect", new Error("opponent failed to reconnect"), {
      match_id: matchId,
    });
    void recordMatchResult(matchId, sessionId);
    // A forfeit means the leaver abandoned the table mid-game: drop their medal
    // one tier. A match that already completed normally is not a forfeit, so
    // leave the other player's streak untouched.
    if (opponentSession && match?.status !== "completed") {
      void recordDisconnect(opponentSession);
    }
  }, [disconnectExpired, matchId, sessionId, gameOver, opponentSession, match?.status]);

  // Once the game is over (a winner is decided) the disconnect/forfeit flow no
  // longer applies: clear any in-flight disconnect state so a player who simply
  // declines a rematch and leaves the table isn't miscounted as a forfeit.
  useEffect(() => {
    if (!gameOver) return;
    expiredRef.current = false;
    // A rematch starts a fresh game on the same match row. Forget that we ever
    // saw the opponent so the presence channel that is re-subscribed once the
    // game resumes doesn't treat the brief window before the opponent re-tracks
    // as a fresh "player disconnected" episode.
    seenOpponentRef.current = false;
    setOpponentDisconnected(false);
    setDisconnectExpired(false);
    setDisconnectSecondsLeft(RECONNECT_SECONDS);
  }, [gameOver]);

  // Once a match has finished there is no way back into it: a returning URL
  // still pointing at the finished match is redirected home instead of
  // re-opening the completed table. This must NOT fire when the match the
  // player is currently at finishes — that would bounce them to the room before
  // they have seen the final score or had a chance to rematch. `sawActiveMatchRef`
  // is true once we have adopted a non-completed row (we were seated here
  // playing), so only a genuinely fresh load of an already-finished match is
  // sent home.
  useEffect(() => {
    if (matchId && match?.status === "completed" && !sawActiveMatchRef.current) {
      void navigate({ to: "/" });
    }
  }, [matchId, match?.status, navigate]);

  return {
    match,
    loading,
    isHost,
    opponentName,
    opponentAvatar,
    opponentOnline,
    opponentDisconnected,
    disconnectSecondsLeft,
    disconnectExpired,
    remoteState,
    publish,
  };
}

/**
 * Counts down a per-turn clock in a live multiplayer table. The clock resets to
 * `TURN_SECONDS` whenever `turn` changes or the timer becomes enabled, then
 * ticks down once a second. When it reaches zero, `onTimeout` fires exactly once
 * so the caller can award the match to the player who did not run out of time.
 *
 * Returns the number of seconds remaining, so callers can surface the last
 * `TURN_WARNING_SECONDS` on the active player's avatar.
 */
export function useTurnTimer({
  enabled,
  turn,
  onTimeout,
}: {
  /** Whether the clock should be running right now (live game, someone's turn). */
  enabled: boolean;
  /** Identifies the current turn; the clock resets whenever this changes. */
  turn: string;
  /** Called once when the clock reaches zero. */
  onTimeout: () => void;
}): number {
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const timedOutRef = useRef(false);

  useEffect(() => {
    timedOutRef.current = false;
    setSecondsLeft(TURN_SECONDS);
  }, [enabled, turn]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      setSecondsLeft((seconds) => {
        if (seconds <= 1) {
          clearInterval(id);
          if (!timedOutRef.current) {
            timedOutRef.current = true;
            onTimeoutRef.current();
          }
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, turn]);

  return secondsLeft;
}
