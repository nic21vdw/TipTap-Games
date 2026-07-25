"use client";

import { create } from "zustand";

export type SheetId = "algo" | "leaderboard" | "theme" | null;

interface UiState {
  sheet: SheetId;
  openSheet: (id: Exclude<SheetId, null>) => void;
  closeSheet: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sheet: null,
  openSheet: (id) => set({ sheet: id }),
  closeSheet: () => set({ sheet: null }),
}));
