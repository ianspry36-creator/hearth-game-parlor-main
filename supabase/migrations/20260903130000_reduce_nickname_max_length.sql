-- Reduce the maximum nickname length from 20 to 10 characters, and enforce it
-- consistently across every table that stores a nickname. Previously only
-- `waiting_players` had a length limit (20); `matches` and `match_invites`
-- had none, so a longer nickname could bypass the waiting room entirely.

-- `NOT VALID` skips re-checking rows that already exist (waiting-room rows are
-- ephemeral and cleaned up via heartbeat), while still enforcing the limit on
-- every new/updated row going forward.

-- waiting_players: replace the inline `char_length(nickname) BETWEEN 1 AND 20`
-- check (Postgres auto-named it `waiting_players_nickname_check`).
ALTER TABLE public.waiting_players
  DROP CONSTRAINT IF EXISTS waiting_players_nickname_check;

ALTER TABLE public.waiting_players
  ADD CONSTRAINT waiting_players_nickname_length
  CHECK (char_length(nickname) BETWEEN 1 AND 10) NOT VALID;

-- matches / match_invites: add the same 10-char limit to their nickname columns.
ALTER TABLE public.matches
  ADD CONSTRAINT matches_host_nickname_length
  CHECK (char_length(host_nickname) BETWEEN 1 AND 10) NOT VALID;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_guest_nickname_length
  CHECK (char_length(guest_nickname) BETWEEN 1 AND 10) NOT VALID;

ALTER TABLE public.match_invites
  ADD CONSTRAINT match_invites_from_nickname_length
  CHECK (char_length(from_nickname) BETWEEN 1 AND 10) NOT VALID;

ALTER TABLE public.match_invites
  ADD CONSTRAINT match_invites_to_nickname_length
  CHECK (char_length(to_nickname) BETWEEN 1 AND 10) NOT VALID;
