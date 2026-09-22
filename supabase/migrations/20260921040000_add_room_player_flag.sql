-- Carry each Crazy Eights room player's chosen country flag so their flag can be
-- shown on their seat during a live game.
ALTER TABLE public.game_room_players
  ADD COLUMN flag TEXT;
