-- Add "popeye" / "popeyed" to the nickname blocklist.
--
-- "popeye" (and its adjective form "popeyed") is a derogatory term for someone
-- with protruding/bulging eyes, often tied to a medical condition (exophthalmos,
-- thyroid eye disease). It is blocked as body-shaming / ableist content.
--
-- The term list must stay in sync with src/lib/nickname.ts and
-- supabase/functions/moderate-nickname/index.ts.

INSERT INTO public.blocked_nickname_terms (term, strict) VALUES
  ('popeye', false),
  ('popeyed', false)
ON CONFLICT (term) DO NOTHING;
