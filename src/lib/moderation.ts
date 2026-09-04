import { supabase } from "@/integrations/supabase/client";
import { isInappropriateNickname } from "@/lib/nickname";

export type ModerationResult = {
  /** False when the nickname must be rejected. */
  allowed: boolean;
  /** Which layer flagged it (for debugging); null when allowed. */
  flaggedBy: "local" | "server" | null;
};

/**
 * Validates a nickname against both the client-side matcher and the
 * server-side moderation Edge Function (Tisane Labs + a local blocklist).
 *
 * The client-side matcher runs first so obvious/obfuscated cases fail fast
 * without a network round trip. If the Edge Function is unreachable or the
 * Tisane key is not configured, we fail open — the local matcher remains the
 * last line of defense in that case.
 */
export async function moderateNickname(value: string): Promise<ModerationResult> {
  if (isInappropriateNickname(value)) {
    return { allowed: false, flaggedBy: "local" };
  }

  try {
    const { data, error } = await supabase.functions.invoke("moderate-nickname", {
      body: { nickname: value },
    });
    if (error) return { allowed: true, flaggedBy: null };
    const ok = Boolean(data && typeof data === "object" && (data as { ok?: boolean }).ok);
    return ok ? { allowed: true, flaggedBy: null } : { allowed: false, flaggedBy: "server" };
  } catch {
    return { allowed: true, flaggedBy: null };
  }
}
