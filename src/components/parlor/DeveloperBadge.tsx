import { useDeveloperMode } from "@/lib/dev-mode";

/**
 * A small "DEV" marker pinned to the very top-right corner of the viewport
 * whenever Developer Mode is active. Rendered once in the root shell so it
 * appears on every table (and page) for the rest of the session.
 */
export function DeveloperBadge() {
  const isDev = useDeveloperMode();
  if (!isDev) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-50">
      <span className="rounded-md border border-gold/40 bg-gold/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
        DEV
      </span>
    </div>
  );
}
