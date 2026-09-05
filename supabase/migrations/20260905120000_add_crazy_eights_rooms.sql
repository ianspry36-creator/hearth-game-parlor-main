-- Crazy Eights multiplayer lobby: public/private rooms for 2-4 live players.
--
-- A room holds up to `max_seats` players. Each player is assigned a contiguous
-- seat (0..3) in the order they join; seat 0 is the host. While `status` is
-- 'lobby' the room is a waiting room; once the host starts the game (or the
-- room fills) it flips to 'playing' and `state` holds the canonical game state
-- written from the host's perspective.

CREATE TABLE public.game_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game TEXT NOT NULL DEFAULT 'crazy-eights',
  host_session UUID NOT NULL,
  host_nickname TEXT NOT NULL,
  password TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  max_seats INTEGER NOT NULL DEFAULT 4 CHECK (max_seats BETWEEN 2 AND 4),
  status TEXT NOT NULL DEFAULT 'lobby',
  state JSONB,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.game_room_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  nickname TEXT NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 20),
  seat INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 3),
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (room_id, session_id),
  UNIQUE (room_id, seat)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_rooms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_rooms TO authenticated;
GRANT ALL ON public.game_rooms TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_room_players TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_room_players TO authenticated;
GRANT ALL ON public.game_room_players TO service_role;

ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_room_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can see rooms" ON public.game_rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can create a room" ON public.game_rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update a room" ON public.game_rooms FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete a room" ON public.game_rooms FOR DELETE USING (true);

CREATE POLICY "Anyone can see room players" ON public.game_room_players FOR SELECT USING (true);
CREATE POLICY "Anyone can join a room" ON public.game_room_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update a seat" ON public.game_room_players FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can leave a room" ON public.game_room_players FOR DELETE USING (true);

CREATE INDEX idx_game_rooms_listing ON public.game_rooms (game, is_public, status, created_at ASC);
CREATE INDEX idx_game_room_players_room ON public.game_room_players (room_id, seat);

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_room_players;
