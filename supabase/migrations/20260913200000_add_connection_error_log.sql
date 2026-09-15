-- Append-only log of multiplayer connection failures. The browser writes one
-- row per failure (fire-and-forget) so "couldn't connect" problems can be
-- diagnosed without asking players for details.
--
-- Rows are read by an admin via the Supabase dashboard (which bypasses RLS);
-- clients may write but never read the log back, because rows can contain other
-- players' session ids.

CREATE TABLE public.connection_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  error_type TEXT NOT NULL,
  message TEXT NOT NULL,
  game TEXT,
  session_id UUID,
  nickname TEXT,
  details JSONB,
  origin TEXT
);

GRANT INSERT ON public.connection_errors TO anon;
GRANT INSERT ON public.connection_errors TO authenticated;
GRANT ALL ON public.connection_errors TO service_role;

ALTER TABLE public.connection_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record a connection error"
  ON public.connection_errors FOR INSERT WITH CHECK (true);

CREATE INDEX connection_errors_created_at_idx ON public.connection_errors (created_at DESC);
CREATE INDEX connection_errors_error_type_idx ON public.connection_errors (error_type);
