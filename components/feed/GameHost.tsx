"use client";

import { useEffect, useRef } from "react";
import type { GameInstance } from "@/games/types";
import { getModule } from "@/games/registry";
import { currentTheme, useThemeStore } from "@/store/useThemeStore";
import { haptic } from "@/lib/haptics";
import { bumpSignals, submitRun } from "@/lib/storage";

export interface RunResult {
  score: number;
  isBest: boolean;
  rank: number;
  percentile: number;
  topTen: boolean;
}

interface Props {
  slug: string;
  active: boolean;
  onScore: (n: number) => void;
  onRunEnd: (r: RunResult) => void;
}

// Owns the full game lifecycle: mounts the module, sizes the canvas,
// pauses on inactive/hidden, re-sizes the backing store on theme change
// (no remount — same canvas, same instance), and reports signals on exit.
export function GameHost({ slug, active, onScore, onRunEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instRef = useRef<GameInstance | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
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
      haptic,
      onScore: (n) => {
        lastScore = n;
        onScoreRef.current(n);
      },
      onRunEnd: (finalScore) => {
        runEnds += 1;
        bumpSignals(slug, { runs: 1, replays: runEnds > 1 ? 1 : 0 });
        onRunEndRef.current({ score: finalScore, ...submitRun(slug, finalScore) });
      },
    });
    instRef.current = inst;

    // next/prev cards mount paused so arrival is instant but silent
    if (activeRef.current && !document.hidden) activeSince = Date.now();
    else inst.pause();

    const unsubTheme = useThemeStore.subscribe(() => sizeBacking());
    const onVis = () => {
      if (document.hidden) inst.pause();
      else if (activeRef.current) inst.resume();
    };
    document.addEventListener("visibilitychange", onVis);

    // expose dwell bookkeeping to the active-toggle effect below
    hostState.set(canvas, {
      markActive: (on: boolean) => {
        if (on && activeSince === null) activeSince = Date.now();
        if (!on && activeSince !== null) {
          dwellMs += Date.now() - activeSince;
          activeSince = null;
        }
      },
    });

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      unsubTheme();
      inst.destroy();
      instRef.current = null;
      hostState.delete(canvas);
      if (activeSince !== null) dwellMs += Date.now() - activeSince;
      if (dwellMs > 0 || runEnds > 0) {
        bumpSignals(slug, {
          dwellMs,
          fastSwipes: dwellMs > 0 && dwellMs < 3000 && runEnds === 0 && lastScore === 0 ? 1 : 0,
        });
      }
    };
  }, [slug]);

  useEffect(() => {
    const inst = instRef.current;
    const canvas = canvasRef.current;
    if (canvas) hostState.get(canvas)?.markActive(active);
    if (!inst) return;
    if (active && !document.hidden) inst.resume();
    else inst.pause();
  }, [active]);

  // drag/hold games own the touch surface; tap games let vertical pans scroll
  const locksGestures = getModule(slug).meta.tags.some(
    (t) => t === "drag" || t === "hold"
  );

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full select-none"
      style={{ touchAction: locksGestures ? "none" : "pan-y" }}
    />
  );
}

const hostState = new WeakMap<
  HTMLCanvasElement,
  { markActive: (on: boolean) => void }
>();
