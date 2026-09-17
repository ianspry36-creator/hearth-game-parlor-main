import { useState } from "react";
import { Check, Plus, Settings, ShieldOff, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { THEME_OPTIONS, readTheme, writeTheme, type ThemeId } from "@/lib/theme";
import { EFFECT_OPTIONS, readEffect, writeEffect, type EffectId } from "@/lib/effects";
import { useBlockedUsers } from "@/lib/blockedUsers";

type Props = {
  className?: string;
};

/** Settings gear — opens a dialog to change the parlour's colours and background. */
export function SettingsDialog({ className }: Props) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => readTheme());
  const [candidate, setCandidate] = useState<ThemeId>(theme);
  const [effect, setEffect] = useState<EffectId>(() => readEffect());
  const [effectCandidate, setEffectCandidate] = useState<EffectId>(effect);
  const { blockedUsers, addBlockedUser, removeBlockedUser } = useBlockedUsers();
  const [blockDraft, setBlockDraft] = useState("");

  const submitBlock = () => {
    if (addBlockedUser(blockDraft)) setBlockDraft("");
  };

  const applyThemeOption = (id: ThemeId) => {
    setTheme(id);
    setCandidate(id);
    writeTheme(id);
    setOpen(false);
  };

  const applyEffectOption = (id: EffectId) => {
    setEffect(id);
    setEffectCandidate(id);
    writeEffect(id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          className={cn(
            "grid size-11 place-items-center rounded-full border border-gold/25 bg-surface/40 text-ivory/70 transition-colors hover:border-gold/60 hover:text-gold",
            className,
          )}
        >
          <Settings className="size-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="border-gold/25 bg-brand text-cream sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="colours">
          <TabsList className="grid w-full grid-cols-3 rounded-xl border border-gold/25 bg-surface p-1">
            <TabsTrigger value="colours" className="data-[state=active]:bg-gold data-[state=active]:text-brand">
              Colours
            </TabsTrigger>
            <TabsTrigger value="effects" className="data-[state=active]:bg-gold data-[state=active]:text-brand">
              Effects
            </TabsTrigger>
            <TabsTrigger value="blocked" className="data-[state=active]:bg-gold data-[state=active]:text-brand">
              Block Users
            </TabsTrigger>
          </TabsList>

          <TabsContent value="colours" className="min-h-[33rem]">
            <div className="grid grid-cols-4 gap-3">
              {THEME_OPTIONS.map((option) => {
                const active = option.id === theme;
                const selected = option.id === candidate;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCandidate(option.id)}
                    onDoubleClick={() => applyThemeOption(option.id)}
                    aria-pressed={active}
                    className={cn(
                      "relative h-28 w-full select-none overflow-hidden rounded-xl border text-left transition-all",
                      selected ? "-translate-y-0.5 border-gold ring-2 ring-gold" : "border-gold/20 hover:border-gold/50",
                    )}
                    style={{ background: `linear-gradient(135deg, ${option.swatch.brand}, ${option.swatch.accent})` }}
                  >
                    <span className="absolute inset-x-0 bottom-0 bg-black/45 px-2 py-1.5 font-display text-sm font-semibold text-cream">
                      {option.label}
                    </span>
                    {active && (
                      <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-gold text-brand">
                        <Check className="size-4" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => applyThemeOption(candidate)}
                disabled={candidate === theme}
                className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-brand transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select
              </button>
            </div>
          </TabsContent>

          <TabsContent value="effects" className="min-h-[33rem]">
            <div className="grid grid-cols-2 gap-3">
              {EFFECT_OPTIONS.map((option) => {
                const active = option.id === effect;
                const selected = option.id === effectCandidate;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setEffectCandidate(option.id)}
                    onDoubleClick={() => applyEffectOption(option.id)}
                    aria-pressed={active}
                    className={cn(
                      "relative overflow-hidden rounded-2xl border p-2 text-left transition-all",
                      selected ? "border-gold ring-2 ring-gold" : "border-gold/20 hover:border-gold/50",
                    )}
                  >
                    <span
                      className={cn(
                        "block h-24 w-full rounded-xl border border-white/10 bg-surface",
                        option.id !== "none" && `fx-${option.id}`,
                      )}
                    />
                    <span className="mt-2 block font-display text-base font-semibold">{option.label}</span>
                    {active && (
                      <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-gold text-brand">
                        <Check className="size-4" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => applyEffectOption(effectCandidate)}
                disabled={effectCandidate === effect}
                className="rounded-lg bg-gold px-5 py-2 text-sm font-semibold text-brand transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select
              </button>
            </div>
          </TabsContent>

          <TabsContent value="blocked" className="min-h-[33rem]">
            <p className="text-sm text-ivory/70">
              Blocked players are hidden from your invites and waiting room. Add a nickname below to block it.
            </p>

            <form
              className="mt-4 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitBlock();
              }}
            >
              <input
                type="text"
                value={blockDraft}
                onChange={(event) => setBlockDraft(event.target.value)}
                placeholder="Nickname to block"
                maxLength={10}
                aria-label="Nickname to block"
                className="h-10 flex-1 rounded-lg border border-gold/25 bg-surface/60 px-3 text-base text-cream placeholder:text-ivory/40 focus:border-gold/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!blockDraft.trim()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gold px-4 text-sm font-semibold text-brand transition-colors hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-4" />
                Add
              </button>
            </form>

            {blockedUsers.length === 0 ? (
              <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-gold/20 bg-surface/20 px-6 py-8 text-center">
                <ShieldOff className="size-6 text-gold/40" />
                <p className="font-display text-base text-ivory/50">No blocked users</p>
                <p className="text-sm text-ivory/40">You haven't blocked anyone yet.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {blockedUsers.map((name) => (
                  <li
                    key={name}
                    className="flex items-center justify-between rounded-lg border border-gold/20 bg-surface/40 px-3 py-2"
                  >
                    <span className="font-display text-base font-semibold">{name}</span>
                    <button
                      type="button"
                      onClick={() => removeBlockedUser(name)}
                      aria-label={`Unblock ${name}`}
                      title={`Unblock ${name}`}
                      className="grid size-8 place-items-center rounded-full text-ivory/50 transition-colors hover:bg-gold/15 hover:text-gold"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
