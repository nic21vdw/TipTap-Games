"use client";

import { create } from "zustand";
import {
  DEFAULT_VECTOR,
  PRESETS,
  type AlgorithmVector,
} from "@/lib/algorithm";
import type { GameTag } from "@/games/types";
import { loadJson, saveJson } from "@/lib/storage";

export type TagMode = "neutral" | "only" | "block";

interface AlgorithmState {
  vector: AlgorithmVector;
  presetId: string | null; // null = custom
  hydrate: () => void;
  setSlider: (
    key: "intensity" | "luck" | "nostalgia" | "variety",
    value: number
  ) => void;
  cycleTag: (tag: GameTag) => void;
  tagMode: (tag: GameTag) => TagMode;
  applyPreset: (id: string) => void;
}

function persist(vector: AlgorithmVector, presetId: string | null) {
  saveJson("algo", { vector, presetId });
}

// Retune lazily to avoid an import cycle with the feed store.
function retuneFeed() {
  import("@/store/useFeedStore").then(({ useFeedStore }) =>
    useFeedStore.getState().retune()
  );
}

export const useAlgorithmStore = create<AlgorithmState>((set, get) => ({
  vector: DEFAULT_VECTOR,
  presetId: null,

  hydrate: () => {
    const saved = loadJson<{ vector: AlgorithmVector; presetId: string | null }>(
      "algo",
      { vector: DEFAULT_VECTOR, presetId: null }
    );
    set({
      vector: { ...DEFAULT_VECTOR, ...saved.vector },
      presetId: saved.presetId,
    });
  },

  setSlider: (key, value) => {
    const vector = { ...get().vector, [key]: value };
    set({ vector, presetId: null });
    persist(vector, null);
    retuneFeed();
  },

  cycleTag: (tag) => {
    const v = get().vector;
    let onlyTags = [...v.onlyTags];
    let blockTags = [...v.blockTags];
    if (onlyTags.includes(tag)) {
      onlyTags = onlyTags.filter((t) => t !== tag);
      blockTags.push(tag);
    } else if (blockTags.includes(tag)) {
      blockTags = blockTags.filter((t) => t !== tag);
    } else {
      onlyTags.push(tag);
    }
    const vector = { ...v, onlyTags, blockTags };
    set({ vector, presetId: null });
    persist(vector, null);
    retuneFeed();
  },

  tagMode: (tag) => {
    const v = get().vector;
    if (v.onlyTags.includes(tag)) return "only";
    if (v.blockTags.includes(tag)) return "block";
    return "neutral";
  },

  applyPreset: (id) => {
    const p = PRESETS.find((p) => p.id === id);
    if (!p) return;
    const vector = { ...p.vector };
    set({ vector, presetId: id });
    persist(vector, id);
    retuneFeed();
  },
}));
