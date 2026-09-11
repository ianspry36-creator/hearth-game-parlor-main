import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AVATAR_OPTIONS, writeAvatar, type AvatarCategory } from "@/lib/avatars";
import { getNickname, setNickname } from "@/lib/multiplayer";
import { moderateNickname } from "@/lib/moderation";
import {
  INAPPROPRIATE_NAME_MESSAGE,
  MAX_NICKNAME_LENGTH,
  NICKNAME_TOO_LONG_MESSAGE,
} from "@/lib/nickname";

type Props = {
  avatar: string;
  onSelect: (url: string) => void;
  sad?: boolean;
};

const CATEGORIES: { value: AvatarCategory; label: string }[] = [
  { value: "people", label: "People" },
  { value: "animals", label: "Animals" },
  { value: "objects", label: "Objects" },
  { value: "aliens", label: "Aliens" },
];

/** Player avatar badge — click to choose a different portrait. */
export function AvatarPicker({ avatar, onSelect, sad = false }: Props) {
  const [open, setOpen] = useState(false);
  const [nickname, setCurrentNickname] = useState(() => getNickname() ?? "");
  const [draft, setDraft] = useState(() => getNickname() ?? "");
  const [nickError, setNickError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-sync the field each time the dialog opens so edits elsewhere are reflected.
  useEffect(() => {
    if (!open) return;
    const current = getNickname() ?? "";
    setCurrentNickname(current);
    setDraft(current);
    setNickError(null);
  }, [open]);

  const submitNickname = async () => {
    const value = draft.trim();
    if (!value) return;
    if (value.length > MAX_NICKNAME_LENGTH) {
      setNickError(NICKNAME_TOO_LONG_MESSAGE);
      return;
    }
    setSaving(true);
    setNickError(null);
    const result = await moderateNickname(value);
    setSaving(false);
    if (!result.allowed) {
      setNickError(INAPPROPRIATE_NAME_MESSAGE);
      return;
    }
    setNickname(value);
    setCurrentNickname(value);
  };

  const unchanged = draft.trim() === nickname;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Change your avatar"
          className="grid size-8 place-items-center overflow-hidden rounded-full bg-gold/20 ring-1 ring-gold/40 transition-transform hover:scale-110 focus-visible:scale-110"
        >
          <img
            src={avatar}
            alt="Your avatar"
            width={64}
            height={64}
            loading="lazy"
            className={`size-full object-cover ${sad ? "grayscale brightness-90" : ""}`}
          />
        </button>
      </DialogTrigger>
      <DialogContent className="border-gold/25 bg-brand text-cream sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Choose your avatar</DialogTitle>
          <DialogDescription className="text-ivory/65">
            Pick the portrait that sits at your side of the table.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitNickname();
          }}
        >
          <label
            htmlFor="avatar-nickname"
            className="block text-[11px] font-medium uppercase tracking-[0.22em] text-ivory/70"
          >
            What&apos;s your nickname?
          </label>
          <div className="flex gap-2">
            <Input
              id="avatar-nickname"
              value={draft}
              maxLength={MAX_NICKNAME_LENGTH}
              onChange={(event) => {
                setDraft(event.target.value);
                setNickError(null);
              }}
              placeholder="e.g. Cardboard Jack"
              className="border-gold/30 bg-brand/60 text-cream placeholder:text-ivory/40"
            />
            <Button
              type="submit"
              variant="parlor"
              size="sm"
              className="shrink-0"
              disabled={saving || !draft.trim() || unchanged}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
          {nickError && <p className="text-xs text-red-300">{nickError}</p>}
        </form>
        <Tabs defaultValue="people">
          <TabsList className="grid w-full grid-cols-4">
            {CATEGORIES.map((category) => (
              <TabsTrigger key={category.value} value={category.value}>
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {CATEGORIES.map((category) => (
            <TabsContent key={category.value} value={category.value}>
              <div className="avatar-scroll grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto overscroll-contain pr-1">
                {AVATAR_OPTIONS.filter((option) => option.category === category.value).map(
                  (option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        writeAvatar(option.id);
                        onSelect(option.url);
                        setOpen(false);
                      }}
                      className={`overflow-hidden rounded-full ring-2 transition-transform hover:scale-105 ${
                        option.url === avatar ? "ring-gold" : "ring-gold/20"
                      }`}
                    >
                      <img
                        src={option.url}
                        alt={option.label}
                        width={128}
                        height={128}
                        loading="lazy"
                        className="size-full object-cover"
                        style={option.scale ? { transform: `scale(${option.scale})` } : undefined}
                      />
                    </button>
                  ),
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
