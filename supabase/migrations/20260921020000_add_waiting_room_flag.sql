-- Show each waiting player's chosen country flag in the multiplayer waiting room.
ALTER TABLE public.waiting_players
  ADD COLUMN flag TEXT;
