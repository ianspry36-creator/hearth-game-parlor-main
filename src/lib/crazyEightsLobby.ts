import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/multiplayer";
import type { GameId } from "@/lib/games";

export const CRAZY_EIGHTS_GAME_ID = "crazy-eights";

export type RoomStatus = "lobby" | "playing";

export type GameRoom = {
  id: string;
  game: string;
  host_session: string;
  host_nickname: string;
  password: string | null;
  is_public: boolean;
  max_seats: number;
  status: string;
  state: unknown;
  version: number;
  created_at: string;
  updated_at: string;
};

export type GameRoomPlayer = {
  id: string;
  room_id: string;
  session_id: string;
  nickname: string;
  seat: number;
  joined_at: string;
  last_seen_at: string;
};

const ROOM_COLUMNS =
  "id, game, host_session, host_nickname, password, is_public, max_seats, status, state, version, created_at, updated_at";

const PLAYER_COLUMNS = "id, room_id, session_id, nickname, seat, joined_at, last_seen_at";

/** Rooms that have not reported in this long are treated as abandoned. */
export const ROOM_STALE_MS = 90_000;

/**
 * A room that has flipped to "playing" but still has no deal on file is
 * abandoned if it has not been touched in this long. The host normally deals
 * within a second or two of pressing Play, so this is a very safe threshold.
 */
export const PLAYING_STALE_MS = 30_000;

/**
 * True when a room is stuck in the "playing" state without ever receiving a
 * deal. This happens when the host presses Play and then vanishes before the
 * opening hand is published, which used to strand (and crash) every guest who
 * re-joined the room.
 */
export function isStalePlayingRoom(room: GameRoom | null | undefined): boolean {
  if (!room || room.status !== "playing") return false;
  if (room.state != null) return false;
  const updated = Date.parse(room.updated_at);
  if (Number.isNaN(updated)) return false;
  return Date.now() - updated > PLAYING_STALE_MS;
}

/**
 * Common, inoffensive four-letter words used as private-room passcodes. They
 * are easy to read aloud and share without confusion.
 */
const PASSWORD_WORDS = [
  "moon", "star", "gold", "blue", "pine", "rose", "lake", "bird", "fish",
  "rain", "snow", "fire", "wind", "wave", "sand", "clay", "iron", "seed",
  "leaf", "fern", "moss", "hill", "peak", "cave", "dawn", "dusk", "mist",
  "haze", "beam", "glow", "pear", "plum", "lime", "mint", "cove", "reef",
  "tide", "dune", "oak", "elm", "ash", "fir", "fox", "owl", "elk", "hawk",
  "lynx", "orca", "seal", "pike", "kite", "drum", "harp", "bell", "song",
  "tale", "lore", "myth", "saga", "omen", "rune", "sign", "mark", "coin",
  "gem", "pearl", "jade", "ruby", "opal", "coal", "flint", "amber", "coral",
  "crown", "helm", "clan", "bard", "knot", "wool", "lamp", "frog",
];

export function generatePassword(existing: Set<string>): string {
  const available = PASSWORD_WORDS.filter((word) => !existing.has(word));
  const pool = available.length ? available : PASSWORD_WORDS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** Normalize a typed passcode for comparison (lowercase, trimmed). */
export function normalizePassword(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z]/g, "");
}

export function isValidPassword(value: string): boolean {
  return /^[a-z]{4}$/.test(normalizePassword(value));
}

async function fetchPlayers(roomIds: string[]): Promise<GameRoomPlayer[]> {
  if (!roomIds.length) return [];
  const { data } = await supabase
    .from("game_room_players")
    .select(PLAYER_COLUMNS)
    .in("room_id", roomIds)
    .order("seat", { ascending: true });
  return (data ?? []) as GameRoomPlayer[];
}

export async function listPublicRooms(game: GameId): Promise<GameRoom[]> {
  const cutoff = new Date(Date.now() - ROOM_STALE_MS).toISOString();
  const { data } = await supabase
    .from("game_rooms")
    .select(ROOM_COLUMNS)
    .eq("game", game)
    .eq("is_public", true)
    .eq("status", "lobby")
    .gte("updated_at", cutoff)
    .order("created_at", { ascending: true });
  return (data ?? []) as GameRoom[];
}

export async function getRoom(id: string): Promise<GameRoom | null> {
  const { data } = await supabase
    .from("game_rooms")
    .select(ROOM_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as GameRoom | null) ?? null;
}

export async function getRoomPlayers(roomId: string): Promise<GameRoomPlayer[]> {
  const { data } = await supabase
    .from("game_room_players")
    .select(PLAYER_COLUMNS)
    .eq("room_id", roomId)
    .order("seat", { ascending: true });
  return (data ?? []) as GameRoomPlayer[];
}

