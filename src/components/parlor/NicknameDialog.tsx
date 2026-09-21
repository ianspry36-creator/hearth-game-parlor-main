import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getNickname, setNickname } from "@/lib/multiplayer";
import { moderateNickname } from "@/lib/moderation";
import {
  INAPPROPRIATE_NAME_MESSAGE,
  MAX_NICKNAME_LENGTH,
  NICKNAME_TOO_LONG_MESSAGE,
} from "@/lib/nickname";

type Props = {
  /** The element that opens the dialog (usually the player's clickable name). */
  trigger: ReactNode;
  /** Called after a successful save with the new nickname. */
  onSaved?: (name: string) => void;
};

/** Popup that asks "What's your nickname?" — opened by clicking the player's name. */
export function NicknameDialog({ trigger, onSaved }: Props) {
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
    setOpen(false);
    onSaved?.(value);
  };

  const unchanged = draft.trim() === nickname;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="border-gold/25 bg-brand text-cream sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">What&apos;s your nickname?</DialogTitle>
          <DialogDescription className="text-ivory/65">
            This is the name other players see at your side of the table.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitNickname();
          }}
        >
          <div className="flex gap-2">
            <Input
              id="nickname"
              value={draft}
              maxLength={MAX_NICKNAME_LENGTH}
              autoFocus
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
      </DialogContent>
    </Dialog>
  );
}
