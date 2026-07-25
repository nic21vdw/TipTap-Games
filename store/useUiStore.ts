"use client";

import { create } from "zustand";
import type { GameAttachment } from "@/lib/social";

export type SheetId =
  | "algo"
  | "leaderboard"
  | "theme"
  | "create"
  | "account"
  | "profile"
  | "messages"
  | null;

interface UiState {
  sheet: SheetId;
  /** account whose profile the "profile" sheet is showing */
  profileId: string | null;
  /** a game queued to ride along with the next message you send */
  shareGame: GameAttachment | null;
  /** uid of the card the player has taken control of, if any */
  playingUid: number | null;
  openSheet: (id: Exclude<SheetId, null>) => void;
  closeSheet: () => void;
  viewProfile: (accountId: string) => void;
  shareToDm: (game: GameAttachment) => void;
  clearShare: () => void;
  enterPlay: (uid: number) => void;
  exitPlay: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sheet: null,
  profileId: null,
  shareGame: null,
  playingUid: null,
  openSheet: (id) => set({ sheet: id }),
  closeSheet: () => set({ sheet: null }),
  viewProfile: (accountId) => set({ sheet: "profile", profileId: accountId }),
  shareToDm: (game) => set({ sheet: "messages", shareGame: game }),
  clearShare: () => set({ shareGame: null }),
  enterPlay: (uid) => set({ playingUid: uid }),
  exitPlay: () => set({ playingUid: null }),
}));
