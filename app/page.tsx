"use client";

import { useEffect } from "react";
import { Feed } from "@/components/feed/Feed";
import { AccountSheet } from "@/components/sheets/AccountSheet";
import { AlgorithmSheet } from "@/components/sheets/AlgorithmSheet";
import { GamesSheet } from "@/components/sheets/GamesSheet";
import { LeaderboardSheet } from "@/components/sheets/LeaderboardSheet";
import { SearchSheet } from "@/components/sheets/SearchSheet";
import { SettingsSheet } from "@/components/sheets/SettingsSheet";
import { ThemeSheet } from "@/components/sheets/ThemeSheet";
import { GearIcon, GridIcon, SearchIcon, SlidersIcon } from "@/components/ui/icons";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useUiStore } from "@/store/useUiStore";

export default function Home() {
  // Restores a session if one exists. A guest never sees this happen.
  const init = useAuthStore((s) => s.init);
  useEffect(() => init(), [init]);

  return (
    <main className="relative">
      <Feed />
      <AlgorithmPill />
      <TopRightButtons />
      <AlgorithmSheet />
      <LeaderboardSheet />
      <ThemeSheet />
      <SearchSheet />
      <SettingsSheet />
      <GamesSheet />
      <AccountSheet />
    </main>
  );
}

function TopRightButtons() {
  const openSheet = useUiStore((s) => s.openSheet);
  return (
    <div className="fixed right-3 top-[calc(var(--safe-top)+10px)] z-30 flex gap-2">
      <button
        onClick={() => openSheet("games")}
        aria-label="Browse all games"
        className="pressable theme-smooth flex h-10 w-10 items-center justify-center"
        style={{
          background: "rgba(12,18,28,.55)",
          color: "#fff",
          borderRadius: "var(--radius)",
        }}
      >
        <GridIcon size={20} />
      </button>
      <button
        onClick={() => openSheet("search")}
        aria-label="Search and generate games"
        className="pressable theme-smooth flex h-10 w-10 items-center justify-center"
        style={{
          background: "rgba(12,18,28,.55)",
          color: "#fff",
          borderRadius: "var(--radius)",
        }}
      >
        <SearchIcon size={20} />
      </button>
    </div>
  );
}

function TopRightButtons() {
  const openSheet = useUiStore((s) => s.openSheet);
  const chrome = {
    background: "rgba(12,18,28,.55)",
    color: "#fff",
    borderRadius: "var(--radius)",
  };
  return (
    <div className="fixed right-3 top-[calc(var(--safe-top)+10px)] z-30 flex items-center gap-2">
      <button
        onClick={() => openSheet("settings")}
        aria-label="Settings"
        className="pressable theme-smooth flex h-10 w-10 items-center justify-center"
        style={chrome}
      >
        <GearIcon size={20} />
      </button>
      <button
        onClick={() => openSheet("search")}
        aria-label="Search and generate games"
        className="pressable theme-smooth flex h-10 w-10 items-center justify-center"
        style={chrome}
      >
        <SearchIcon size={20} />
      </button>
    </div>
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
      className="pressable theme-smooth fixed left-3 top-[calc(var(--safe-top)+10px)] z-30 flex h-10 items-center gap-1.5 px-3 text-xs font-bold"
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
