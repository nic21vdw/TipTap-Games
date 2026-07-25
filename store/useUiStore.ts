"use client";

import { create } from "zustand";

export type SheetId =
  | "algo"
  | "leaderboard"
  | "theme"
  | "search"
  | "account"
  | null;

interface UiState {
  sheet: SheetId;
  /** uid of the card the player has taken control of, if any */
  playingUid: number | null;
  openSheet: (id: Exclude<SheetId, null>) => void;
  closeSheet: () => void;
  enterPlay: (uid: number) => void;
  exitPlay: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sheet: null,
  playingUid: null,
  openSheet: (id) => set({ sheet: id }),
  closeSheet: () => set({ sheet: null }),
  enterPlay: (uid) => set({ playingUid: uid }),
  exitPlay: () => set({ playingUid: null }),
}));
