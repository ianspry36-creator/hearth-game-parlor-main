import { useEffect, useState } from "react";

/** The access code that unlocks Developer Mode for the current session. */
export const DEV_LOGIN_PASSWORD = "SPRY123456";

const DEV_MODE_KEY = "cardsandgames.dev-mode";

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Developer Mode is a session-scoped flag. It lives in sessionStorage so it
 * clears when the tab closes, but survives navigation within the session.
 */
export function isDeveloperMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DEV_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

export function enableDeveloperMode(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DEV_MODE_KEY, "1");
  } catch {
    // Storage unavailable — Developer Mode simply won't persist.
  }
  notify();
}

export function disableDeveloperMode(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DEV_MODE_KEY);
  } catch {
    // Storage unavailable.
  }
  notify();
}

/**
 * Reactive hook that tracks Developer Mode. Hydrates on mount (to stay in sync
 * with SSR) and re-renders whenever the flag changes during the session.
 */
export function useDeveloperMode(): boolean {
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    setIsDev(isDeveloperMode());
    const listener = () => setIsDev(isDeveloperMode());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return isDev;
}
