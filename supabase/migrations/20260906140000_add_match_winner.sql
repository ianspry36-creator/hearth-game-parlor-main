-- Track who won each completed multiplayer match so the lobby can show a
-- per-game leaderboard of nicknamed players (played / won / lost).
ALTER TABLE public.matches
  ADD COLUMN winner_session UUID;
