-- Show each waiting player's chosen avatar in the multiplayer waiting room.
ALTER TABLE public.waiting_players
  ADD COLUMN avatar TEXT;
