-- Crazy Eights: guarantee two simultaneously-open private tables never share a
-- four-letter passcode.
--
-- Passwords only exist on private rooms (is_public = false), and a room is only
-- joinable by passcode while it is still in 'lobby'. Scoping the unique index to
-- those rows means a passcode frees up as soon as its room flips to 'playing' (or
-- is deleted), so stale/finished tables do not permanently reserve words.

CREATE UNIQUE INDEX idx_game_rooms_private_lobby_password
  ON public.game_rooms (password)
  WHERE password IS NOT NULL AND is_public = false AND status = 'lobby';
