-- Track each player's best Spider Solitaire score per difficulty so the
-- statistics dialog can show a global top-10 leaderboard shared across players.
-- One row per (player, difficulty), keeping only their best score.
CREATE TABLE public.spider_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  nickname TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (session_id, difficulty)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spider_scores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spider_scores TO authenticated;
GRANT ALL ON public.spider_scores TO service_role;

ALTER TABLE public.spider_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can see spider scores" ON public.spider_scores FOR SELECT USING (true);
CREATE POLICY "Anyone can post a spider score" ON public.spider_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can improve their spider score" ON public.spider_scores FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete a spider score" ON public.spider_scores FOR DELETE USING (true);

CREATE INDEX idx_spider_scores_difficulty_score ON public.spider_scores (difficulty, score DESC);
