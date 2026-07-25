"use client";

import { useEffect, useRef, useState } from "react";
import { GameCard } from "@/components/feed/GameCard";
import { useFeedStore } from "@/store/useFeedStore";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useUiStore } from "@/store/useUiStore";

export function Feed() {
  const cards = useFeedStore((s) => s.cards);
  const playing = useUiStore((s) => s.playingUid !== null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // hydrate stores + build the first queue, client-side only
  useEffect(() => {
    useThemeStore.getState().hydrate();
    useAlgorithmStore.getState().hydrate();
    // re-register any games the player generated in earlier sessions
    import("@/games/custom").then(({ registerSpec }) => {
      import("@/lib/storage").then(({ loadCustomSpecs }) => {
        loadCustomSpecs().forEach(registerSpec);
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
  }, [cards.length]);

  return (
    <div
      ref={containerRef}
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
