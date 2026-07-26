"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameCard } from "@/components/feed/GameCard";
import { goToCard } from "@/components/feed/nav";
import { getMeta } from "@/games/registry";
import { resumeMusic, suspendMusic, unlockAudio } from "@/lib/music";
import { useFeedStore } from "@/store/useFeedStore";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useMusicStore } from "@/store/useMusicStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useUiStore } from "@/store/useUiStore";

/** One flick of a trackpad or one spin of a wheel = one card. */
const WHEEL_PX = 48;
const GESTURE_GAP_MS = 220;
const REARM_MS = 500;

export function Feed() {
  const cards = useFeedStore((s) => s.cards);
  const activeIndex = useFeedStore((s) => s.activeIndex);
  const playing = useUiStore((s) => s.playingUid !== null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const activeSlug = cards[activeIndex]?.slug;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  // Where the last wheel notch or keypress aimed. activeIndex only catches up
  // once the smooth scroll settles, so without this a burst of presses would
  // all resolve against the same stale index and move exactly one card.
  const aimRef = useRef({ index: -1, at: -Infinity });

  const navBy = useCallback((delta: number) => {
    const { cards, activeIndex } = useFeedStore.getState();
    if (cards.length === 0) return;
    const now = performance.now();
    const chained = aimRef.current.index >= 0 && now - aimRef.current.at < 700;
    const from = chained ? aimRef.current.index : activeIndex;
    // Down is bounded by the queue, up is bounded by the first card you saw —
    // everything in between stays mounted in the list and is reachable.
    const to = Math.max(0, Math.min(cards.length - 1, from + delta));
    aimRef.current = { index: to, at: now };
    goToCard(containerRef.current, to);
  }, []);

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
    // Re-observe on any change to the list, not just its length: a retune
    // swaps the cards after the active one for brand new elements, and an
    // observer still watching the detached ones would freeze the feed.
  }, [cards]);

  // Desktop: while a game holds the surface the feed is overflow-hidden, so
  // the wheel does nothing at all — including scrolling back to the game you
  // were just on. Read it ourselves and turn one gesture into one card.
  // Browsing keeps native snap scrolling, which already reads right.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let acc = 0;
    let last = -Infinity;
    let firedAt = -Infinity;
    let armed = true;

    const onWheel = (e: WheelEvent) => {
      if (!playingRef.current || useUiStore.getState().sheet) return;
      e.preventDefault(); // nothing behind the game is allowed to move
      const now = performance.now();
      const gap = now - last;
      last = now;
      // A pause starts a fresh gesture; so does half a second of unbroken
      // scrolling, so spinning a real wheel keeps paging instead of stalling.
      if (gap > GESTURE_GAP_MS || (!armed && now - firedAt > REARM_MS)) {
        acc = 0;
        armed = true;
      }
      if (!armed) return; // trackpad momentum from a flick already spent
      acc += e.deltaY;
      if (Math.abs(acc) < WHEEL_PX) return;
      const dir = acc > 0 ? 1 : -1;
      acc = 0;
      armed = false;
      firedAt = now;
      navBy(dir);
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [navBy]);

  // No game listens for keys, so the whole keyboard belongs to the feed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (useUiStore.getState().sheet) return; // an open sheet owns the keys
      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? ""))
        return;
      switch (e.key) {
        case "ArrowDown":
        case "PageDown":
          e.preventDefault();
          navBy(1);
          break;
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          navBy(-1);
          break;
        case "Enter": {
          const { cards, activeIndex } = useFeedStore.getState();
          const card = cards[activeIndex];
          if (!card || playingRef.current) return;
          e.preventDefault();
          useUiStore.getState().enterPlay(card.uid); // the keyboard's double-tap
          break;
        }
        case "Escape":
          if (!playingRef.current) return;
          e.preventDefault();
          useUiStore.getState().exitPlay(); // back to browsing, same card
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navBy]);

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
      className={`no-scrollbar h-[var(--app-h)] overscroll-none ${
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
