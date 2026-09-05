import ada from "@/assets/avatar-ada.png";
import adaHappy from "@/assets/avatar-ada-happy.png";
import adaSad from "@/assets/avatar-ada-sad.png";
import a13 from "@/assets/avatar-13.png";
import a14 from "@/assets/avatar-14.png";
import a15 from "@/assets/avatar-15.png";
import a16 from "@/assets/avatar-16.png";
import a17 from "@/assets/avatar-17.png";
import a18 from "@/assets/avatar-18.png";
import a19 from "@/assets/avatar-19.png";
import a20 from "@/assets/avatar-20.png";
import a21 from "@/assets/avatar-21.png";
import a22 from "@/assets/avatar-22.png";
import a23 from "@/assets/avatar-23.png";
import a24 from "@/assets/avatar-24.png";

export const ADA_AVATAR = ada;
export const ADA_HAPPY = adaHappy;
export const ADA_SAD = adaSad;

export type AvatarOption = { id: string; url: string; label: string };

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "a13", url: a13, label: "Braided crown, gold hoops" },
  { id: "a14", url: a14, label: "Silver hair and round glasses" },
  { id: "a15", url: a15, label: "Long dark hair, nose ring" },
  { id: "a16", url: a16, label: "Beard and flat cap" },
  { id: "a17", url: a17, label: "Red curls and freckles" },
  { id: "a18", url: a18, label: "Buzz cut and turtleneck" },
  { id: "a19", url: a19, label: "Silver curls and hoops" },
  { id: "a20", url: a20, label: "Dark hair and beard" },
  { id: "a21", url: a21, label: "Sleek bob" },
  { id: "a22", url: a22, label: "Patterned headscarf" },
  { id: "a23", url: a23, label: "Spectacles and bow tie" },
  { id: "a24", url: a24, label: "Short locs" },
];

const KEY = "parlor.avatar";

export function readAvatar(): string {
  if (typeof window === "undefined") return AVATAR_OPTIONS[0]!.url;
  const stored = window.localStorage.getItem(KEY);
  const match = AVATAR_OPTIONS.find((option) => option.id === stored);
  return (match ?? AVATAR_OPTIONS[0]!).url;
}

export function writeAvatar(id: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, id);
}
