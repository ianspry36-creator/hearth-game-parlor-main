import { createContext, useContext } from "react";

/** Holds the latest table-chat message so it can be shown beside the player avatar. */
export const ChatContext = createContext<string | null>(null);

export function useChatMessage(): string | null {
  return useContext(ChatContext);
}
