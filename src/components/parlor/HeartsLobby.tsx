import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSessionId } from "@/lib/multiplayer";
import { ACE_AVATAR, ADA_AVATAR, LEO_AVATAR } from "@/lib/avatars";
import { useNickname } from "@/components/parlor/WaitingRoom";
import { moderateNickname } from "@/lib/moderation";
import { useBlockedUsers } from "@/lib/blockedUsers";
import {
  INAPPROPRIATE_NAME_MESSAGE,
  MAX_NICKNAME_LENGTH,
  NICKNAME_TOO_LONG_MESSAGE,
} from "@/lib/nickname";
import type { GameMeta } from "@/lib/games";
import {
  addBot,
  beginRoom,
  createRoom,
  findPrivateRoomByPassword,
  generatePassword,
  isValidPassword,
  joinRoom,
  leaveRoom,
  normalizePassword,
  PASSWORD_COUNT,
  isStalePlayingRoom,
  touchRoom,
  useCrazyEightsLobby,
  type GameRoomPlayer,
} from "@/lib/crazyEightsLobby";

type Stage = "name" | "list" | "room" | "created";

const HEARTBEAT_MS = 20_000;
const MAX_SEATS = 4;

/** Seat 0 is the host; seats 1–3 are the Ace/Ada/Leo positions. */
const SEAT_BOTS: Record<number, { name: string; avatar: string }> = {
  1: { name: "Ace", avatar: ACE_AVATAR },
  2: { name: "Ada", avatar: ADA_AVATAR },
  3: { name: "Leo", avatar: LEO_AVATAR },
};

