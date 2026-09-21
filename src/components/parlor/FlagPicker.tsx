import { useState } from "react";
import { Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FLAGS, flagUrl, readFlag, writeFlag } from "@/lib/flags";

/**
 * A standalone flag picker opened by clicking a player's flag in game. Selecting
 * (or clearing) a flag persists it and closes, and the new value is reported to
 * the caller via `onSelect` so the table updates immediately.
 */
export function FlagPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (code: string | null) => void;
}) {
  const [flag, setFlag] = useState<string | null>(() => readFlag());
  const [search, setSearch] = useState("");

  const filteredFlags = FLAGS.filter((country) =>
    country.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const select = (code: string | null) => {
    setFlag(code);
    writeFlag(code);
    onSelect?.(code);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-gold/25 bg-brand text-cream sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Choose your flag</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-ivory/70">
          Pick a flag to show next to your name at the table. Search to find your country.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search for a country…"
            aria-label="Search for a country"
            className="h-10 flex-1 rounded-lg border border-gold/25 bg-surface/60 px-3 text-base text-cream placeholder:text-ivory/40 focus:border-gold/60 focus:outline-none"
          />
          {flag && (
            <button
              type="button"
              onClick={() => select(null)}
              title="Clear flag"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gold/25 px-3 text-sm font-semibold text-ivory/80 transition-colors hover:border-gold/60 hover:text-gold"
            >
              <X className="size-4" />
              Clear
            </button>
          )}
        </div>

        {filteredFlags.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-gold/20 bg-surface/20 px-6 py-8 text-center">
            <p className="font-display text-base text-ivory/50">No matches</p>
            <p className="text-sm text-ivory/40">Try a different search term.</p>
          </div>
        ) : (
          <div className="mt-4 max-h-[26rem] overflow-y-auto rounded-lg pr-1">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {filteredFlags.map((country) => {
                const active = country.code === flag;
                return (
                  <li key={country.code}>
                    <button
                      type="button"
                      onClick={() => select(country.code)}
                      aria-pressed={active}
                      title={country.name}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors",
                        active
                          ? "border-gold bg-gold/10 ring-2 ring-gold"
                          : "border-gold/20 bg-surface/40 hover:border-gold/50",
                      )}
                    >
                      <img
                        src={flagUrl(country.code)}
                        alt=""
                        aria-hidden
                        className="size-6 shrink-0 rounded-sm border border-black/10 object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-cream">{country.name}</span>
                      {active && <Check className="size-4 shrink-0 text-gold" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
