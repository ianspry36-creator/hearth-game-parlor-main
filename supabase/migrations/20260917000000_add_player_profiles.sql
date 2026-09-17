-- Track each player's online-game completion streak so a medal can be shown in
-- the waiting room and dropped a tier when they disconnect mid-game.
CREATE TABLE public.player_profiles (
  session_id UUID NOT NULL PRIMARY KEY,
  streak INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_profiles TO authenticated;
GRANT ALL ON public.player_profiles TO service_role;

ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read a player profile"
  ON public.player_profiles FOR SELECT USING (true);

CREATE POLICY "Anyone can create a player profile"
  ON public.player_profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update a player profile"
  ON public.player_profiles FOR UPDATE USING (true) WITH CHECK (true);

-- Carry the streak into the waiting room so other players can see the medal
-- without an extra round-trip per player.
ALTER TABLE public.waiting_players
  ADD COLUMN streak INTEGER;
