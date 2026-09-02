import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AVATAR_OPTIONS, writeAvatar } from "@/lib/avatars";

type Props = {
  avatar: string;
  onSelect: (url: string) => void;
  sad?: boolean;
};

/** Player avatar badge — click to choose a different portrait. */
export function AvatarPicker({ avatar, onSelect, sad = false }: Props) {
  const [open, setOpen] = useState(false);

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
        <div className="grid grid-cols-3 gap-3">
          {AVATAR_OPTIONS.map((option) => (
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
              />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
