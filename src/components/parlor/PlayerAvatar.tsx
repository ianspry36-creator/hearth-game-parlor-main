import { AvatarPicker } from "@/components/parlor/AvatarPicker";
import { useChatMessage } from "@/components/parlor/ChatContext";

/** The player's avatar badge with the latest chat message appearing at the upper-right of it. */
export function PlayerAvatar({
  avatar,
  onSelect,
  sad = false,
  message,
}: {
  avatar: string;
  onSelect: (url: string) => void;
  sad?: boolean;
  message?: string;
}) {
  const chatMessage = useChatMessage();
  const bubble = message ?? chatMessage;
  return (
    <div className="relative inline-block">
      <AvatarPicker avatar={avatar} onSelect={onSelect} sad={sad} />
      {bubble && (
        <div className="absolute bottom-full left-full z-10 mb-2 ml-2 w-max max-w-[16rem]">
          <div className="relative rounded-2xl border border-gold/30 bg-cream px-3 py-1.5 text-sm font-medium text-brand shadow-lg">
            <span
              aria-hidden
              className="absolute -bottom-2 left-5 size-3 rotate-45 border-b border-r border-gold/30 bg-cream"
            />
            {bubble}
          </div>
        </div>
      )}
    </div>
  );
}
