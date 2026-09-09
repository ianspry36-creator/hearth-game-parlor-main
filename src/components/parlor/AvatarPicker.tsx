import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AVATAR_OPTIONS, writeAvatar, type AvatarCategory } from "@/lib/avatars";

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
