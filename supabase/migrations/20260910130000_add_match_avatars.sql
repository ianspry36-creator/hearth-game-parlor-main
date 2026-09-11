-- Carry each player's avatar from the waiting room through the invite and into
-- the live match so the opponent's portrait shows correctly in multiplayer.
ALTER TABLE public.match_invites
  ADD COLUMN from_avatar TEXT;

ALTER TABLE public.matches
  ADD COLUMN host_avatar TEXT,
  ADD COLUMN guest_avatar TEXT;
