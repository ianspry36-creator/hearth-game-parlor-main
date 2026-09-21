import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/multiplayer";

const KEY = "cardsandgames.blocked-users";

/**
 * Blocked users are stored as a list of nicknames in localStorage (the same
 * client-side persistence the parlour already uses for favourites, theme and
 * effects). Blocking is per-device: there is no account, so the list lives on
 * the machine where it was created.
 */
export function readBlockedUsers(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function writeBlockedUsers(names: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(names));
  } catch {
    // Storage unavailable (private mode, etc.) — blocked users simply won't persist.
  }
}

/**
 * Persist a block to the server so the blocked player can be hidden from the
 * blocker too (mutual invisibility). The local list only hides the blocked
 * nickname from the blocker's own view; this row lets the other side look up who
 * blocked them by nickname and hide the blocker in return.
 */
function recordBlock(name: string) {
  if (typeof window === "undefined") return;
  void supabase
    .from("blocks")
    .upsert(
      { blocker_session: getSessionId(), blocked_nickname: name },
      { onConflict: "blocker_session,blocked_nickname" },
    )
    .then(({ error }) => {
      if (error) console.error("[blockedUsers] failed to record block:", error);
    });
}

/** Remove a server-side block record when the user unblocks a nickname. */
function removeBlock(name: string) {
  if (typeof window === "undefined") return;
  void supabase
    .from("blocks")
    .delete()
    .eq("blocker_session", getSessionId())
    .eq("blocked_nickname", name)
    .then(({ error }) => {
      if (error) console.error("[blockedUsers] failed to remove block:", error);
    });
}

/**
 * Blocked nicknames, persisted in localStorage. Starts empty and hydrates on
 * mount to avoid a server/client mismatch before the browser is available.
 */
export function useBlockedUsers() {
  const [blockedUsers, setBlockedUsers] = useState<string[]>(() => []);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setBlockedUsers(readBlockedUsers());
    setHydrated(true);
  }, []);

  const isBlocked = (name: string) => blockedUsers.includes(name);

  /** Add a nickname to the block list. Returns true when a new name was added. */
  const addBlockedUser = (name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed || blockedUsers.includes(trimmed)) return false;
    const next = [...blockedUsers, trimmed];
    setBlockedUsers(next);
    writeBlockedUsers(next);
    recordBlock(trimmed);
    return true;
  };

  const removeBlockedUser = (name: string) => {
    const next = blockedUsers.filter((n) => n !== name);
    setBlockedUsers(next);
    writeBlockedUsers(next);
    removeBlock(name);
  };

  return { blockedUsers, hydrated, isBlocked, addBlockedUser, removeBlockedUser };
}
