-- Record who blocked whom so blocking is mutual in the waiting room.
--
-- The client-side block list (localStorage) only hides the blocked nickname from
-- the blocker's own view. This table lets the *blocked* player discover who
-- blocked them (by matching their nickname) and hide the blocker in return.
CREATE TABLE public.blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_session UUID NOT NULL,
  blocked_nickname TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (blocker_session, blocked_nickname)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read blocks"
  ON public.blocks FOR SELECT USING (true);

CREATE POLICY "Anyone can record a block"
  ON public.blocks FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update a block"
  ON public.blocks FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can remove a block"
  ON public.blocks FOR DELETE USING (true);

CREATE INDEX blocks_blocked_nickname_idx ON public.blocks (blocked_nickname);
