-- Nickname moderation backstop at the database write path.
--
-- The client runs a UX filter (src/lib/nickname.ts) and an Edge Function
-- (moderate-nickname) that also calls Tisane Labs for natural-language abuse.
-- But RLS on the multiplayer tables is `WITH CHECK (true)`, so a determined
-- client can still INSERT/UPDATE a raw nickname directly.
--
-- This migration closes that hole with synchronous BEFORE-ROW triggers that
-- reject blocked nicknames using the same obfuscation-aware matcher
-- (leetspeak, separator tolerance, optional vowels, repeated-letter collapse)
-- as src/lib/nickname.ts. Tisane cannot run synchronously in a trigger (pg_net
-- is async), so it stays in the Edge Function; this trigger is the
-- non-bypassable blocklist enforcement that also catches the obfuscated forms
-- Tisane misses ("tw*t", "f0ck").
--
-- Term list + rules MUST stay in sync with src/lib/nickname.ts and
-- supabase/functions/moderate-nickname/index.ts.

CREATE TABLE public.blocked_nickname_terms (
  term text PRIMARY KEY,
  strict boolean NOT NULL DEFAULT false
);

GRANT ALL ON public.blocked_nickname_terms TO service_role;
-- Intentionally no grants to anon/authenticated: the blocklist is enforced by
-- SECURITY DEFINER functions below and should not be readable/writable by
-- clients directly.

INSERT INTO public.blocked_nickname_terms (term, strict) VALUES
  -- Profanity
  ('fuck', false),
  ('fucked', false),
  ('fucker', false),
  ('fucking', false),
  ('motherfucker', false),
  ('shit', false),
  ('shitty', false),
  ('bullshit', false),
  ('bitch', false),
  ('bitching', false),
  ('cunt', false),
  ('cock', false),
  ('dick', false),
  ('pussy', false),
  ('twat', false),
  ('asshole', false),
  ('arsehole', false),
  ('bastard', false),
  ('whore', false),
  ('slut', false),
  ('prick', false),
  ('douche', false),
  ('douchebag', false),
  ('wanker', false),
  ('bollocks', false),
  ('damn', false),
  -- Common letter-substitution / vowel-drop forms.
  ('fock', false),
  ('fvck', false),
  ('fuk', false),
  ('shyt', false),
  ('bich', false),
  ('dik', false),
  ('cawk', false),
  -- Hate speech (racial)
  ('nigger', false),
  ('nigga', false),
  ('chink', false),
  ('kike', false),
  ('spic', false),
  ('gook', false),
  ('wetback', false),
  ('coon', false),
  ('beaner', false),
  -- Hate speech (sexual orientation / gender)
  ('faggot', false),
  ('fag', false),
  ('dyke', false),
  ('homo', false),
  ('tranny', false),
  ('shemale', false),
  -- Ableist slurs
  ('retard', false),
  ('retarded', false),
  ('spastic', false),
  ('spaz', false),
  -- Sexual / predatory content
  ('rape', true),
  ('rapist', false),
  ('pedo', false),
  ('pedophile', false),
  ('molest', false),
  ('incest', false),
  -- Extremist content
  ('nazi', false),
  ('hitler', false);

-- Build a regex for one blocked term that tolerates the same obfuscations as
-- the client matcher:
--   * vowels are optional ("twt", "fck", "btch")
--   * any run of non-letters may appear between letters ("tw*t", "f ck")
--   * `\m`/`\M` word boundaries keep short terms from matching inside longer
--     words ("class", "assassin", "title", "damnation" remain allowed)
CREATE OR REPLACE FUNCTION public.nickname_term_pattern(term text, strict boolean DEFAULT false)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '\m'
      || string_agg(
           CASE
             WHEN NOT strict AND ch ~ '[aeiou]' THEN '[^a-z]*(?:' || ch || ')?'
             ELSE '[^a-z]*' || ch
           END,
           '' ORDER BY ord
         )
      || '\M'
  FROM (
    SELECT ch, ord
    FROM unnest(string_to_array(lower(term), NULL)) WITH ORDINALITY AS t(ch, ord)
  ) s
$$;
-- Normalize + check a single nickname against the blocklist. SECURITY DEFINER
-- so it can read blocked_nickname_terms regardless of the caller's role.
CREATE OR REPLACE FUNCTION public.nickname_blocked(value text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  norm text;
  squished text;
  pat text;
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN
    RETURN false;
  END IF;

  norm := lower(value);

  -- Leetspeak map (mirrors src/lib/nickname.ts LEET).
  norm := replace(norm, '0', 'o');
  norm := replace(norm, '1', 'i');
  norm := replace(norm, '3', 'e');
  norm := replace(norm, '4', 'a');
  norm := replace(norm, '5', 's');
  norm := replace(norm, '7', 't');
  norm := replace(norm, '8', 'b');
  norm := replace(norm, '9', 'g');
  norm := replace(norm, '@', 'a');
  norm := replace(norm, '$', 's');
  norm := replace(norm, '!', 'i');
  norm := replace(norm, '+', 't');
  norm := replace(norm, '#', 'h');

  -- Collapse runs of the same letter so "fuuuck" reads as "fuck".
  squished := regexp_replace(norm, '([a-z])\1+', '\1', 'g');

  FOR pat IN
    SELECT public.nickname_term_pattern(t.term, t.strict)
    FROM public.blocked_nickname_terms t
  LOOP
    IF norm ~* pat OR squished ~* pat THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

-- Enforce the blocklist on every nickname-bearing column of the row being
-- written. Generic over the three multiplayer tables.
CREATE OR REPLACE FUNCTION public.enforce_nickname()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row jsonb := to_jsonb(NEW);
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['nickname','host_nickname','guest_nickname','from_nickname','to_nickname']
  LOOP
    IF jsonb_exists(row, col) AND jsonb_typeof(row -> col) = 'string' THEN
      IF public.nickname_blocked(row ->> col) THEN
        RAISE EXCEPTION 'Nickname is not allowed.';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER waiting_players_nickname_check
  BEFORE INSERT OR UPDATE OF nickname
  ON public.waiting_players
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_nickname();

CREATE TRIGGER matches_nickname_check
  BEFORE INSERT OR UPDATE OF host_nickname, guest_nickname
  ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_nickname();

CREATE TRIGGER match_invites_nickname_check
  BEFORE INSERT OR UPDATE OF from_nickname, to_nickname
  ON public.match_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_nickname();


