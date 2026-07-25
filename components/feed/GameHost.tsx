"use client";

import { useEffect, useRef } from "react";
import type { GameInstance } from "@/games/types";
import { getMeta, getModule } from "@/games/registry";
import { currentTheme, useThemeStore } from "@/store/useThemeStore";
import { haptic } from "@/lib/haptics";
import { bumpSignals, submitRun } from "@/lib/storage";

export interface RunResult {
  score: number;
  isBest: boolean;
  rank: number;
  percentile: number;
  topTen: boolean;
  /** the game's own game-over headline, e.g. "CRASHED" */
  reason?: string;
}

interface Props {
  slug: string;
  active: boolean;
  /** false = live preview: the game runs but ignores input so the feed scrolls */
  interactive: boolean;
  onScore: (n: number) => void;
  onRunEnd: (r: RunResult) => void;
}

// Owns the full game lifecycle: mounts the module, sizes the canvas,
// pauses on inactive/hidden, re-sizes the backing store on theme change
// (no remount — same canvas, same instance), and reports signals on exit.
export function GameHost({
  slug,
  active,
  interactive,
  onScore,
  onRunEnd,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instRef = useRef<GameInstance | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const onRunEndRef = useRef(onRunEnd);
  onRunEndRef.current = onRunEnd;

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const W = parent.clientWidth;
    const H = parent.clientHeight;

    const sizeBacking = () => {
      const t = currentTheme();
      const scale = t.pixelate
        ? 1 / 3
        : Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(W * scale));
      canvas.height = Math.max(1, Math.round(H * scale));
      const g = canvas.getContext("2d")!;
      // resize wipes context state — restore the logical-px transform
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.imageSmoothingEnabled = !t.pixelate;
      return g;
    };
    const g = sizeBacking();

    let lastScore = 0;
    let runEnds = 0;
    let activeSince: number | null = null;
    let dwellMs = 0;

    const inst = getModule(slug).mount({
      canvas,
      g,
      width: W,
      height: H,
      dpr: window.devicePixelRatio || 1,
      getTheme: currentTheme,
      pal: getMeta(slug).palette,
      // a self-playing demo must never buzz the phone
      haptic: (kind) => {
        if (interactiveRef.current) haptic(kind);
      },
      onScore: (n) => {
        lastScore = n;
        onScoreRef.current(n);
      },
      onRunEnd: (finalScore, reason) => {
        // Attract-mode runs are a shop window, not a score: never persist them.
        if (!interactiveRef.current) return;
        runEnds += 1;
        bumpSignals(slug, { runs: 1, replays: runEnds > 1 ? 1 : 0 });
        onRunEndRef.current({
          score: finalScore,
          reason,
          ...submitRun(slug, finalScore),
        });
      },
    });
    instRef.current = inst;
    inst.autoplay?.(!interactiveRef.current);

    // next/prev cards mount paused so arrival is instant but silent
    if (activeRef.current && interactiveRef.current && !document.hidden)
      activeSince = Date.now();
    if (!activeRef.current || document.hidden) inst.pause();

    const unsubTheme = useThemeStore.subscribe(() => sizeBacking());
    const onVis = () => {
      if (document.hidden) inst.pause();
      else if (activeRef.current) inst.resume();
    };
    document.addEventListener("visibilitychange", onVis);

    // Dwell is written through on every stop, not just on unmount, so the
    // time tracker in settings is correct the moment you leave a game.
    const flush = () => {
      if (activeSince === null) return;
      const delta = Date.now() - activeSince;
      activeSince = null;
      if (delta <= 0) return;
      dwellMs += delta;
      bumpSignals(slug, { dwellMs: delta });
    };

    hostState.set(canvas, {
      markActive: (on: boolean) => {
        if (on) {
          if (activeSince === null) activeSince = Date.now();
        } else {
          flush();
        }
      },
    });

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      unsubTheme();
      inst.destroy();
      instRef.current = null;
      hostState.delete(canvas);
      flush();
      // a card opened, ignored, and swiped past is a negative signal
      if (dwellMs > 0 && dwellMs < 3000 && runEnds === 0 && lastScore === 0) {
        bumpSignals(slug, { fastSwipes: 1 });
      }
    };
  }, [slug]);

  useEffect(() => {
    const inst = instRef.current;
    const canvas = canvasRef.current;
    // dwell measures real play, so the demo never inflates it
    if (canvas) hostState.get(canvas)?.markActive(active && interactive);
    if (!inst) return;
    if (active && !document.hidden) inst.resume();
    else inst.pause();
  }, [active, interactive]);

  // Attract mode: a card plays itself until the player takes over.
  useEffect(() => {
    instRef.current?.autoplay?.(!interactive);
  }, [interactive]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full select-none"
      style={{
        // In preview mode the canvas is inert, so every gesture belongs to the
        // feed. In play mode it takes the whole surface and nothing scrolls.
        pointerEvents: interactive ? "auto" : "none",
        touchAction: interactive ? "none" : "pan-y",
      }}
    />
  );
}

const hostState = new WeakMap<
  HTMLCanvasElement,
  { markActive: (on: boolean) => void }
>();
