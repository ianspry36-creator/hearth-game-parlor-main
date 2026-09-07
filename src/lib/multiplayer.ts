import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameId } from "@/lib/games";
import { recordMatchResult } from "@/lib/stats";

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

export type InviteStatus = "pending" | "accepted" | "declined" | "cancelled";

export type InviteRow = {
  id: string;
  game: string;
  from_session: string;
  from_nickname: string;
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
  guest_session: string;
  guest_nickname: string;
  state: unknown;
  version: number;
  status: string;
};

const INVITE_COLUMNS =
  "id, game, from_session, from_nickname, to_session, to_nickname, status, match_id, created_at";

/** Invites older than this are treated as expired. */
export const INVITE_TTL_MS = 60_000;

/** Seconds a live opponent is given to reconnect before the match is awarded. */
export const RECONNECT_SECONDS = 10;

export async function sendInvite(params: {
  game: GameId;
  fromNickname: string;
  toSession: string;
  toNickname: string;
}): Promise<InviteRow | null> {
  const { data } = await supabase
    .from("match_invites")
    .insert({
      game: params.game,
      from_session: getSessionId(),
      from_nickname: params.fromNickname,
      to_session: params.toSession,
      to_nickname: params.toNickname,
    })
    .select(INVITE_COLUMNS)
    .single();
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
  const { data } = await supabase
    .from("matches")
    .insert({
      game: invite.game,
      host_session: invite.from_session,
      host_nickname: invite.from_nickname,
      guest_session: getSessionId(),
      guest_nickname: myNickname,
      state: null,
      version: 0,
    })
    .select("*")
    .single();
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
export function useMatch<T>(matchId: string | undefined) {
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [loading, setLoading] = useState(Boolean(matchId));
  const version = useRef(0);

  // Opponent presence / disconnection tracking.
  const [opponentOnline, setOpponentOnline] = useState(true);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(RECONNECT_SECONDS);
  const [disconnectExpired, setDisconnectExpired] = useState(false);
  const seenOpponentRef = useRef(false);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!matchId) {
      setMatch(null);
      setLoading(false);
      return;
    }
    let live = true;
    version.current = 0;
    setLoading(true);
    void (async () => {
      const { data } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
      if (!live) return;
      if (data) {
        const row = data as MatchRow;
        version.current = row.version;
        setMatch(row);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel(`match-${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as MatchRow;
          if (row.version < version.current) return;
          version.current = row.version;
          setMatch(row);
        },
      )
      .subscribe();

    const poll = window.setInterval(() => {
      void (async () => {
        const { data } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
        if (!data) return;
        const row = data as MatchRow;
        if (row.version < version.current) return;
        version.current = row.version;
        setMatch(row);
      })();
    }, 2_500);

    return () => {
      live = false;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [matchId]);

  const publish = useCallback(
    async (state: T) => {
      if (!matchId) return;
      const next = version.current + 1;
      version.current = next;
      setMatch((current) =>
        current ? { ...current, state: state as unknown, version: next } : current,
      );
      await supabase
        .from("matches")
        .update({
          state: state as unknown as never,
          version: next,
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchId);
    },
    [matchId],
  );

  const sessionId = typeof window === "undefined" ? "" : getSessionId();
  const isHost = Boolean(match && match.host_session === sessionId);
  const opponentName = match ? (isHost ? match.guest_nickname : match.host_nickname) : null;
  const opponentSession = match ? (isHost ? match.guest_session : match.host_session) : null;
  const remoteState = (match?.state ?? null) as T | null;

  // Track the opponent's live connection through a Realtime presence channel so a
  // dropped peer can be detected and given a short window to reconnect.
  useEffect(() => {
    if (!matchId || !opponentSession) return;
    const mySession = sessionId || getSessionId();

    const markOnline = () => {
      if (expiredRef.current) return;
      seenOpponentRef.current = true;
      setOpponentOnline(true);
      setOpponentDisconnected(false);
      setDisconnectSecondsLeft(RECONNECT_SECONDS);
    };
    const markOffline = () => {
      if (!seenOpponentRef.current || expiredRef.current) return;
      setOpponentOnline(false);
      setOpponentDisconnected(true);
    };

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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [matchId, opponentSession, sessionId]);

  // Count the reconnect window down; when it reaches zero the match is awarded
  // to the player who stayed connected.
  useEffect(() => {
    if (!opponentDisconnected) return;
    if (disconnectSecondsLeft <= 0) {
      expiredRef.current = true;
      setDisconnectExpired(true);
      setOpponentDisconnected(false);
      return;
    }
    const timer = setTimeout(() => setDisconnectSecondsLeft((s) => s - 1), 1_000);
    return () => clearTimeout(timer);
  }, [opponentDisconnected, disconnectSecondsLeft]);

  // Record a forfeit when the opponent fails to reconnect: the player who
  // stayed connected wins and the leaver is counted as a loss.
  useEffect(() => {
    if (!disconnectExpired || !matchId || !sessionId) return;
    void recordMatchResult(matchId, sessionId);
  }, [disconnectExpired, matchId, sessionId]);

  return {
    match,
    loading,
    isHost,
    opponentName,
    opponentOnline,
    opponentDisconnected,
    disconnectSecondsLeft,
    disconnectExpired,
    remoteState,
    publish,
  };
}
