/** Plays the recorded "break" sound clip when hearts are broken. */
import breakMp3 from "@/assets/break.mp3";

let clip: HTMLAudioElement | null = null;

// Preload the smash clip so it can play the instant hearts break (no decode lag).
function getClip(): HTMLAudioElement {
  if (!clip) {
    clip = new Audio(breakMp3);
    clip.preload = "auto";
    clip.load();
  }
  return clip;
}

if (typeof window !== "undefined") getClip();

/**
 * Plays the hearts-broken smash immediately and resolves once it has finished,
 * so the caller can pause play until the sound is done.
 */
export function playHeartsBroken(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const audio = getClip();
  audio.currentTime = 0;
  return new Promise<void>((resolve) => {
    const finish = () => resolve();
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    // Never stall the game on audio trouble.
    window.setTimeout(finish, 4000);
    void audio.play().catch(finish);
  });
}