export function HeartsLobby({
  game,
  open,
  onOpenChange,
  onPlay,
}: {
  game: GameMeta;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlay: (roomId: string) => void;
}) {
  const { nickname, save } = useNickname();
  const { blockedUsers } = useBlockedUsers();
  const { rooms, playersByRoom, myRoomId, myRoom, loading: lobbyLoading, refresh } =
    useCrazyEightsLobby(game.id);
  const visibleRooms = rooms.filter((room) => !blockedUsers.includes(room.host_nickname));

  const [stage, setStage] = useState<Stage>("name");
  const [draft, setDraft] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playingRef = useRef(false);

  const session = typeof window === "undefined" ? "" : getSessionId();
  const myPlayers = myRoomId ? (playersByRoom[myRoomId] ?? []) : [];
  const amHost = Boolean(myRoom && myRoom.host_session === session);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setJoinCode("");
    setCreatedPassword(null);
    playingRef.current = false;
    setStage(nickname ? "list" : "name");
  }, [open, nickname]);

  // Keep our seat alive while we idle in the room.
  useEffect(() => {
    if (!open || !myRoomId || stage !== "room") return;
    touchRoom(myRoomId);
    const interval = window.setInterval(() => touchRoom(myRoomId), HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [open, myRoomId, stage]);

  // When the room flips to "playing", every seated player is routed to the table.
  useEffect(() => {
    if (!myRoom || !myRoomId || playingRef.current) return;
    if (myRoom.status !== "playing") return;
    if (isStalePlayingRoom(myRoom)) return;
    playingRef.current = true;
    onOpenChange(false);
    onPlay(myRoomId);
  }, [myRoom, myRoomId, onOpenChange, onPlay]);

  // Fill every unfilled seat with its computer opponent, then start the table.
  const startPlay = useCallback(
    async (roomId: string) => {
      playingRef.current = true;
      setBusy(true);
      const occupied = new Set(myPlayers.map((p) => p.seat));
      for (let seat = 1; seat < MAX_SEATS; seat += 1) {
        if (occupied.has(seat)) continue;
        const bot = SEAT_BOTS[seat];
        if (bot) await addBot(roomId, seat, bot.name, bot.avatar);
      }
      await beginRoom(roomId);
      onOpenChange(false);
      onPlay(roomId);
    },
    [myPlayers, onOpenChange, onPlay],
  );

  // Auto-start the moment all four seats are taken.
  useEffect(() => {
    if (!myRoom || !myRoomId || !amHost) return;
    if (myRoom.status !== "lobby") return;
    if (myPlayers.length >= MAX_SEATS) void startPlay(myRoomId);
  }, [myRoom, myRoomId, amHost, myPlayers.length, startPlay]);

  const submitNickname = async (value: string) => {
    setBusy(true);
    setError(null);
    const trimmed = value.trim();
    if (trimmed.length > MAX_NICKNAME_LENGTH) {
      setError(NICKNAME_TOO_LONG_MESSAGE);
      setBusy(false);
      return;
    }
    const result = await moderateNickname(trimmed);
    if (!result.allowed) {
      setError(INAPPROPRIATE_NAME_MESSAGE);
      setBusy(false);
      return;
    }
    save(trimmed);
    setBusy(false);
    setStage("list");
  };

  const createPublic = async () => {
    if (!nickname) return;
    setBusy(true);
    setError(null);
    const outcome = await createRoom({ game: game.id, nickname, isPublic: true, maxSeats: MAX_SEATS });
    setBusy(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setStage("room");
  };

  const createPrivate = async () => {
    if (!nickname) return;
    setBusy(true);
    setError(null);
    const taken = new Set(
      rooms.map((r) => (r.password ? normalizePassword(r.password) : "")).filter(Boolean),
    );
    for (let attempt = 0; attempt < PASSWORD_COUNT; attempt += 1) {
      const password = generatePassword(taken);
      const outcome = await createRoom({
        game: game.id,
        nickname,
        isPublic: false,
        password,
        maxSeats: MAX_SEATS,
      });
      if ("error" in outcome) {
        if (outcome.passwordTaken) {
          taken.add(password);
          continue;
        }
        setBusy(false);
        setError(outcome.error);
        return;
      }
      setBusy(false);
      setCreatedPassword(password);
      setStage("created");
      return;
    }
    setBusy(false);
    setError("Could not find a free passcode. Please try again.");
  };

  const joinByCode = async () => {
    if (!nickname || !joinCode.trim()) return;
    setBusy(true);
    setError(null);
    const room = await findPrivateRoomByPassword(game.id, joinCode);
    if (!room) {
      setBusy(false);
      setError("No private table matches that passcode.");
      return;
    }
    const outcome = await joinRoom({ roomId: room.id, nickname, password: joinCode });
    setBusy(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setStage("room");
  };

  const joinPublic = async (roomId: string) => {
    if (!nickname) return;
    setBusy(true);
    setError(null);
    const outcome = await joinRoom({ roomId, nickname });
    setBusy(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setStage("room");
  };

  const leave = async () => {
    setBusy(true);
    if (myRoomId) await leaveRoom(myRoomId);
    setBusy(false);
    setStage("list");
    void refresh();
  };

  const roomPlayerAt = (seat: number): GameRoomPlayer | undefined =>
    myPlayers.find((p) => p.seat === seat);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-gold/30 bg-brand text-cream sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center font-display text-2xl">Play Hearts</DialogTitle>
          <DialogDescription className="text-center text-ivory/70">
            Hearts is a four-player game. Invite friends to fill the other seats — any seat left
            open is played by a computer.
          </DialogDescription>
        </DialogHeader>

        {stage === "name" ? (
          <div className="space-y-3">
            <p className="text-sm text-ivory/70">Choose a nickname before joining a table.</p>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitNickname(draft);
              }}
              placeholder="Your nickname"
              maxLength={MAX_NICKNAME_LENGTH}
            />
            {error && <p className="text-xs text-red-300">{error}</p>}
            <Button
              variant="parlor"
              className="w-full"
              disabled={busy || !draft.trim()}
              onClick={() => void submitNickname(draft)}
            >
              Continue
            </Button>
          </div>
        ) : null}

        {stage === "list" ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant="parlor" className="flex-1" disabled={busy} onClick={() => void createPublic()}>
                Host a public table
              </Button>
              <Button variant="parlorOutline" className="flex-1" disabled={busy} onClick={() => void createPrivate()}>
                Host a private table
              </Button>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-widest text-ivory/50">Join by passcode</p>
              <div className="flex gap-2">
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void joinByCode();
                  }}
                  placeholder="Four-letter word"
                  maxLength={4}
                />
                <Button
                  variant="parlorOutline"
                  disabled={busy || !isValidPassword(joinCode)}
                  onClick={() => void joinByCode()}
                >
                  Join
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-widest text-ivory/50">Open public tables</p>
              {lobbyLoading ? (
                <p className="text-xs text-ivory/55">Loading tables…</p>
              ) : visibleRooms.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gold/20 bg-brand/30 p-4 text-center text-xs text-ivory/55">
                  No public tables right now. Host one and share the link.
                </p>
              ) : (
                visibleRooms.map((room) => {
                  const count = playersByRoom[room.id]?.length ?? 0;
                  return (
                    <button
                      key={room.id}
                      type="button"
                      disabled={busy || count >= MAX_SEATS}
                      onClick={() => void joinPublic(room.id)}
                      className="flex w-full items-center justify-between rounded-lg border border-gold/20 bg-brand/50 p-3 text-left hover:border-gold/40"
                    >
                      <span className="text-sm font-medium">{room.host_nickname}&apos;s table</span>
                      <span className="text-xs text-ivory/55">
                        {count}/{MAX_SEATS}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {error && <p className="text-xs text-red-300">{error}</p>}
          </div>
        ) : null}

        {stage === "created" ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-ivory/70">Private table created.</p>
            <div>
              <p className="text-xs uppercase tracking-widest text-ivory/50">Passcode</p>
              <p className="mt-1 font-display text-4xl font-bold tracking-[0.4em] text-gold">
                {(createdPassword ?? "").toUpperCase()}
              </p>
            </div>
            <Button variant="parlor" className="w-full" onClick={() => setStage("room")}>
              I&apos;m ready — wait for players
            </Button>
          </div>
        ) : null}

        {stage === "room" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-gold/30 bg-brand/60 p-3">
              <div>
                <p className="text-sm font-medium">
                  {myRoom?.is_public
                    ? "Public table"
                    : `Private table · ${(myRoom?.password ?? "").toUpperCase()}`}
                </p>
                <p className="text-xs text-ivory/55">
                  Seated {myPlayers.length} / {myRoom?.max_seats ?? MAX_SEATS}
                </p>
              </div>
              <span className="size-2 rounded-full bg-sage shadow-[0_0_8px] shadow-sage" />
            </div>

            <div className="space-y-2">
              {Array.from({ length: myRoom?.max_seats ?? MAX_SEATS }, (_, seat) => {
                const player = roomPlayerAt(seat);
                const bot = SEAT_BOTS[seat];
                return (
                  <div
                    key={seat}
                    className="flex items-center gap-3 rounded-lg border border-gold/20 bg-brand/50 p-3"
                  >
                    {player?.avatar ? (
                      <img
                        src={player.avatar}
                        alt={player.nickname}
                        width={36}
                        height={36}
                        className="size-9 shrink-0 rounded-full border border-gold/30 object-cover"
                      />
                    ) : bot ? (
                      <img
                        src={bot.avatar}
                        alt={bot.name}
                        width={36}
                        height={36}
                        className="size-9 shrink-0 rounded-full border border-gold/30 object-cover opacity-60"
                      />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/30 bg-surface text-sm text-ivory/40">
                        ·
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {player ? (
                          <>
                            {player.nickname}
                            {player.session_id === session ? " (you)" : ""}
                            {player.seat === 0 ? " · host" : ""}
                            {player.is_bot ? " · computer" : ""}
                          </>
                        ) : bot ? (
                          <span className="text-ivory/55">{bot.name} (computer)</span>
                        ) : (
                          <span className="text-ivory/40">Open seat — computer will fill it</span>
                        )}
                      </p>
                      <p className="text-xs text-ivory/55">Seat {seat + 1}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button variant="parlorGhost" className="flex-1" disabled={busy} onClick={() => void leave()}>
                Leave
              </Button>
              {amHost ? (
                <Button
                  variant="parlor"
                  className="flex-1"
                  disabled={busy || myPlayers.length < 1}
                  onClick={() => myRoomId && void startPlay(myRoomId)}
                >
                  Play
                </Button>
              ) : (
                <p className="flex-1 pt-2 text-center text-xs text-ivory/55">
                  Waiting for the host to start…
                </p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}




