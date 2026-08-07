"use client";

import { useEffect, useState } from "react";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

/**
 * Move the feed to a card, whichever direction it lies in. The feed is
 * `overflow-hidden` while a game holds the surface, so control is handed back
 * first and the scroll waits for the frame that re-enables scrolling.
 *
 * Cards are never dropped from the list once they've been shown, so scrolling
 * back lands on the game you just left rather than a fresh draw.
 */
export function goToCard(root: HTMLElement | null | undefined, index: number) {
  useUiStore.getState().exitPlay();
  if (!root || index < 0) return;
  // Mount and start the destination immediately. IntersectionObserver remains
  // the source of truth for native touch scrolling, but programmatic desktop
  // navigation must not expose an unmounted poster while the smooth scroll is
  // in flight (or get stranded there if an observer callback is delayed).
  useFeedStore.getState().setActive(index);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const target = root.querySelector<HTMLElement>(`[data-index="${index}"]`);
      if (target) root.scrollTo({ top: target.offsetTop, behavior: "smooth" });
    })
  );
}

/**
 * True when the primary input is a mouse or trackpad. Used for the wording of
 * the on-screen hints. It is not what gates the swipe: a touchscreen laptop
 * reports a fine pointer and still has to answer to a thumb, so the gesture
 * itself keys off the pointerType of the event that starts it.
 */
export function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    setFine(pointerQuery().matches);
    return subscribeFinePointer(setFine);
  }, []);
  return fine;
}

// One query and one listener for the whole feed. Every card used to open its
// own, and the feed keeps every card it has shown, so the count climbed with
// the session.
let mq: MediaQueryList | null = null;
const finePointerSubs = new Set<(fine: boolean) => void>();

function pointerQuery() {
  if (!mq) {
    mq = window.matchMedia("(pointer: fine)");
    mq.addEventListener("change", () =>
      finePointerSubs.forEach((fn) => fn(mq!.matches))
    );
  }
  return mq;
}

function subscribeFinePointer(fn: (fine: boolean) => void) {
  finePointerSubs.add(fn);
  return () => {
    finePointerSubs.delete(fn);
  };
}
