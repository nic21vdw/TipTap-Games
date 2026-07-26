"use client";

import { create } from "zustand";
import { sampleQueue } from "@/lib/algorithm";
import { slugBoosts } from "@/lib/memories";
import { mintVariant } from "@/games/variants";
import { CATALOG, MODULES } from "@/games/registry";
import { clearSeen, likedSlugs, markSeen, seenSlugs } from "@/lib/storage";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";

export interface FeedCard {
  uid: number;
  slug: string;
}

interface FeedState {
  cards: FeedCard[];
  activeIndex: number;
  /** Card the feed still has to scroll to; the Feed clears it once it has. */
  scrollToUid: number | null;
  init: () => void;
  setActive: (i: number) => void;
  ensureAhead: () => void;
  /** Splice a game in directly after the active card. */
  insertNext: (slug: string) => void;
  /** Splice a game in and scroll it into view — a search result, played now. */
  jumpTo: (slug: string) => void;
  /** Splice a placeholder card in after the active card; returns its uid. */
  insertPending: (slug: string) => number;
  /** Swap a card's slug in place (placeholder -> finished game). */
  resolveCard: (uid: number, slug: string) => void;
  clearScrollTarget: () => void;
  /** Rebuild everything after the active card using the current vector. */
  retune: () => void;
  /** Wipe the no-repeat ledger so the whole catalog is fresh again. */
  reshuffle: () => void;
}

let nextUid = 1;
const AHEAD = 10; // cards kept queued past the active one
/** A liked game may come back, but never inside this many cards. */
const LIKE_GAP = 14;
/** How often a batch of new cards is allowed to include a liked rerun. */
const LIKE_RETURN_CHANCE = 0.35;

function recentSlugsFrom(cards: FeedCard[], uptoIndex: number): string[] {
  const out: string[] = [];
  for (let i = uptoIndex; i >= 0 && out.length < 8; i--) out.push(cards[i].slug);
  return out;
}

/**
 * Everything the sampler is forbidden from serving: every game already in
 * this feed plus every game the ledger says has been shown before. A like is
 * the only way a game earns a second appearance.
 */
function exclusionFor(cards: FeedCard[]): Set<string> {
  const exclude = new Set<string>();
  for (const card of cards) exclude.add(card.slug);
  for (const slug of seenSlugs()) exclude.add(slug);

  const recentWindow = new Set(
    cards.slice(Math.max(0, cards.length - LIKE_GAP)).map((card) => card.slug)
  );
  const eligibleLikes = [...likedSlugs()].filter(
    (slug) => !recentWindow.has(slug) && Boolean(MODULES[slug])
  );

  if (
    eligibleLikes.length > 0 &&
    Math.random() < LIKE_RETURN_CHANCE
  ) {
    exclude.delete(
      eligibleLikes[Math.floor(Math.random() * eligibleLikes.length)]
    );
  }

  return exclude;
}

/** Draw distinct games, minting a fresh variant when the catalog runs dry. */
function draw(count: number, cards: FeedCard[], recent: string[]): string[] {
  const vector = useAlgorithmStore.getState().vector;
  const boosts = slugBoosts();
  const exclude = exclusionFor(cards);
  const seenRecently = [...recent];
  const result: string[] = [];

  for (let guard = 0; result.length < count && guard < count * 4; guard++) {
    const needed = count - result.length;
    const picked = sampleQueue(
      CATALOG,
      vector,
      seenRecently,
      needed,
      boosts,
      exclude
    );

    for (const slug of picked) {
      result.push(slug);
      exclude.add(slug);
      seenRecently.unshift(slug);
      if (seenRecently.length > 8) seenRecently.pop();
    }

    if (picked.length >= needed) break;
    const minted = mintVariant(vector, boosts, exclude);
    if (!minted) break;
    result.push(minted);
    exclude.add(minted);
    seenRecently.unshift(minted);
    if (seenRecently.length > 8) seenRecently.pop();
  }

  return result;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  cards: [],
  activeIndex: 0,
  scrollToUid: null,

  init: () => {
    if (get().cards.length > 0) return;
    const slugs = draw(AHEAD + 1, [], []);
    set({ cards: slugs.map((slug) => ({ uid: nextUid++, slug })) });
    markSeen(slugs.slice(0, 1));
  },

  setActive: (i) => {
    if (i === get().activeIndex) return;
    set({ activeIndex: i });
    const card = get().cards[i];
    if (card) markSeen([card.slug]);
    get().ensureAhead();
  },

  ensureAhead: () => {
    const { cards, activeIndex } = get();
    if (cards.length - activeIndex > AHEAD) return;
    const recent = recentSlugsFrom(cards, cards.length - 1);
    const slugs = draw(AHEAD, cards, recent);
    if (slugs.length === 0) return;
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

  jumpTo: (slug: string) => {
    const { cards, activeIndex } = get();
    // already the card you're on — nothing to scroll to
    if (cards[activeIndex]?.slug === slug) return;
    const uid = nextUid++;
    const next = [...cards];
    next.splice(activeIndex + 1, 0, { uid, slug });
    set({ cards: next, scrollToUid: uid });
  },

  insertPending: (slug: string) => {
    const { cards, activeIndex } = get();
    const uid = nextUid++;
    const next = [...cards];
    next.splice(activeIndex + 1, 0, { uid, slug });
    set({ cards: next });
    return uid;
  },

  resolveCard: (uid: number, slug: string) => {
    const { cards, activeIndex } = get();
    const index = cards.findIndex((card) => card.uid === uid);
    if (index === -1) return;
    set({
      cards: cards.map((card) =>
        card.uid === uid ? { ...card, slug } : card
      ),
    });
    if (index === activeIndex) markSeen([slug]);
  },

  clearScrollTarget: () => set({ scrollToUid: null }),

  retune: () => {
    const { cards, activeIndex } = get();
    if (cards.length === 0) return;
    const keep = cards.slice(0, activeIndex + 1);
    const recent = recentSlugsFrom(cards, activeIndex);
    const slugs = draw(AHEAD, keep, recent);
    set({
      cards: [...keep, ...slugs.map((slug) => ({ uid: nextUid++, slug }))],
    });
  },

  reshuffle: () => {
    clearSeen();
    const { cards, activeIndex } = get();
    const keep = cards.slice(0, activeIndex + 1);
    markSeen(keep.map((card) => card.slug));
    const recent = recentSlugsFrom(cards, activeIndex);
    const slugs = draw(AHEAD, keep, recent);
    set({
      cards: [...keep, ...slugs.map((slug) => ({ uid: nextUid++, slug }))],
    });
  },
}));
