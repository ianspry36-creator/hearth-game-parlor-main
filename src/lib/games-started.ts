import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getNickname, getSessionId } from "@/lib/multiplayer";

/** How a started game can end, written to `games_started.completed_status`. */
export type GameCompletionStatus =
  | "in play"
  | "won"
  | "lost"
  | "conceded"
  | "error"
  | "new game"
  | "game room"
  | "other";

/** Broad device bucket derived from the user agent, for the games_started table. */
export type DeviceType = "mobile" | "tablet" | "desktop";

/**
 * Classify the current device as mobile, tablet or desktop from the user agent
 * and touch capabilities. Best-effort only — iPadOS and some Android tablets
 * would otherwise report as desktop.
 */
export function detectDeviceType(): DeviceType {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent ?? "";
  const touchPoints = navigator.maxTouchPoints ?? 0;
  const isTablet =
    /iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
    (touchPoints > 1 && /Macintosh/.test(ua));
  if (isTablet) return "tablet";
  if (/Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

let cachedIpAddress: string | null = null;

/**
 * Resolve the player's public IP address via a free lookup service. Cached for
 * the session and time-boxed so a slow or failed lookup never delays starting
 * a game. Returns null when it cannot be determined (offline, blocked, SSR).
 */
export async function getIpAddress(): Promise<string | null> {
  if (cachedIpAddress) return cachedIpAddress;
  if (typeof window === "undefined") return null;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { ip?: string };
    cachedIpAddress = data.ip ?? null;
    return cachedIpAddress;
  } catch {
    return null;
  }
}

/**
 * Insert a row for a freshly started game and return its id so later events
 * (win / loss / concede / leaving) can update the same row. Returns null when
 * the write fails (e.g. the table is missing), so callers keep playing.
 */
export async function startGame(gameName: string): Promise<string | null> {
  const ip_address = await getIpAddress();
  const device_type = detectDeviceType();
  const { data, error } = await supabase
    .from("games_started")
    .insert({
      game_name: gameName,
      nickname: getNickname(),
      session_id: getSessionId(),
      completed_status: "in play",
      ip_address,
      device_type,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[games-started] startGame failed:", error);
    return null;
  }
  return data?.id ?? null;
}

/** Mark a started game's completion status (won, conceded, new game, …). */
export async function updateGameStatus(
  rowId: string | null,
  status: GameCompletionStatus,
): Promise<void> {
  if (!rowId) return;
  const { error } = await supabase
    .from("games_started")
    .update({ completed_status: status })
    .eq("id", rowId);
  if (error) console.error("[games-started] updateGameStatus failed:", error);
}

/** The kinds of interaction we capture for every move and button press. */
export type GameActionType =
  | "dice throw"
  | "waste to foundation"
  | "reserve to foundation"
  | "waste to reserve"
  | "stock draw"
  | "redeal"
  | "undo"
  | "new game"
  | "home"
  | "bank"
  | "keep"
  | "score"
  | "concede"
  | "table action"
  | "other";

/**
 * Append one move / button press to a started game's action log. Fire-and-
 * forget and fail-soft so a missing `game_actions` table never interrupts play.
 */
export async function recordGameAction(
  rowId: string | null,
  actionType: string,
  detail?: string | null,
): Promise<void> {
  if (!rowId) return;
  const { error } = await supabase
    .from("game_actions")
    .insert({
      game_started_id: rowId,
      action_type: actionType,
      detail: detail ?? null,
    });
  if (error) console.error("[games-started] recordGameAction failed:", error);
}

/**
 * Track a single game's lifecycle in `games_started` from a React component.
 *
 * - On mount it inserts an `"in play"` row and remembers its id.
 * - `end(status)` flips that row to a completion status (won / conceded / …).
 * - `beginNew()` marks the current row `"new game"` and opens a fresh row, for
 *   "New game" resets that should supersede the previous hand.
 *
 * All writes are fire-and-forget and fail soft, so a missing table never
 * interrupts play.
 */
export function useGameStarted(gameName: string) {
  const rowRef = useRef<string | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void startGame(gameName).then((id) => {
      if (!cancelled) rowRef.current = id;
    });
    return () => {
      cancelled = true;
    };
  }, [gameName]);

  const end = useCallback((status: GameCompletionStatus) => {
    endedRef.current = true;
    void updateGameStatus(rowRef.current, status);
  }, []);

  const beginNew = useCallback(() => {
    // A finished hand (won / lost / conceded) keeps its outcome; only an
    // abandoned, still-in-play hand is marked "new game" before we open a
    // fresh row for the next deal.
    if (!endedRef.current) {
      void updateGameStatus(rowRef.current, "new game");
    }
    endedRef.current = false;
    void startGame(gameName).then((id) => {
      rowRef.current = id;
    });
  }, [gameName]);

  const recordAction = useCallback((actionType: string, detail?: string | null) => {
    void recordGameAction(rowRef.current, actionType, detail);
  }, []);

  return { end, beginNew, recordAction };
}
