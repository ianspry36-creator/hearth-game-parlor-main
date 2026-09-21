-- Show the host's avatar and country flag in the Crazy Eights "Open tables"
-- list so other players can see who is hosting before joining a table.
ALTER TABLE public.game_rooms
  ADD COLUMN host_avatar TEXT,
  ADD COLUMN host_flag TEXT;
