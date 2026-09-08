import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { GameMeta } from "@/lib/games";
import type { ReactNode } from "react";
import {
  NICKNAME_KEY,
  acceptInvite,
  fetchIncomingInvites,
  fetchInvite,
  getSessionId,
  sendInvite,
  setInviteStatus,
  type InviteRow,
} from "@/lib/multiplayer";
import {
  INAPPROPRIATE_NAME_MESSAGE,
  MAX_NICKNAME_LENGTH,
  NICKNAME_TOO_LONG_MESSAGE,
} from "@/lib/nickname";
import { moderateNickname } from "@/lib/moderation";
import { readAvatar } from "@/lib/avatars";

/** Players not seen for this long are treated as having left the room. */
const STALE_MS = 45_000;
const REFRESH_MS = 3_000;
const HEARTBEAT_MS = 15_000;

type WaitingPlayer = {
  id: string;
  session_id: string;
  nickname: string;
  avatar: string | null;
  last_seen_at: string;
};

export function useNickname() {
  const [nickname, setNickname] = useState<string | null>(null);
  useEffect(() => {
    setNickname(window.localStorage.getItem(NICKNAME_KEY));
  }, []);
  const save = (value: string) => {
    window.localStorage.setItem(NICKNAME_KEY, value);
    setNickname(value);
  };
  return { nickname, save };
}

function waitingLabel(lastSeen: string, createdFallback: string) {
  const started = new Date(createdFallback || lastSeen).getTime();
  const minutes = Math.floor((Date.now() - started) / 60_000);
  if (minutes < 1) return "just now";
  return `${minutes} min`;
}

