"use client";

import { useEffect, useRef, useState } from "react";
import { GameCard } from "@/components/feed/GameCard";
import { getMeta } from "@/games/registry";
import { resumeMusic, suspendMusic, unlockAudio } from "@/lib/music";
import { useFeedStore } from "@/store/useFeedStore";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useMusicStore } from "@/store/useMusicStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useUiStore } from "@/store/useUiStore";

/**
 * Scroll one card up or down from the active one. The card tops are also the
 * snap points, so a smooth scroll here lands exactly where CSS would put it.
 */
function stepCard(root: HTMLElement, dir: 1 | -1) {
  const { activeIndex, cards } = useFeedStore.getState();
  const to = Math.min(cards.length - 1, Math.max(0, activeIndex + dir));
  const el = root.querySelector<HTMLElement>(`[data-index="${to}"]`);
  if (el) root.scrollTo({ top: el.offsetTop, behavior: "smooth" });
}

export function Feed() {
  const cards = useFeedStore((s) => s.cards);
  const activeIndex = useFeedStore((s) => s.activeIndex);
  const playing = useUiStore((s) => s.playingUid !== null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const activeSlug = cards[activeIndex]?.slug;

  // hydrate stores + build the first queue, client-side only
  useEffect(() => {
    useThemeStore.getState().hydrate();
    useAlgorithmStore.getState().hydrate();
    useMusicStore.getState().hydrate();
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

  // Desktop and touch scroll the feed differently, on purpose. A thumb wants
  // the native momentum swipe iOS already gives us; a wheel or trackpad wants
  // one card per gesture, because a single flick of inertia would otherwise
  // fly past four of them. So on fine pointers we take the wheel over and
  // drive the scroll ourselves. There is no click-and-drag anywhere.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || cards.length === 0) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let locked = false;
    let accum = 0;
    let settle: ReturnType<typeof setTimeout> | null = null;

    // Hold the lock until the wheel has been quiet for a beat, so the tail of
    // a trackpad flick lands on the card we just scrolled to.
    const relock = () => {
      locked = true;
      accum = 0;
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        locked = false;
      }, 280);
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // the feed owns the wheel: no half-scrolled cards, ever
      e.preventDefault();
      if (locked) {
        relock(); // still riding the same flick
        return;
      }
      // deltaMode 1 is lines, 2 is pages — normalise both to something px-ish
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      if (px * accum < 0) accum = 0; // direction flipped, start over
      accum += px;
      if (Math.abs(accum) < 24) return;
      const dir = accum > 0 ? 1 : -1;
      relock();
      // Mid-game the wheel is an exit, not a jump: one gesture hands the card
      // back to the feed, the next one moves on.
      if (useUiStore.getState().playingUid !== null) useUiStore.getState().exitPlay();
      else stepCard(root, dir);
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
      if (settle) clearTimeout(settle);
    };
  }, [cards.length]);

  // Arrow keys do the same thing as the wheel — desktop expects them, and
  // nothing else on the page listens for a keypress while you are browsing.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || cards.length === 0) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const dir = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!dir) return;
      const ui = useUiStore.getState();
      if (ui.sheet !== null || ui.playingUid !== null) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      stepCard(root, dir);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length]);

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
