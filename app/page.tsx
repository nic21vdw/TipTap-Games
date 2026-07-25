"use client";

import { Feed } from "@/components/feed/Feed";
import { AlgorithmSheet } from "@/components/sheets/AlgorithmSheet";
import { LeaderboardSheet } from "@/components/sheets/LeaderboardSheet";
import { SearchSheet } from "@/components/sheets/SearchSheet";
import { ThemeSheet } from "@/components/sheets/ThemeSheet";
import { SearchIcon, SlidersIcon } from "@/components/ui/icons";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useUiStore } from "@/store/useUiStore";

export default function Home() {
  return (
    <main className="relative">
      <Feed />
      <AlgorithmPill />
      <SearchButton />
      <AlgorithmSheet />
      <LeaderboardSheet />
      <ThemeSheet />
      <SearchSheet />
    </main>
  );
}

function SearchButton() {
  const openSheet = useUiStore((s) => s.openSheet);
  return (
    <button
      onClick={() => openSheet("search")}
      aria-label="Search and generate games"
      className="pressable theme-smooth fixed right-3 top-[calc(env(safe-area-inset-top)+10px)] z-30 flex h-10 w-10 items-center justify-center"
      style={{
        background: "color-mix(in srgb, var(--surface) 85%, transparent)",
        color: "var(--ink)",
        borderRadius: "var(--radius)",
      }}
    >
      <SearchIcon size={20} />
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
        background: "color-mix(in srgb, var(--surface) 85%, transparent)",
        color: "var(--ink)",
        borderRadius: "var(--radius)",
        fontFamily: "var(--font-body)",
      }}
    >
      <SlidersIcon size={16} /> {name}
    </button>
  );
}
