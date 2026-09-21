-- Carry each player's country flag through the invite and into the live match
-- so the statistics dialog can show an opponent's flag in the "Wins / Losses"
-- tab alongside their avatar and nickname.
ALTER TABLE public.match_invites
  ADD COLUMN from_flag TEXT;

ALTER TABLE public.matches
  ADD COLUMN host_flag TEXT,
  ADD COLUMN guest_flag TEXT;
