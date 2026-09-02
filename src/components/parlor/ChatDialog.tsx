import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const CHAT_PHRASES = [
  "Hi!",
  "Your turn",
  "Technical difficulties",
  "Oops!",
  "Well played",
  "May the force be with you",
];

export const CHAT_EMOJIS = ["😀", "😅", "😮", "🎉", "🤔", "👏"];

export function ChatDialog({
  open,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (message: string) => void;
}) {
  const send = (message: string) => {
    onSend(message);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-gold/25 bg-surface sm:max-w-md">
        <DialogHeader>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Table chat</p>
          <DialogTitle className="font-display text-3xl font-bold">Say something</DialogTitle>
          <DialogDescription className="text-ivory/70">
            Pick a message and it appears beside your icon.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {CHAT_PHRASES.map((phrase) => (
            <button
              key={phrase}
              onClick={() => send(phrase)}
              className="w-full rounded-lg border border-gold/20 bg-brand/50 px-4 py-2.5 text-left text-sm text-ivory/85 transition-colors hover:border-gold hover:bg-gold/15"
            >
              {phrase}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-2">
          {CHAT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              aria-label={`Send ${emoji}`}
              onClick={() => send(emoji)}
              className="grid h-11 place-items-center rounded-lg border border-gold/20 bg-brand/50 text-xl transition-colors hover:border-gold hover:bg-gold/15"
            >
              {emoji}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
