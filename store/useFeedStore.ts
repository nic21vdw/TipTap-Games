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
  init: () => void;
  setActive: (i: number) => void;
  ensureAhead: () => void;
  /** Splice a game in directly after the active card. */
  insertNext: (slug: string) => void;
  /** Splice a placeholder card in after the active card; returns its uid. */
  insertPending: (slug: string) => number;
  /** Swap a card's slug in place (placeholder -> finished game). */
  resolveCard: (uid: number, slug: string) => void;
  /** Rebuild everything after the active card using the current vector. */
  retune: () => void;
  /** Wipe the no-repeat ledger so the whole catalog is fresh again. */
  reshuffle: () => void;
}

let nextUid = 1;
const AHEAD = 10; // cards kept queued past the active one
/** A liked game may come back, but never inside this many cards. */
const LIKE_GAP = 14;

function recentSlugsFrom(cards: FeedCard[], uptoIndex: number): string[] {
  const out: string[] = [];
  for (let i = uptoIndex; i >= 0 && out.length < 8; i--) out.push(cards[i].slug);
  return out;
}

/** How often a batch of new cards is allowed to include a liked rerun. */
const LIKE_RETURN_CHANCE = 0.35;

/**
 * Everything the sampler is forbidden from serving: every game already in
 * this feed plus every game the ledger says you've been shown before. A like
 * is the only way a game earns a second appearance — and even then it's one
 * per batch, at most, and never within LIKE_GAP cards of its last showing.
 */
function exclusionFor(cards: FeedCard[]): Set<string> {
  const exclude = new Set<string>();
  for (const c of cards) exclude.add(c.slug);
  for (const slug of seenSlugs()) exclude.add(slug);

  const window = new Set(
    cards.slice(Math.max(0, cards.length - LIKE_GAP)).map((c) => c.slug)
  );
  const eligible = [...likedSlugs()].filter(
    (slug) => !window.has(slug) && !!MODULES[slug]
  );
  if (eligible.length > 0 && Math.random() < LIKE_RETURN_CHANCE) {
    exclude.delete(eligible[Math.floor(Math.random() * eligible.length)]);
  }
  return exclude;
}

/**
 * Draws `count` distinct games nobody has seen. When the catalog runs dry the
 * feed designs new ones rather than looping — scrolling never repeats.
 */
function draw(count: number, cards: FeedCard[], recent: string[]): string[] {
  const vec = useAlgorithmStore.getState().vector;
  const boosts = slugBoosts();
  const exclude = exclusionFor(cards);
  const seenRecently = [...recent];
  const out: string[] = [];

  for (let guard = 0; out.length < count && guard < count * 4; guard++) {
    const need = count - out.length;
    const picked = sampleQueue(CATALOG, vec, seenRecently, need, boosts, exclude);
    for (const slug of picked) {
      out.push(slug);
      exclude.add(slug);
      seenRecently.unshift(slug);
      if (seenRecently.length > 8) seenRecently.pop();
    }
    if (picked.length >= need) break;
    // catalog exhausted — mint a fresh game instead of recycling an old one
    const minted = mintVariant(vec, boosts, exclude);
    if (!minted) break;
    out.push(minted);
    exclude.add(minted);
    seenRecently.unshift(minted);
    if (seenRecently.length > 8) seenRecently.pop();
  }
  return out;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  cards: [],
  activeIndex: 0,

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
    // the ledger records what you were actually shown, not what's queued —
    // so a retune can recycle cards you never reached
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
    const idx = cards.findIndex((c) => c.uid === uid);
    if (idx === -1) return;
    set({
      cards: cards.map((c) => (c.uid === uid ? { ...c, slug } : c)),
    });
    // If the finished game landed on the card the player is already on, record
    // it in the ledger — setActive won't fire, so nothing else would.
    if (idx === activeIndex) markSeen([slug]);
  },

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
    // the card you're on stays seen, so the reset doesn't hand it back to you
    markSeen(keep.map((c) => c.slug));
    const recent = recentSlugsFrom(cards, activeIndex);
    const slugs = draw(AHEAD, keep, recent);
    set({
      cards: [...keep, ...slugs.map((slug) => ({ uid: nextUid++, slug }))],
    });
  },
}));
