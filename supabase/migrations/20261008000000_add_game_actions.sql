-- Upgrade games_started with the player's device and IP, and add a linked
-- game_actions table that records every move and button press so a
-- developer-only screen can replay a session.

-- 1. Capture where each game was played from.
ALTER TABLE public.games_started
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS device_type TEXT;

-- 2. One row per move / button press, linked back to the game it belongs to.
CREATE TABLE IF NOT EXISTS public.game_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_started_id UUID NOT NULL REFERENCES public.games_started(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_actions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_actions TO authenticated;
GRANT ALL ON public.game_actions TO service_role;

ALTER TABLE public.game_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can see game actions" ON public.game_actions;
CREATE POLICY "Anyone can see game actions" ON public.game_actions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can post a game action" ON public.game_actions;
CREATE POLICY "Anyone can post a game action" ON public.game_actions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update a game action" ON public.game_actions;
CREATE POLICY "Anyone can update a game action" ON public.game_actions FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete a game action" ON public.game_actions;
CREATE POLICY "Anyone can delete a game action" ON public.game_actions FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_game_actions_game_started
  ON public.game_actions (game_started_id, created_at);

-- 3. Make sure the dev log screen can read started games regardless of the
--    current RLS state, without disturbing any existing write behaviour.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games_started TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games_started TO authenticated;
GRANT ALL ON public.games_started TO service_role;

-- Let the dev log screen update a game's status and delete games (and, via the
-- ON DELETE CASCADE, their actions). Harmless if RLS is currently disabled.
DROP POLICY IF EXISTS "Anyone can update a started game" ON public.games_started;
CREATE POLICY "Anyone can update a started game" ON public.games_started FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete a started game" ON public.games_started;
CREATE POLICY "Anyone can delete a started game" ON public.games_started FOR DELETE USING (true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'games_started' AND n.nspname = 'public' AND c.relrowsecurity = false
  ) THEN
    -- RLS is off, so the table grants above already allow reads.
    NULL;
  ELSE
    -- RLS is on: add a read-all policy for the log screen if one is missing.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'games_started'
        AND policyname = 'Anyone can see started games'
    ) THEN
      CREATE POLICY "Anyone can see started games" ON public.games_started FOR SELECT USING (true);
    END IF;
  END IF;
END $$;
