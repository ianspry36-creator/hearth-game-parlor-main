import { useEffect, useState } from "react";
import { getVisitCount, recordVisit } from "@/lib/visitor-count";

// Each browser is counted once per session so a single visitor navigating
// between tables doesn't inflate the total.
const VISITED_KEY = "green-cardroom-visited";

export function VisitorCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (!window.localStorage.getItem(VISITED_KEY)) {
          await recordVisit();
          window.localStorage.setItem(VISITED_KEY, "1");
        }
        const total = await getVisitCount();
        if (live) setCount(total);
      } catch {
        // A failed counter shouldn't interrupt the page.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (count == null) return null;

  return (
    <p className="mt-2 flex items-center justify-center gap-1.5 text-ivory/40">
      <svg viewBox="0 0 24 24" aria-hidden className="size-3 text-gold/70" fill="currentColor">
        <path d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0 1 12 6.4 5.3 5.3 0 0 1 21.3 12c-1.8 4.3-9.3 9-9.3 9Z" />
      </svg>
      <span>{count.toLocaleString()} visitors and counting</span>
    </p>
  );
}
