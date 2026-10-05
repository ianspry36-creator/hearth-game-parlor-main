-- Games started log: one row per game a player starts, updated through the
-- game's lifecycle. Tracks what is being played and how each game ends.
--
-- `completed_status` is one of:
--   'in play'   – game is ongoing
--   'won'       – player won
--   'lost'      – player lost
--   'conceded'  – player conceded
--   'error'     – an error occurred in the game
--   'new game'  – player started a new game (abandoning the current one)
--   'game room' – player left for the game room
--   'other'     – anything else

CREATE TABLE public.games_started (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID,
  game_name TEXT NOT NULL,
  nickname TEXT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIME NOT NULL DEFAULT CURRENT_TIME,
  completed_status TEXT NOT NULL DEFAULT 'in play',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.games_started TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games_started TO authenticated;
GRANT ALL ON public.games_started TO service_role;

ALTER TABLE public.games_started ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can start a game" ON public.games_started FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update a started game" ON public.games_started FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can read started games" ON public.games_started FOR SELECT USING (true);

CREATE INDEX idx_games_started_game ON public.games_started (game_name, created_at DESC);
CREATE INDEX idx_games_started_status ON public.games_started (completed_status);
