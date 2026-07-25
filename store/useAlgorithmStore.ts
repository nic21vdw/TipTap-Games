"use client";

import { create } from "zustand";
import { DEFAULT_VECTOR, type AlgorithmVector } from "@/lib/algorithm";
import { parseIntent, type Matched } from "@/lib/parseIntent";
import {
  addMemory,
  allMemories,
  clearMemories,
  likeMemoryFor,
  removeMemory,
  setMemoryWeight,
  toggleMemory,
  vectorFromMemories,
  type Memory,
  type MemoryAxis,
} from "@/lib/memories";
import type { GameTag } from "@/games/types";

interface AlgorithmState {
  vector: AlgorithmVector;
  memories: Memory[];
  lastQuery: string;
  lastMatched: Matched[];
  hydrate: () => void;
  /** Plain-language search: snipes keywords into memories. */
  applyQuery: (query: string) => Matched[];
  rememberLike: (slug: string, title: string, tags: GameTag[]) => void;
  forgetLike: (slug: string) => void;
  drop: (id: string) => void;
  mute: (id: string) => void;
  reweigh: (id: string, weight: number) => void;
  reset: () => void;
}

function retuneFeed() {
  import("@/store/useFeedStore").then(({ useFeedStore }) =>
    useFeedStore.getState().retune()
  );
}

const AXIS_LABEL: Record<MemoryAxis, [string, string]> = {
  intensity: ["Prefers calm games", "Prefers frantic games"],
  speed: ["Prefers a slower pace", "Prefers fast games"],
  difficulty: ["Prefers forgiving games", "Prefers brutal difficulty"],
  luck: ["Prefers pure skill", "Prefers games of chance"],
  nostalgia: ["Prefers modern games", "Prefers retro classics"],
  realism: ["Prefers a light, playful tone", "Prefers a darker, realistic tone"],
  variety: ["Wants more of the same", "Wants maximum variety"],
};

export const useAlgorithmStore = create<AlgorithmState>((set, get) => {
  const sync = () => {
    const memories = [...allMemories()];
    set({ memories, vector: vectorFromMemories(memories) });
  };

  return {
    vector: DEFAULT_VECTOR,
    memories: [],
    lastQuery: "",
    lastMatched: [],

    hydrate: () => sync(),

    applyQuery: (query) => {
      // Parse against the neutral default so each understood phrase maps to
      // an exact, self-describing memory row rather than a relative nudge.
      const fresh = parseIntent(query, DEFAULT_VECTOR);
      const matched = fresh.matched;
      for (const axis of Object.keys(AXIS_LABEL) as MemoryAxis[]) {
        const val = fresh.vector[axis];
        if (val === DEFAULT_VECTOR[axis]) continue;
        const [low, high] = AXIS_LABEL[axis];
        addMemory({
          label: val >= 0.5 ? high : low,
          source: "query",
          axis,
          to: val,
        });
      }
      for (const tag of fresh.vector.onlyTags) {
        addMemory({
          label: `Only wants ${tag} games`,
          source: "query",
          tag,
          mode: "only",
        });
      }
      for (const tag of fresh.vector.blockTags) {
        addMemory({
          label: `Never show ${tag} games`,
          source: "query",
          tag,
          mode: "block",
        });
      }
      if (fresh.vector.kidFriendly) {
        addMemory({ label: "Kid-friendly games only", source: "query", kid: true });
      }
      set({ lastQuery: query, lastMatched: matched });
      sync();
      retuneFeed();
      return matched;
    },

    rememberLike: (slug, title, tags) => {
      addMemory(likeMemoryFor(slug, title, tags));
      sync();
      retuneFeed();
    },

    forgetLike: (slug) => {
      const mem = allMemories().find((m) => m.slug === slug);
      if (mem) removeMemory(mem.id);
      sync();
      retuneFeed();
    },

    drop: (id) => {
      removeMemory(id);
      sync();
      retuneFeed();
    },

    mute: (id) => {
      toggleMemory(id);
      sync();
      retuneFeed();
    },

    reweigh: (id, weight) => {
      setMemoryWeight(id, weight);
      sync();
      retuneFeed();
    },

    reset: () => {
      clearMemories();
      set({ lastQuery: "", lastMatched: [] });
      sync();
      retuneFeed();
    },
  };
});
