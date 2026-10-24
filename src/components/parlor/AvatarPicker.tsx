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
import {
  AVATAR_OPTIONS,
  isBuildAvatar,
  readLastBuildAvatar,
  writeAvatar,
  type AvatarCategory,
} from "@/lib/avatars";
import { BuildAvatarPanel } from "@/components/parlor/BuildAvatarPanel";

type Props = {
  avatar: string;
  onSelect: (url: string) => void;
  sad?: boolean;
  /** Tailwind size class for the badge (defaults to a compact 2rem). */
  size?: string;
};

const CATEGORIES: { value: AvatarCategory; label: string }[] = [
  { value: "people", label: "People" },
  { value: "animals", label: "Animals" },
  { value: "objects", label: "Objects" },
  { value: "aliens", label: "Aliens" },
];

/** Which picker tab to open: the Build tab for built avatars, or the category
 * the currently selected portrait belongs to (People/Animals/Objects/Aliens). */
function initialTab(avatar: string): string {
  if (isBuildAvatar(avatar)) return "build";
  return AVATAR_OPTIONS.find((option) => option.url === avatar)?.category ?? "people";
}

/** The avatar URL to pre-fill the Build tab: the current avatar when it was
 * built in the Build tab, otherwise the most recently saved build. This way
 * switching to a People/Animals/Objects/Aliens portrait doesn't forget the
 * player's last build — returning to the Build tab still shows it. */
function buildInitialUrl(avatar: string): string | undefined {
  if (isBuildAvatar(avatar)) return avatar;
  return readLastBuildAvatar() ?? undefined;
}

/** Player avatar badge — click to choose a different portrait. */
export function AvatarPicker({ avatar, onSelect, sad = false, size = "size-8" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Change your avatar"
          className={`grid ${size} place-items-center overflow-hidden rounded-full bg-gold/20 ring-1 ring-gold/40 transition-transform hover:scale-110 focus-visible:scale-110`}
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
      <DialogContent className="border-gold/25 bg-brand text-cream sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Choose your avatar</DialogTitle>
          <DialogDescription className="text-ivory/65">
            Pick the portrait that sits at your side of the table.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={initialTab(avatar)}>
          <TabsList className="grid w-full grid-cols-5">
            {CATEGORIES.map((category) => (
              <TabsTrigger key={category.value} value={category.value} className="text-foreground">
                {category.label}
              </TabsTrigger>
            ))}
            <TabsTrigger value="build" className="text-foreground">
              Build
            </TabsTrigger>
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
          <TabsContent value="build">
            <BuildAvatarPanel
              onSelect={onSelect}
              onClose={() => setOpen(false)}
              initialUrl={buildInitialUrl(avatar)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
