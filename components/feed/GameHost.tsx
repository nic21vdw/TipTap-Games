"use client";

import { useEffect, useRef, useState } from "react";
import type { GameInstance } from "@/games/types";
import { getMeta, getModule } from "@/games/registry";
import { currentTheme, useThemeStore } from "@/store/useThemeStore";
import { haptic } from "@/lib/haptics";
import { bumpSignals, submitRun } from "@/lib/storage";
import { openRun, recordRun } from "@/lib/cloud";

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
  /** true when the game registered a move listener during mount() */
  onDragControl?: (drag: boolean) => void;
}

const MOVE_EVENTS = new Set(["pointermove", "touchmove", "mousemove"]);

function mountWatchingMoves(
  canvas: HTMLCanvasElement,
  run: () => GameInstance
): { inst: GameInstance; dragControl: boolean } {
  const native = canvas.addEventListener;
  let dragControl = false;
  canvas.addEventListener = function (
    this: HTMLCanvasElement,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    if (MOVE_EVENTS.has(type)) dragControl = true;
    return native.call(this, type, listener, options);
  } as typeof canvas.addEventListener;
  try {
    return { inst: run(), dragControl };
  } finally {
    delete (canvas as Partial<HTMLCanvasElement>).addEventListener;
  }
}

// Owns the full game lifecycle: mounts the module, sizes the canvas,
// pauses on inactive/hidden, re-sizes the backing store on theme change
// (no remount — same canvas, same instance), re-mounts the game when the
// viewport changes shape, and reports signals on exit.
export function GameHost({
  slug,
  active,
  interactive,
  onScore,
  onRunEnd,
  onDragControl,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
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
  const onDragControlRef = useRef(onDragControl);
  onDragControlRef.current = onDragControl;

  // Games are laid out against the size they mount at, so the host owns that
  // measurement. A card can mount at 0x0 (an offscreen tab, a preview pane
  // that is still hidden, a device-frame switch): mounting then would bake in
  // a 1px canvas and the game would render as a black rectangle forever.
  // So: never mount without a real box, and remount when the box changes.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let settle: ReturnType<typeof setTimeout> | null = null;
    const measure = () => {
      const w = Math.round(host.clientWidth);
      const h = Math.round(host.clientHeight);
      if (w <= 0 || h <= 0) return; // hidden — keep the last good size
      setBox((prev) =>
        // ignore sub-pixel jitter and the URL-bar shuffle on mobile; a real
        // viewport change moves things far more than this
        prev && Math.abs(prev.w - w) < 4 && Math.abs(prev.h - h) < 4
          ? prev
          : { w, h }
      );
    };

    // A drag-resize fires continuously; remounting the game on every frame of
    // it would be a strobe. Wait for the size to hold still, then remount once.
    const ro = new ResizeObserver(() => {
      if (settle) clearTimeout(settle);
      settle = setTimeout(measure, 120);
    });
    ro.observe(host);
    measure(); // first paint gets its size immediately

    return () => {
      ro.disconnect();
      if (settle) clearTimeout(settle);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !box) return;
    const W = box.w;
    const H = box.h;

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
    let demoRestart: ReturnType<typeof setTimeout> | null = null;

    const { inst, dragControl } = mountWatchingMoves(canvas, () =>
      getModule(slug).mount({
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
          // Attract-mode runs are a shop window, not a score: never persist
          // them. They also have to keep going — a demo that loses and sits on
          // its end card reads as a broken game, so hold the card long enough
          // to see and then deal a fresh round. autoplay(false) is every
          // module's reset.
          if (!interactiveRef.current) {
            if (demoRestart) clearTimeout(demoRestart);
            demoRestart = setTimeout(() => {
              if (interactiveRef.current) return;
              instRef.current?.autoplay?.(false);
              instRef.current?.autoplay?.(true);
            }, 1400);
            return;
          }
          runEnds += 1;
          bumpSignals(slug, { runs: 1, replays: runEnds > 1 ? 1 : 0 });
          // Local first, so the sheet is instant and correct with no backend.
          onRunEndRef.current({
            score: finalScore,
            reason,
            ...submitRun(slug, finalScore),
          });
          // Then, if signed in, redeem the open ticket for a ranked score.
          void recordRun(slug, finalScore);
        },
      })
    );
    instRef.current = inst;
    canvas.dataset.dragControl = dragControl ? "1" : "0";
    onDragControlRef.current?.(dragControl);
    inst.autoplay?.(!interactiveRef.current);

    // next/prev cards mount paused so arrival is instant but silent
    if (activeRef.current && interactiveRef.current && !document.hidden)
      activeSince = Date.now();
    if (!activeRef.current || document.hidden) inst.pause();

    const unsubTheme = useThemeStore.subscribe(() => {
      sizeBacking();
      // Resizing the backing store wipes the canvas's pixels. If the loop is
      // paused (card not active/visible) nothing will repaint it on its own,
      // so force one frame through and re-pause right after.
      const paused = !activeRef.current || document.hidden;
      if (paused) {
        inst.resume();
        requestAnimationFrame(() => {
          if (!activeRef.current || document.hidden) inst.pause();
        });
      }
    });
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
      if (demoRestart) clearTimeout(demoRestart);
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
  }, [slug, box]);

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

  // Taking control is the start of a real run, so that's when the server
  // ticket opens. Attract-mode play never gets one and never scores.
  useEffect(() => {
    if (active && interactive) void openRun(slug);
  }, [active, interactive, slug]);

  return (
    <div ref={hostRef} className="h-full w-full" style={{ background: "var(--bg)" }}>
      {box && (
        <canvas
          // A size change is a fresh mount: the key drops the old canvas so no
          // frame is ever drawn against stale dimensions.
          key={`${box.w}x${box.h}`}
          ref={canvasRef}
          className="block h-full w-full select-none"
          style={{
            // In preview mode the canvas is inert, so every gesture belongs to
            // the feed. In play mode it takes the whole surface and nothing
            // scrolls.
            pointerEvents: interactive ? "auto" : "none",
            touchAction: interactive ? "none" : "pan-y",
          }}
        />
      )}
    </div>
  );
}

const hostState = new WeakMap<
  HTMLCanvasElement,
  { markActive: (on: boolean) => void }
>();
