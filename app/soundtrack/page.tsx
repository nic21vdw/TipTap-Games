import type { Metadata } from "next";
import { Jukebox } from "@/components/soundtrack/Jukebox";

export const metadata: Metadata = {
  title: "Soundtrack — Tip Tap Games",
  description:
    "Nic Bops volumes 1 to 3: every track the feed plays, exactly as it ships.",
};

export default function SoundtrackPage() {
  return <Jukebox />;
}
