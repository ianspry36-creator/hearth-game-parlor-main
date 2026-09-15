import { AvatarPicker } from "@/components/parlor/AvatarPicker";
import { useChatMessage } from "@/components/parlor/ChatContext";
import { SpeechBubble } from "@/components/parlor/SpeechBubble";

/** The player's avatar badge with the latest chat message appearing at the upper-right of it. */
export function PlayerAvatar({
  avatar,
  onSelect,
  sad = false,
  message,
  size,
}: {
  avatar: string;
  onSelect: (url: string) => void;
  sad?: boolean;
  message?: string;
  size?: string;
}) {
  const chatMessage = useChatMessage();
  const bubble = message ?? chatMessage;
  return (
    <div className="relative inline-block">
      <AvatarPicker avatar={avatar} onSelect={onSelect} sad={sad} size={size} />
      {bubble && (
        <div className="absolute bottom-full left-full z-10 mb-2 ml-2">
          <SpeechBubble text={bubble} />
        </div>
      )}
    </div>
  );
}
