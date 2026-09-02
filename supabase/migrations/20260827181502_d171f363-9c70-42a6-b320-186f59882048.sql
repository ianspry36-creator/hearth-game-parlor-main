CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game TEXT NOT NULL,
  host_session UUID NOT NULL,
  host_nickname TEXT NOT NULL,
  guest_session UUID NOT NULL,
  guest_nickname TEXT NOT NULL,
  state JSONB,
  version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can see a match" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Anyone can open a match" ON public.matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update a match" ON public.matches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can end a match" ON public.matches FOR DELETE USING (true);

CREATE TABLE public.match_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game TEXT NOT NULL,
  from_session UUID NOT NULL,
  from_nickname TEXT NOT NULL,
  to_session UUID NOT NULL,
  to_nickname TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_invites TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_invites TO authenticated;
GRANT ALL ON public.match_invites TO service_role;

ALTER TABLE public.match_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can see invites" ON public.match_invites FOR SELECT USING (true);
CREATE POLICY "Anyone can send an invite" ON public.match_invites FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can answer an invite" ON public.match_invites FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can withdraw an invite" ON public.match_invites FOR DELETE USING (true);

CREATE INDEX idx_match_invites_to_session ON public.match_invites (to_session, created_at DESC);
CREATE INDEX idx_match_invites_from_session ON public.match_invites (from_session, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_invites;