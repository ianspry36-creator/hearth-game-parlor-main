import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { describeError } from "@/lib/error-capture";

// Mirrors the localStorage keys defined in src/lib/multiplayer.ts. We read them
// directly rather than importing multiplayer.ts, because multiplayer.ts logs
// through this module (which would be a circular import).
const SESSION_KEY = "green-cardroom-session";
const NICKNAME_KEY = "green-cardroom-nickname";

export type ConnectionErrorType =
  | "send_invite"
  | "accept_invite"
  | "join_room"
  | "reach_room"
  | "realtime_disconnect"
  | "opponent_disconnect"
  | "opponent_reconnect";

export interface ConnectionErrorContext {
  game?: string;
  [key: string]: Json | undefined;
}

/**
 * Record a multiplayer connection failure for later diagnosis. Two things
 * happen, both fire-and-forget so they never block or break the UI:
 *
 *   1. A row is written to `connection_errors` — the persistent "log file",
 *      viewable in the Supabase dashboard.
 *   2. A summary is sent to the owner's inbox via the `notify-connection-error`
 *      Edge Function, but only when RESEND_API_KEY is configured server-side.
 *
 * The table write is the source of truth; email is best-effort.
 */
export function logConnectionError(
  type: ConnectionErrorType,
  error: unknown,
  context: ConnectionErrorContext = {},
): void {
  if (typeof window === "undefined") return;

  const payload = {
    error_type: type,
    message: describeError(error),
    game: typeof context.game === "string" ? context.game : null,
    session_id: window.localStorage.getItem(SESSION_KEY) || null,
    nickname: window.localStorage.getItem(NICKNAME_KEY),
    details: context,
    origin: window.location.origin,
  };

  void supabase
    .from("connection_errors")
    .insert(payload)
    .then(({ error: insertError }) => {
      if (insertError) console.error("[connection-errors] failed to log:", insertError);
    });

  void supabase.functions
    .invoke("notify-connection-error", { body: payload })
    .then(({ error: invokeError }) => {
      if (invokeError) console.error("[connection-errors] notify failed:", invokeError);
    })
    .catch(() => {
      // Email is best-effort; the table log above is the source of truth.
    });
}
