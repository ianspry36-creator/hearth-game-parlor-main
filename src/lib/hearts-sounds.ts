/** Plays the recorded "break" sound clip when hearts are broken. */
import breakMp3 from "@/assets/break.mp3";

let clip: HTMLAudioElement | null = null;

export function playHeartsBroken() {
  if (typeof window === "undefined") return;
  if (!clip) clip = new Audio(breakMp3);
  clip.currentTime = 0;
  void clip.play().catch(() => {});
}
