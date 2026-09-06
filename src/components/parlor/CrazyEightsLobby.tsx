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
import { useNickname } from "@/components/parlor/WaitingRoom";
import { moderateNickname } from "@/lib/moderation";
import {
  INAPPROPRIATE_NAME_MESSAGE,
  MAX_NICKNAME_LENGTH,
  NICKNAME_TOO_LONG_MESSAGE,
} from "@/lib/nickname";
import type { GameMeta } from "@/lib/games";
import {
  beginRoom,
  createRoom,
  findPrivateRoomByPassword,
  generatePassword,
  isValidPassword,
  joinRoom,
  leaveRoom,
  normalizePassword,
  isStalePlayingRoom,
  touchRoom,
  useCrazyEightsLobby,
} from "@/lib/crazyEightsLobby";

type Stage = "name" | "list" | "room" | "join" | "created";

const HEARTBEAT_MS = 20_000;

export function CrazyEightsLobby({
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
  const { rooms, playersByRoom, myRoomId, myRoom, loading: lobbyLoading, refresh } =
    useCrazyEightsLobby(game.id);

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

  // Reset to a sensible stage each time the dialog opens.
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

  // When the game actually starts (host pressed Play or the table filled),
  // every seated player is routed to the live table.
  useEffect(() => {
    if (!myRoom || !myRoomId || playingRef.current) return;
    if (myRoom.status !== "playing") return;
    // Don't route into a table the host abandoned before dealing; the lobby
    // refresh already leaves it, but guard here too as a safety net.
    if (isStalePlayingRoom(myRoom)) return;
    playingRef.current = true;
    onPlay(myRoomId);
  }, [myRoom, myRoomId, onPlay]);

  const startPlay = useCallback(
    async (roomId: string) => {
      playingRef.current = true;
      await beginRoom(roomId);
      onPlay(roomId);
    },
    [onPlay],
  );

  // Auto-start the moment the last seat fills.
  useEffect(() => {
    if (!myRoom || !myRoomId || !amHost) return;
    if (myRoom.status !== "lobby") return;
    if (myPlayers.length >= myRoom.max_seats) {
      void startPlay(myRoomId);
    }
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
    const outcome = await createRoom({ game: game.id, nickname, isPublic: true });
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
    const existing = new Set(
      rooms.map((r) => (r.password ? normalizePassword(r.password) : "")).filter(Boolean),
    );
    const password = generatePassword(existing);
    const outcome = await createRoom({
      game: game.id,
      nickname,
      isPublic: false,
      password,
    });
    setBusy(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setCreatedPassword(password);
    setStage("created");
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

  const submitJoinCode = async (code: string) => {
    if (!nickname || !isValidPassword(code)) {
      setError("Enter a four-letter passcode.");
      return;
    }
    setBusy(true);
    setError(null);
    const target = await findPrivateRoomByPassword(game.id, code);
    if (!target) {
      setBusy(false);
      setError("No private table has that passcode.");
      return;
    }
    const outcome = await joinRoom({ roomId: target.id, nickname, password: code });
    setBusy(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setStage("room");
  };

  const leave = async () => {
    if (myRoomId) await leaveRoom(myRoomId);
    setStage("list");
    void refresh();
  };

  const close = (next: boolean) => {
    if (!next) {
      if (!playingRef.current && myRoomId && stage === "room") void leaveRoom(myRoomId);
      setStage(nickname ? "list" : "name");
    }
    onOpenChange(next);
  };

  const seatCount = (roomId: string) => (playersByRoom[roomId] ?? []).length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="border-gold/25 bg-surface sm:max-w-md">
        <DialogHeader>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">
            {game.name} · multiplayer lobby
          </p>
          <DialogTitle className="font-display text-3xl font-bold">
            {stage === "name" ? "Your name at the table" : stage === "list" ? "Find a table" : "Your table"}
          </DialogTitle>
          <DialogDescription className="text-ivory/70">
            {stage === "name"
              ? "Enter a nickname before you join the lobby."
              : stage === "list"
                ? "Join an open table, or start your own for 2–4 live players."
                : "Real players, one table, played move for move."}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs text-red-300">{error}</p>}

        {stage === "name" ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.trim()) return;
              void submitNickname(draft);
            }}
          >
            <div>
              <label
                htmlFor="lobby-nickname"
                className="mb-2 block text-[11px] font-medium uppercase tracking-[0.22em] text-ivory/70"
              >
                Nickname
              </label>
              <Input
                id="lobby-nickname"
                value={draft}
                maxLength={MAX_NICKNAME_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="e.g. Cardboard Jack"
                className="border-gold/30 bg-brand/60 text-cream placeholder:text-ivory/40"
              />
            </div>
            <Button
              type="submit"
              variant="parlor"
              className="w-full"
              disabled={!draft.trim() || busy}
            >
              {busy ? "Checking…" : "Continue"}
            </Button>
          </form>
        ) : null}

        {stage === "list" ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button variant="parlor" className="w-full" disabled={busy} onClick={() => void createPublic()}>
                Start a public table
              </Button>
              <Button variant="parlorOutline" className="w-full" disabled={busy} onClick={() => void createPrivate()}>
                Create private table
              </Button>
              <Button variant="parlorOutline" className="w-full" disabled={busy} onClick={() => setStage("join")}>
                Join private table
              </Button>
            </div>

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-ivory/60">Open tables</p>
              {lobbyLoading ? (
                <p className="text-sm text-ivory/55">Looking for tables…</p>
              ) : rooms.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gold/20 bg-brand/30 p-6 text-center text-sm text-ivory/55">
                  No open tables yet. Start one — it appears here for other players.
                </p>
              ) : (
                <div className="space-y-2">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className="flex items-center gap-3 rounded-lg border border-gold/20 bg-brand/50 p-3"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/30 bg-surface font-display text-sm text-gold">
                        {room.host_nickname.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{room.host_nickname}'s table</p>
                        <p className="text-xs text-ivory/55">
                          {seatCount(room.id)} / {room.max_seats} seats
                        </p>
                      </div>
                      <Button
                        variant="parlor"
                        size="sm"
                        disabled={busy || seatCount(room.id) >= room.max_seats}
                        onClick={() => void joinPublic(room.id)}
                      >
                        Join
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {stage === "join" ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitJoinCode(joinCode);
            }}
          >
            <div>
              <label
                htmlFor="join-code"
                className="mb-2 block text-[11px] font-medium uppercase tracking-[0.22em] text-ivory/70"
              >
                Passcode
              </label>
              <Input
                id="join-code"
                value={joinCode}
                maxLength={4}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="4-letter word"
                className="border-gold/30 bg-brand/60 text-cream placeholder:text-ivory/40"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="parlorGhost" type="button" onClick={() => setStage("list")}>
                Back
              </Button>
              <Button
                variant="parlor"
                type="submit"
                className="flex-1"
                disabled={!isValidPassword(joinCode) || busy}
              >
                Join private table
              </Button>
            </div>
          </form>
        ) : null}

        {stage === "created" ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-gold/40 bg-brand/60 p-4 text-center">
              <p className="text-[11px] uppercase tracking-[0.22em] text-ivory/60">
                Private table passcode
              </p>
              <p className="mt-1 font-display text-4xl font-bold tracking-[0.4em] text-gold">
                {(createdPassword ?? "").toUpperCase()}
              </p>
              <p className="mt-2 text-xs text-ivory/55">
                Share this word with your friends so they can join.
              </p>
            </div>
            <Button
              variant="parlor"
              className="w-full"
              onClick={() => {
                if (createdPassword) void navigator.clipboard?.writeText(createdPassword);
              }}
            >
              Copy passcode
            </Button>
            <Button variant="parlorGhost" className="w-full" onClick={() => setStage("room")}>
              I'm ready — wait for players
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
                  Seated {myPlayers.length} / {myRoom?.max_seats ?? 4}
                </p>
              </div>
              <span className="size-2 rounded-full bg-sage shadow-[0_0_8px] shadow-sage" />
            </div>

            <div className="space-y-2">
              {Array.from({ length: myRoom?.max_seats ?? 4 }, (_, seat) => {
                const player = myPlayers.find((p) => p.seat === seat);
                return (
                  <div
                    key={seat}
                    className="flex items-center gap-3 rounded-lg border border-gold/20 bg-brand/50 p-3"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/30 bg-surface font-display text-sm text-gold">
                      {player ? player.nickname.charAt(0).toUpperCase() : "·"}
                    </span>
                    <div className="min-w-0 flex-1">
                      {player ? (
                        <>
                          <p className="truncate text-sm font-medium">
                            {player.nickname}
                            {player.session_id === session ? " (you)" : ""}
                            {player.seat === 0 ? " · host" : ""}
                          </p>
                          <p className="text-xs text-ivory/55">Seat {seat + 1}</p>
                        </>
                      ) : (
                        <p className="text-sm text-ivory/45">Waiting for a player…</p>
                      )}
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
                  disabled={busy || myPlayers.length < 2}
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



