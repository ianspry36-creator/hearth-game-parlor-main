import { useEffect, useState } from "react";

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
    return true;
  };

  const removeBlockedUser = (name: string) => {
    const next = blockedUsers.filter((n) => n !== name);
    setBlockedUsers(next);
    writeBlockedUsers(next);
  };

  return { blockedUsers, hydrated, isBlocked, addBlockedUser, removeBlockedUser };
}
