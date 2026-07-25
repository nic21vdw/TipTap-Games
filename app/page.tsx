"use client";

import { Feed } from "@/components/feed/Feed";
import { AlgorithmSheet } from "@/components/sheets/AlgorithmSheet";
import { LeaderboardSheet } from "@/components/sheets/LeaderboardSheet";
import { ThemeSheet } from "@/components/sheets/ThemeSheet";
import { VibeStudio } from "@/components/sheets/VibeStudio";
import { SlidersIcon, SparkleIcon } from "@/components/ui/icons";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useUiStore } from "@/store/useUiStore";

export default function Home() {
  return (
    <main className="relative">
      <Feed />
      <AlgorithmPill />
      <TopRight />
      <AlgorithmSheet />
      <LeaderboardSheet />
      <ThemeSheet />
      <VibeStudio />
    </main>
  );
}

function TopRight() {
  const openSheet = useUiStore((s) => s.openSheet);
  return (
    <button
      onClick={() => openSheet("vibe")}
      aria-label="Vibe code a game"
      className="pressable theme-smooth fixed right-3 top-[calc(env(safe-area-inset-top)+10px)] z-30 flex h-10 items-center gap-1.5 px-3 text-xs font-bold"
      style={{
        background: "rgba(12,18,28,.55)",
        color: "#fff",
        borderRadius: "var(--radius)",
      }}
    >
      <SparkleIcon size={16} /> Make
    </button>
  );
}

function AlgorithmPill() {
  const memories = useAlgorithmStore((s) => s.memories);
  const openSheet = useUiStore((s) => s.openSheet);
  const active = memories.filter((m) => m.enabled).length;
  const name =
    active === 0 ? "Tune your feed" : `${active} rule${active === 1 ? "" : "s"}`;
  return (
    <button
      onClick={() => openSheet("algo")}
      className="pressable theme-smooth fixed left-3 top-[calc(env(safe-area-inset-top)+10px)] z-30 flex h-10 items-center gap-1.5 px-3 text-xs font-bold"
      style={{
        background: "rgba(12,18,28,.55)",
        color: "#fff",
        borderRadius: "var(--radius)",
        fontFamily: "var(--font-body)",
      }}
    >
      <SlidersIcon size={16} /> {name}
    </button>
  );
}
