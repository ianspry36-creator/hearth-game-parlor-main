import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BOT_AVATAR_OPTIONS, writeBotAvatar, type BotId } from "@/lib/avatars";

type Props = {
  bot: BotId;
  /** Display name used for the trigger's accessibility labels and alt text. */
  name: string;
  /** The bot's current portrait (URL). */
  avatar: string;
  /** Called with the new portrait URL once the player picks a robot. */
  onSelect: (url: string) => void;
  /** Tailwind classes applied to the <img> (size, rounding, border, etc.). */
  imgClassName?: string;
  /** Extra Tailwind classes for the trigger button (e.g. the circular frame). */
  buttonClassName?: string;
  /** Pixel dimensions for the img width/height attributes. */
  width?: number;
  height?: number;
  alt?: string;
  /** Overlays rendered inside the trigger (e.g. a countdown badge). */
  children?: ReactNode;
};

/**
 * A computer opponent's portrait. Clicking it opens the picker so the player
 * can dress up Ada, Ace, or Leo — choosing one of the three standard faces or
 * a robot — the same way they change their own avatar. The choice is stored
 * per-bot in localStorage via writeBotAvatar.
 */
export function BotAvatar({
  bot,
  name,
  avatar,
  onSelect,
  imgClassName = "size-14 rounded-full border-2 border-gold/40 bg-surface object-contain",
  buttonClassName = "block rounded-full",
  width = 56,
  height = 56,
  alt,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Change ${name}'s avatar`}
          title={`Change ${name}'s avatar`}
          className={`transition-transform hover:scale-110 focus-visible:scale-110 ${buttonClassName}`}
        >
          <img
            src={avatar}
            alt={alt ?? name}
            width={width}
            height={height}
            loading="lazy"
            className={imgClassName}
          />
          {children}
        </button>
      </DialogTrigger>
      <DialogContent className="border-gold/25 bg-brand text-cream sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Computer Avatar</DialogTitle>
          <DialogDescription className="text-ivory/65">Pick a portrait.</DialogDescription>
        </DialogHeader>
        <div className="avatar-scroll grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto overscroll-contain pr-1">
          {BOT_AVATAR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                writeBotAvatar(bot, option.id);
                onSelect(option.url);
                setOpen(false);
              }}
              className={`flex flex-col items-center gap-1 rounded-xl p-2 ring-2 transition-transform hover:scale-105 ${
                option.url === avatar ? "ring-gold" : "ring-gold/20"
              }`}
            >
              <img
                src={option.url}
                alt={option.label}
                width={128}
                height={128}
                loading="lazy"
                className={`aspect-square w-full object-contain ${
                  option.category === "robots" ? "rounded-xl" : "rounded-full"
                }`}
              />
              <span className="w-full truncate text-center text-[10px] leading-tight text-ivory/70">
                {option.label}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
