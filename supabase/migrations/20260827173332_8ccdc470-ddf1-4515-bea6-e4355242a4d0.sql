CREATE TABLE public.waiting_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  game TEXT NOT NULL,
  nickname TEXT NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 20),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (session_id, game)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiting_players TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiting_players TO authenticated;
GRANT ALL ON public.waiting_players TO service_role;

ALTER TABLE public.waiting_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can see who is waiting"
  ON public.waiting_players FOR SELECT USING (true);

CREATE POLICY "Anyone can join the waiting room"
  ON public.waiting_players FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can refresh a waiting entry"
  ON public.waiting_players FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can leave the waiting room"
  ON public.waiting_players FOR DELETE USING (true);

CREATE INDEX waiting_players_game_last_seen_idx ON public.waiting_players (game, last_seen_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.waiting_players;