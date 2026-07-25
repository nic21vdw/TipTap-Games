"use client";

import { Feed } from "@/components/feed/Feed";
import { AlgorithmSheet } from "@/components/sheets/AlgorithmSheet";
import { LeaderboardSheet } from "@/components/sheets/LeaderboardSheet";
import { ThemeSheet } from "@/components/sheets/ThemeSheet";
import { PRESETS } from "@/lib/algorithm";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useUiStore } from "@/store/useUiStore";

export default function Home() {
  return (
    <main className="relative">
      <Feed />
      <AlgorithmPill />
      <AlgorithmSheet />
      <LeaderboardSheet />
      <ThemeSheet />
    </main>
  );
}

function AlgorithmPill() {
  const presetId = useAlgorithmStore((s) => s.presetId);
  const openSheet = useUiStore((s) => s.openSheet);
  const name = PRESETS.find((p) => p.id === presetId)?.name ?? "Custom";
  return (
    <button
      onClick={() => openSheet("algo")}
      className="pressable theme-smooth fixed left-3 top-[calc(env(safe-area-inset-top)+14px)] z-30 px-3 py-1.5 text-xs font-bold"
      style={{
        background: "color-mix(in srgb, var(--surface) 85%, transparent)",
        color: "var(--ink)",
        borderRadius: "var(--radius)",
        fontFamily: "var(--font-body)",
      }}
    >
      ⚙ {name}
    </button>
  );
}
