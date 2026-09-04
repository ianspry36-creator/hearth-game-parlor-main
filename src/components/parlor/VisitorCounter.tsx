import { useEffect, useState } from "react";
import { getVisitCount, recordVisit } from "@/lib/visitor-count";
import { CardMark } from "@/components/parlor/CardMark";

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
      <CardMark className="size-3 text-gold/70" />
      <span>{count.toLocaleString()} visitors and counting</span>
    </p>
  );
}
