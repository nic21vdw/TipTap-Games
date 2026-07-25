"use client";

import { create } from "zustand";
import { sampleQueue } from "@/lib/algorithm";
import { slugBoosts } from "@/lib/memories";
import { CATALOG } from "@/games/registry";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";

export interface FeedCard {
  uid: number;
  slug: string;
}

interface FeedState {
  cards: FeedCard[];
  activeIndex: number;
  init: () => void;
  setActive: (i: number) => void;
  ensureAhead: () => void;
  /** Splice a game in directly after the active card. */
  insertNext: (slug: string) => void;
  /** Rebuild everything after the active card using the current vector. */
  retune: () => void;
  /** Throw the queue away and build a fresh one — used on account switch. */
  reset: () => void;
  /** Pull an unpublished game out of the queue. */
  dropSlug: (slug: string) => void;
}

let nextUid = 1;
const AHEAD = 10; // cards kept queued past the active one

function recentSlugsFrom(cards: FeedCard[], uptoIndex: number): string[] {
  const out: string[] = [];
  for (let i = uptoIndex; i >= 0 && out.length < 8; i--) out.push(cards[i].slug);
  return out;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  cards: [],
  activeIndex: 0,

  init: () => {
    if (get().cards.length > 0) return;
    const vec = useAlgorithmStore.getState().vector;
    const slugs = sampleQueue(CATALOG, vec, [], AHEAD + 1, slugBoosts());
    set({ cards: slugs.map((slug) => ({ uid: nextUid++, slug })) });
  },

  setActive: (i) => {
    if (i === get().activeIndex) return;
    set({ activeIndex: i });
    get().ensureAhead();
  },

  ensureAhead: () => {
    const { cards, activeIndex } = get();
    if (cards.length - activeIndex > AHEAD) return;
    const vec = useAlgorithmStore.getState().vector;
    const recent = recentSlugsFrom(cards, cards.length - 1);
    const slugs = sampleQueue(CATALOG, vec, recent, AHEAD, slugBoosts());
    set({
      cards: [...cards, ...slugs.map((slug) => ({ uid: nextUid++, slug }))],
    });
  },

  insertNext: (slug: string) => {
    const { cards, activeIndex } = get();
    const next = [...cards];
    next.splice(activeIndex + 1, 0, { uid: nextUid++, slug });
    set({ cards: next });
  },

  reset: () => {
    const vec = useAlgorithmStore.getState().vector;
    const slugs = sampleQueue(CATALOG, vec, [], AHEAD + 1, slugBoosts());
    set({
      cards: slugs.map((slug) => ({ uid: nextUid++, slug })),
      activeIndex: 0,
    });
    // the scroll container keeps its offset, so send it back to the top
    if (typeof document !== "undefined") {
      const el = document.querySelector("[data-feed-scroller]");
      el?.scrollTo({ top: 0 });
    }
  },

  dropSlug: (slug) => {
    const { cards, activeIndex } = get();
    const activeUid = cards[activeIndex]?.uid;
    const next = cards.filter((c) => c.slug !== slug || c.uid === activeUid);
    if (next.length === cards.length) return;
    set({
      cards: next,
      activeIndex: Math.max(
        0,
        next.findIndex((c) => c.uid === activeUid)
      ),
    });
    get().ensureAhead();
  },

  retune: () => {
    const { cards, activeIndex } = get();
    if (cards.length === 0) return;
    const vec = useAlgorithmStore.getState().vector;
    const keep = cards.slice(0, activeIndex + 1);
    const recent = recentSlugsFrom(cards, activeIndex);
    const slugs = sampleQueue(CATALOG, vec, recent, AHEAD, slugBoosts());
    set({
      cards: [...keep, ...slugs.map((slug) => ({ uid: nextUid++, slug }))],
    });
  },
}));
