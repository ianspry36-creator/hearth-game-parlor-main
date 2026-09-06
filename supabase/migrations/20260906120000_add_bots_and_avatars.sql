-- Crazy Eights multiplayer: track each player's avatar and allow computer
-- ("bot") seats so a host can fill a table without a full set of humans.

ALTER TABLE public.game_room_players
  ADD COLUMN avatar TEXT,
  ADD COLUMN is_bot BOOLEAN NOT NULL DEFAULT false;