/** Locate an open private table by its four-letter passcode. */
export async function findPrivateRoomByPassword(
  game: GameId,
  password: string,
): Promise<GameRoom | null> {
  const normalized = normalizePassword(password);
  if (!normalized) return null;
  const cutoff = new Date(Date.now() - ROOM_STALE_MS).toISOString();
  const { data } = await supabase
    .from("game_rooms")
    .select(ROOM_COLUMNS)
    .eq("game", game)
    .eq("is_public", false)
    .eq("password", normalized)
    .eq("status", "lobby")
    .gte("updated_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(1);
  return (data?.[0] as GameRoom | null) ?? null;
}

async function seatPlayer(
  roomId: string,
  nickname: string,
  seat: number,
): Promise<GameRoomPlayer | null> {
  const { data } = await supabase
    .from("game_room_players")
    .insert({
      room_id: roomId,
      session_id: getSessionId(),
      nickname,
      seat,
    })
    .select(PLAYER_COLUMNS)
    .single();
  return (data as GameRoomPlayer | null) ?? null;
}

export async function createRoom(params: {
  game: GameId;
  nickname: string;
  isPublic: boolean;
  password?: string | null;
  maxSeats?: number;
}): Promise<{ room: GameRoom; player: GameRoomPlayer } | { error: string }> {
  const { data: room, error } = await supabase
    .from("game_rooms")
    .insert({
      game: params.game,
      host_session: getSessionId(),
      host_nickname: params.nickname,
      password: params.password ?? null,
      is_public: params.isPublic,
      max_seats: params.maxSeats ?? 4,
      status: "lobby",
      state: null,
      version: 0,
    })
    .select(ROOM_COLUMNS)
    .single();
  if (error || !room) return { error: "Could not create the table." };

  const player = await seatPlayer(room.id, params.nickname, 0);
  if (!player) {
    await supabase.from("game_rooms").delete().eq("id", room.id);
    return { error: "Could not take a seat at the table." };
  }
  return { room: room as GameRoom, player };
}

export async function joinRoom(params: {
  roomId: string;
  nickname: string;
  password?: string;
}): Promise<{ player: GameRoomPlayer; room: GameRoom } | { error: string }> {
  const room = await getRoom(params.roomId);
  if (!room) return { error: "That table no longer exists." };
  if (room.status !== "lobby") return { error: "That game has already started." };
  if (room.password && !room.is_public) {
    const expected = normalizePassword(room.password);
    const given = normalizePassword(params.password ?? "");
    if (!expected || given !== expected) return { error: "That passcode is incorrect." };
  }

  const existing = await getRoomPlayers(room.id);
  if (existing.some((p) => p.session_id === getSessionId())) {
    const me = existing.find((p) => p.session_id === getSessionId())!;
    return { player: me, room };
  }
  if (existing.length >= room.max_seats) return { error: "That table is full." };

  const taken = new Set(existing.map((p) => p.seat));
  let seat = 0;
  while (taken.has(seat)) seat += 1;
  const player = await seatPlayer(room.id, params.nickname, seat);
  if (!player) return { error: "Could not take a seat at the table." };

  await supabase
    .from("game_rooms")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", room.id);

  return { player, room };
}

export async function leaveRoom(roomId: string): Promise<void> {
  const session = getSessionId();
  const { data: me } = await supabase
    .from("game_room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("session_id", session)
    .maybeSingle();
  if (!me) return;
  await supabase.from("game_room_players").delete().eq("id", (me as { id: string }).id);

  // If the host leaves an idle table, close it so no one is left stranded.
  const { data: room } = await supabase
    .from("game_rooms")
    .select("host_session")
    .eq("id", roomId)
    .maybeSingle();
  if (room && (room as { host_session: string }).host_session === session) {
    await supabase.from("game_rooms").delete().eq("id", roomId);
  }
}

export async function startRoom(roomId: string, state: unknown): Promise<void> {
  await supabase
    .from("game_rooms")
    .update({
      status: "playing",
      state: state as never,
      version: 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roomId);
}

/** Flip an idle room into the playing state without writing the deal yet. */
export async function beginRoom(roomId: string): Promise<void> {
  await supabase
    .from("game_rooms")
    .update({ status: "playing", updated_at: new Date().toISOString() })
    .eq("id", roomId);
}

export async function publishRoomState(
  roomId: string,
  state: unknown,
  version: number,
): Promise<void> {
  await supabase
    .from("game_rooms")
    .update({
      state: state as never,
      version,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roomId);
}

export function touchRoom(roomId: string): void {
  const now = new Date().toISOString();
  void supabase
    .from("game_room_players")
    .update({ last_seen_at: now })
    .eq("room_id", roomId)
    .eq("session_id", getSessionId());
  void supabase.from("game_rooms").update({ updated_at: now }).eq("id", roomId);
}

/**
 * Lists open public tables and tracks the caller's own seat. Polls the room
 * tables and folds in realtime inserts so the list stays current.
 */
export function useCrazyEightsLobby(game: GameId) {
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [playersByRoom, setPlayersByRoom] = useState<Record<string, GameRoomPlayer[]>>({});
  const [myRoomId, setMyRoomId] = useState<string | null>(null);
  const [myRoom, setMyRoom] = useState<GameRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const session = getSessionId();
    const [publicRooms, myRow] = await Promise.all([
      listPublicRooms(game),
      (async () => {
        const { data } = await supabase
          .from("game_room_players")
          .select(PLAYER_COLUMNS)
          .eq("session_id", session)
          .order("joined_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return data as GameRoomPlayer | null;
      })(),
    ]);

    let currentRoom = myRow ? await getRoom(myRow.room_id) : null;
    // Recovering from a host that vanished mid-start: drop an abandoned
    // "playing" room so the caller is not auto-joined into a table with no deal.
    if (currentRoom && isStalePlayingRoom(currentRoom)) {
      await leaveRoom(currentRoom.id);
      currentRoom = null;
    }
    const visibleRoomIds = [
      ...publicRooms.map((r) => r.id),
      ...(currentRoom && currentRoom.status === "lobby" ? [currentRoom.id] : []),
    ];
    const players = await fetchPlayers(visibleRoomIds);

    const byRoom: Record<string, GameRoomPlayer[]> = {};
    for (const player of players) {
      (byRoom[player.room_id] ??= []).push(player);
    }

    setRooms(publicRooms);
    setPlayersByRoom(byRoom);
    setMyRoomId(currentRoom ? currentRoom.id : null);
    setMyRoom(currentRoom);
    setError(null);
    setLoading(false);
  }, [game]);

  useEffect(() => {
    setLoading(true);
    void refresh();

    const channel = supabase
      .channel(`crazy-eights-lobby-${game}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_rooms", filter: `game=eq.${game}` },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_room_players" },
        () => void refresh(),
      )
      .subscribe();

    const poll = window.setInterval(() => void refresh(), 4_000);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [game, refresh]);

  return { rooms, playersByRoom, myRoomId, myRoom, loading, error, refresh };
}

/**
 * Subscribes to a single room for live play: returns the room, its players
 * (in seat order), the caller's own seat, and helpers to publish game state.
 * The canonical `state` is always stored from the host's (seat 0) perspective.
 */
export function useCrazyEightsRoom(roomId: string | undefined) {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<GameRoomPlayer[]>([]);
  const [loading, setLoading] = useState(Boolean(roomId));
  const version = useRef(0);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setPlayers([]);
      setLoading(false);
      return;
    }
    let live = true;
    version.current = 0;
    setLoading(true);

    const load = async () => {
      const [r, p] = await Promise.all([getRoom(roomId), getRoomPlayers(roomId)]);
      if (!live) return;
      if (r) {
        version.current = r.version;
        setRoom(r);
      }
      setPlayers(p);
      setLoading(false);
    };
    void load();

    const channel = supabase
      .channel(`crazy-eights-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as GameRoom | null;
          // A DELETE event carries no `new` row; ignore it rather than crash on
          // `row.version` (the room's absence is handled elsewhere).
          if (!row) return;
          if (row.version < version.current) return;
          version.current = row.version;
          setRoom(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_room_players",
          filter: `room_id=eq.${roomId}`,
        },
        () => void getRoomPlayers(roomId).then((p) => live && setPlayers(p)),
      )
      .subscribe();

    const poll = window.setInterval(() => {
      void getRoom(roomId).then((r) => {
        if (!live || !r) return;
        if (r.version < version.current) return;
        version.current = r.version;
        setRoom(r);
      });
    }, 2_500);

    return () => {
      live = false;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [roomId]);

  const sessionId = typeof window === "undefined" ? "" : getSessionId();
  const myPlayer = players.find((p) => p.session_id === sessionId) ?? null;
  const isHost = Boolean(room && room.host_session === sessionId);

  const publish = useCallback(
    async (state: unknown) => {
      if (!roomId) return;
      const next = version.current + 1;
      version.current = next;
      setRoom((current) => (current ? { ...current, state, version: next } : current));
      await publishRoomState(roomId, state, next);
    },
    [roomId],
  );

  return {
    room,
    players,
    loading,
    myPlayer,
    mySeat: myPlayer?.seat ?? 0,
    playerCount: players.length,
    isHost,
    remoteState: (room?.state ?? null) as unknown,
    status: (room?.status ?? "lobby") as RoomStatus,
    publish,
  };
}