export function WaitingRoom({
  game,
  trigger,
  onMatched,
  open: openProp,
  onOpenChange,
}: {
  game: GameMeta;
  trigger?: ReactNode;
  onMatched?: (opponent: string, matchId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { nickname, save } = useNickname();
  const [draft, setDraft] = useState("");
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<WaitingPlayer[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [outgoing, setOutgoing] = useState<InviteRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entryId = useRef<string | null>(null);

  useEffect(() => {
    if (open && nickname) setDraft(nickname);
  }, [open, nickname]);

  const refresh = useCallback(async () => {
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
    const { data, error: queryError } = await supabase
      .from("waiting_players")
      .select("id, session_id, nickname, avatar, last_seen_at, created_at")
      .eq("game", game.id)
      .gte("last_seen_at", cutoff)
      .order("created_at", { ascending: true });
    if (queryError) {
      setError("Could not reach the waiting room.");
      return;
    }
    setError(null);
    setPlayers((data ?? []) as WaitingPlayer[]);
    setInvites(await fetchIncomingInvites(game.id));
  }, [game.id]);

  const leave = useCallback(async () => {
    const id = entryId.current;
    entryId.current = null;
    setJoined(false);
    setInvites([]);
    if (id) await supabase.from("waiting_players").delete().eq("id", id);
  }, []);

  const enterMatch = useCallback(
    (opponentName: string, matchId: string) => {
      setOutgoing(null);
      setOpen(false);
      void leave();
      onMatched?.(opponentName, matchId);
    },
    [leave, onMatched],
  );

  // Poll the room while the dialog is open, plus live updates as players come and go.
  useEffect(() => {
    if (!open) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_MS);
    const channel = supabase
      .channel(`waiting-room-${game.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waiting_players" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_invites" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [open, game.id, refresh]);

  // Watch an invitation we sent: when it is accepted we join the shared table.
  useEffect(() => {
    if (!outgoing) return;
    const check = async () => {
      const row = await fetchInvite(outgoing.id);
      if (!row) return;
      if (row.status === "accepted" && row.match_id) {
        enterMatch(row.to_nickname, row.match_id);
        return;
      }
      if (row.status === "declined") {
        setOutgoing(null);
        setError(`${row.to_nickname} declined the invitation.`);
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 2_000);
    return () => window.clearInterval(interval);
  }, [outgoing, enterMatch]);

  // Keep our own entry alive while we sit in the room.
  useEffect(() => {
    if (!joined || !open) return;
    const interval = window.setInterval(() => {
      const id = entryId.current;
      if (!id) return;
      void supabase
        .from("waiting_players")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", id);
    }, HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [joined, open]);

  const join = async (value: string) => {
    setLoading(true);
    setError(null);
    const { data, error: upsertError } = await supabase
      .from("waiting_players")
      .upsert(
        {
          session_id: getSessionId(),
          game: game.id,
          nickname: value,
          avatar: readAvatar(),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "session_id,game" },
      )
      .select("id")
      .single();
    setLoading(false);
    if (upsertError || !data) {
      setError("Could not join the waiting room. Try again.");
      return;
    }
    entryId.current = data.id;
    setJoined(true);
    void refresh();
  };

  const submitNickname = async (value: string) => {
    setLoading(true);
    setError(null);
    if (value.length > MAX_NICKNAME_LENGTH) {
      setLoading(false);
      setError(NICKNAME_TOO_LONG_MESSAGE);
      return;
    }
    const result = await moderateNickname(value);
    if (!result.allowed) {
      setLoading(false);
      setError(INAPPROPRIATE_NAME_MESSAGE);
      return;
    }
    save(value);
    void join(value);
  };

  const invitePlayer = async (player: WaitingPlayer) => {
    setError(null);
    const invite = await sendInvite({
      game: game.id,
      fromNickname: nickname ?? "Guest",
      toSession: player.session_id,
      toNickname: player.nickname,
    });
    if (!invite) {
      setError("Could not send the invitation. Try again.");
      return;
    }
    setOutgoing(invite);
  };

  const accept = async (invite: InviteRow) => {
    setError(null);
    const match = await acceptInvite(invite, nickname ?? "Guest");
    if (!match) {
      setError("Could not open the table. Try again.");
      return;
    }
    enterMatch(invite.from_nickname, match.id);
  };

  const decline = async (invite: InviteRow) => {
    await setInviteStatus(invite.id, "declined");
    setInvites((current) => current.filter((row) => row.id !== invite.id));
  };

  const mySession = typeof window === "undefined" ? "" : getSessionId();
  const others = players.filter((player) => player.session_id !== mySession);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          if (outgoing) void setInviteStatus(outgoing.id, "cancelled");
          setOutgoing(null);
          void leave();
        }
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="border-gold/25 bg-surface sm:max-w-md">
        <DialogHeader>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">
            {game.name} · waiting room
          </p>
          <DialogTitle className="font-display text-3xl font-bold">
            {joined ? "Waiting to play" : "Your name at the table"}
          </DialogTitle>
          <DialogDescription className="text-ivory/70">
            {joined
              ? "Real players only — invite someone and play them live once they accept."
              : "Enter a nickname before you join the room."}
          </DialogDescription>
        </DialogHeader>

        {!joined ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const value = draft.trim();
              if (!value) return;
              void submitNickname(value);
            }}
          >
            <div>
              <label
                htmlFor="nickname"
                className="mb-2 block text-[11px] font-medium uppercase tracking-[0.22em] text-ivory/70"
              >
                Nickname
              </label>
              <Input
                id="nickname"
                value={draft}
                maxLength={MAX_NICKNAME_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="e.g. Cardboard Jack"
                className="border-gold/30 bg-brand/60 text-cream placeholder:text-ivory/40"
              />
            </div>
            {error && <p className="text-xs text-red-300">{error}</p>}
            <Button
              type="submit"
              variant="parlor"
              className="w-full"
              disabled={!draft.trim() || loading}
            >
              {loading ? "Joining…" : "Enter waiting room"}
            </Button>
          </form>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-gold/30 bg-brand/60 p-3">
              <div className="flex items-center gap-3">
                <img
                  src={readAvatar()}
                  alt={nickname ?? "You"}
                  width={36}
                  height={36}
                  className="size-9 shrink-0 rounded-full border border-gold/40 object-cover"
                />
                <div>
                  <p className="text-sm font-medium">{nickname} (you)</p>
                  <p className="text-xs text-ivory/55">Seated in the room</p>
                </div>
              </div>
              <span className="size-2 rounded-full bg-sage shadow-[0_0_8px] shadow-sage" />
            </div>

            {invites.map((invite) => (
              <div
                key={invite.id}
                className="rounded-lg border border-gold bg-gold/15 p-3 text-sm"
              >
                <p className="mb-2">
                  <span className="font-medium">{invite.from_nickname}</span> invites you to play{" "}
                  {game.name}.
                </p>
                <div className="flex gap-2">
                  <Button variant="parlor" size="sm" onClick={() => void accept(invite)}>
                    Accept
                  </Button>
                  <Button variant="parlorGhost" size="sm" onClick={() => void decline(invite)}>
                    Decline
                  </Button>
                </div>
              </div>
            ))}

            {outgoing ? (
              <div className="rounded-lg border border-gold/40 bg-brand/60 p-3 text-sm">
                <p className="mb-2">
                  Invitation sent to <span className="font-medium">{outgoing.to_nickname}</span> —
                  waiting for them to accept…
                </p>
                <Button
                  variant="parlorGhost"
                  size="sm"
                  onClick={() => {
                    void setInviteStatus(outgoing.id, "cancelled");
                    setOutgoing(null);
                  }}
                >
                  Cancel invitation
                </Button>
              </div>
            ) : null}

            {others.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gold/20 bg-brand/30 p-6 text-center text-sm text-ivory/55">
                No other players are waiting yet. Keep this open — the room refreshes
                automatically when someone arrives.
              </p>
            ) : (
              others.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 rounded-lg border border-gold/20 bg-brand/50 p-3"
                >
                  {player.avatar ? (
                    <img
                      src={player.avatar}
                      alt={player.nickname}
                      width={36}
                      height={36}
                      className="size-9 shrink-0 rounded-full border border-gold/30 object-cover"
                    />
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/30 bg-surface font-display text-sm text-gold">
                      {player.nickname.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{player.nickname}</p>
                    <p className="text-xs text-ivory/55">
                      Waiting {waitingLabel(player.last_seen_at, player.last_seen_at)}
                    </p>
                  </div>
                  <Button
                    variant="parlor"
                    size="sm"
                    className="ml-auto shrink-0"
                    disabled={Boolean(outgoing)}
                    onClick={() => void invitePlayer(player)}
                  >
                    Invite
                  </Button>
                </div>
              ))
            )}

            {error && <p className="text-xs text-red-300">{error}</p>}
            <p className="pt-2 text-xs leading-relaxed text-ivory/50">
              Everyone listed here is a real player currently in the room. Once your invitation is
              accepted, both devices open the same table and you play each other move for move.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
