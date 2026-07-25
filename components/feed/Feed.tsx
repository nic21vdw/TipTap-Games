"use client";

import { useEffect, useRef, useState } from "react";
import { GameCard } from "@/components/feed/GameCard";
import { getMeta } from "@/games/registry";
import { resumeMusic, suspendMusic, unlockAudio } from "@/lib/music";
import { useAccountStore } from "@/store/useAccountStore";
import { useFeedStore } from "@/store/useFeedStore";
import { useMessagesStore } from "@/store/useMessagesStore";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useMusicStore } from "@/store/useMusicStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useUiStore } from "@/store/useUiStore";

export function Feed() {
  const cards = useFeedStore((s) => s.cards);
  const activeIndex = useFeedStore((s) => s.activeIndex);
  const playing = useUiStore((s) => s.playingUid !== null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const activeSlug = cards[activeIndex]?.slug;

  // hydrate stores + build the first queue, client-side only
  useEffect(() => {
    // identity first: scores, memories and the algorithm vector are all keyed
    // by the signed-in account, so nothing else can hydrate before it
    useAccountStore.getState().hydrate();
    useMessagesStore.getState().hydrate();
    useThemeStore.getState().hydrate();
    useAlgorithmStore.getState().hydrate();
    useMusicStore.getState().hydrate();
    // re-register every published player game so the feed can serve them
    import("@/games/custom").then(({ registerSpec }) => {
      import("@/lib/library").then(({ allGames }) => {
        allGames().forEach(registerSpec);
        useFeedStore.getState().init();
        setReady(true);
      });
    });
  }, []);

  // active-card tracking: >60% visible wins, everything else hard-stops
  useEffect(() => {
    const root = containerRef.current;
    if (!root || cards.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.intersectionRatio >= 0.6) {
            const idx = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) useFeedStore.getState().setActive(idx);
          }
        }
      },
      { root, threshold: [0.6] }
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
    // the first uid changes when the queue is rebuilt (account switch), which
    // swaps every DOM node out from under the old observer
  }, [cards.length, cards[0]?.uid]);

  // Autoplay policy: the very first gesture anywhere on the page is what
  // lets the soundtrack start. After that this never runs again.
  useEffect(() => {
    const go = () => unlockAudio();
    const opts = { passive: true } as const;
    window.addEventListener("pointerdown", go, opts);
    window.addEventListener("touchstart", go, opts);
    window.addEventListener("keydown", go);
    return () => {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("touchstart", go);
      window.removeEventListener("keydown", go);
    };
  }, []);

  // One card, one song: landing on a card drops its track in on the beat.
  useEffect(() => {
    if (!ready || !activeSlug) return;
    const m = getMeta(activeSlug);
    useMusicStore.getState().cue({
      slug: m.slug,
      intensity: m.intensity,
      nostalgia: m.nostalgia,
      luck: m.luck,
      tags: m.tags,
    });
  }, [ready, activeSlug]);

  // Backgrounded tabs go quiet, and stay quiet until you come back.
  useEffect(() => {
    const onVis = () => (document.hidden ? suspendMusic() : resumeMusic());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div
      ref={containerRef}
      data-feed-scroller
      className={`no-scrollbar h-dvh overscroll-none ${
        playing
          ? "overflow-hidden" // the game owns every gesture while you play
          : "snap-y snap-mandatory overflow-y-scroll"
      }`}
      style={{ background: "var(--bg)" }}
    >
      {ready &&
        cards.map((c, i) => <GameCard key={c.uid} card={c} index={i} />)}
    </div>
  );
}
