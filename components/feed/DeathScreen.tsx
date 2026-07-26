"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RunResult } from "@/components/feed/GameHost";
import type { FullGameMeta } from "@/games/types";
import { TrophyIcon } from "@/components/ui/icons";

interface Props {
  result: RunResult;
  meta: FullGameMeta;
  best: number;
  onPlayAgain: () => void;
  onLeave: () => void;
  /** Guest play comes first — this only shows up on a record worth keeping. */
  onSignIn?: () => void;
}

// The full-screen game-over moment. A frosted sheet springs up over the frozen
// game, counts the score up, and — on a record — throws a little confetti. It
// owns every gesture while it is up: you either go again or swipe out.
export function DeathScreen({ result, meta, best, onPlayAgain, onLeave, onSignIn }: Props) {
  const reduce = usePrefersReducedMotion();
  const headline = result.reason ?? "GAME OVER";
  const newBest = result.isBest && result.score > 0;
  const score = useCountUp(result.score, 620, !reduce);
  const pal = meta.palette;

  // Confetti only earns its place on a record — fixed per mount so it doesn't
  // reshuffle on every count-up frame.
  const confetti = useMemo(
    () =>
      newBest && !reduce
        ? Array.from({ length: 16 }, (_, i) => ({
            left: 6 + Math.random() * 88,
            delay: Math.random() * 220,
            dur: 900 + Math.random() * 700,
            rot: Math.random() * 360,
            color: [pal.hero, pal.prize, pal.glow, "#fff"][i % 4],
            w: 6 + Math.random() * 5,
            h: 9 + Math.random() * 7,
          }))
        : [],
    [newBest, reduce, pal]
  );

  return (
    <div
      className="anim-death-scrim absolute inset-0 z-50 flex items-center justify-center px-6"
      style={{
        background: "rgba(6,10,16,.62)",
        backdropFilter: "blur(14px) saturate(1.1)",
        WebkitBackdropFilter: "blur(14px) saturate(1.1)",
      }}
      // swallow every tap: the frozen game underneath must not restart behind us
      onPointerDown={(e) => e.stopPropagation()}
    >
      {confetti.length > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((c, i) => (
            <span
              key={i}
              className="anim-confetti absolute top-[-6%] block rounded-[2px]"
              style={{
                left: `${c.left}%`,
                width: c.w,
                height: c.h,
                background: c.color,
                animationDelay: `${c.delay}ms`,
                animationDuration: `${c.dur}ms`,
                ["--rot" as string]: `${c.rot}deg`,
              }}
            />
          ))}
        </div>
      )}

      <div
        className="anim-death-card relative w-full max-w-[430px] px-7 pb-8 pt-9 text-center"
        style={{
          background: "rgba(14,20,30,.9)",
          borderRadius: "28px",
          border: "1px solid rgba(255,255,255,.08)",
          boxShadow:
            "0 30px 80px -20px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.06)",
          fontFamily: "var(--font-body)",
        }}
      >
        {/* emblem: a ringed mark that pulses, tinted by the game's own foe */}
        <div className="mb-5 flex justify-center">
          <div
            className="anim-death-emblem relative flex h-24 w-24 items-center justify-center rounded-full"
            style={{
              background: `radial-gradient(circle at 50% 40%, ${hexA(
                pal.foe,
                0.34
              )}, ${hexA(pal.foe, 0.06)} 70%)`,
              boxShadow: `0 0 0 1px ${hexA(pal.foe, 0.35)}, 0 10px 30px -6px ${hexA(
                pal.foe,
                0.5
              )}`,
            }}
          >
            <span
              className="anim-death-ring absolute inset-0 rounded-full"
              style={{ boxShadow: `0 0 0 2px ${hexA(pal.foe, 0.5)}` }}
            />
            <svg width="42" height="42" viewBox="0 0 24 24" aria-hidden>
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke={pal.foe}
                strokeWidth="2"
              />
              <path
                d="M8.5 8.5l7 7M15.5 8.5l-7 7"
                stroke={pal.foe}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        <div
          className="text-[13px] font-bold uppercase tracking-[0.22em]"
          style={{ color: "rgba(255,255,255,.5)" }}
        >
          {meta.title}
        </div>
        <h2
          className="mt-1 text-4xl font-extrabold leading-none"
          style={{
            fontFamily: "var(--font-display)",
            color: "#fff",
            letterSpacing: "-0.01em",
          }}
        >
          {headline}
        </h2>

        {/* the score, counted up */}
        <div className="mt-7 flex items-end justify-center gap-2">
          <span
            className="text-7xl font-extrabold tabular-nums leading-none"
            style={{
              fontFamily: "var(--font-display)",
              color: "#fff",
              textShadow: "0 4px 24px rgba(0,0,0,.4)",
            }}
          >
            {score}
          </span>
          <span
            className="pb-1.5 text-lg font-bold"
            style={{ color: "rgba(255,255,255,.6)" }}
          >
            {meta.scoreUnit}
          </span>
        </div>

        {newBest ? (
          <div
            className="anim-shimmer mx-auto mt-4 flex w-fit items-center gap-1.5 rounded-full px-3.5 py-1.5"
            style={{
              background: "linear-gradient(90deg, var(--success), var(--accent))",
              color: "#fff",
            }}
          >
            <TrophyIcon size={15} />
            <span className="text-xs font-extrabold uppercase tracking-wide">
              New personal best
            </span>
          </div>
        ) : (
          <div
            className="mt-4 text-sm font-semibold"
            style={{ color: "rgba(255,255,255,.66)" }}
          >
            {result.topTen
              ? `#${result.rank} on ${meta.title}`
              : `You beat ${result.percentile}% of players`}
          </div>
        )}

        {/* stat rail */}
        <div
          className="mt-6 flex items-stretch rounded-2xl"
          style={{ background: "rgba(255,255,255,.05)" }}
        >
          <Stat label="Best" value={`${Math.max(best, result.score)}`} />
          <div style={{ width: 1, background: "rgba(255,255,255,.08)" }} />
          <Stat label="Rank" value={`#${result.rank}`} />
        </div>

        {/* actions */}
        <button
          onClick={onPlayAgain}
          className="pressable mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-extrabold"
          style={{
            background: "var(--accent)",
            color: "#fff",
            fontFamily: "var(--font-display)",
            boxShadow: "0 10px 26px -8px var(--accent)",
          }}
        >
          <ReplayIcon size={20} />
          Play again
        </button>
        <button
          onClick={onLeave}
          className="pressable mt-2.5 w-full rounded-2xl py-3.5 text-sm font-bold"
          style={{
            background: "rgba(255,255,255,.06)",
            color: "rgba(255,255,255,.82)",
          }}
        >
          Back to feed
        </button>
        {onSignIn && (
          <button
            onClick={onSignIn}
            className="pressable mt-3 text-xs font-bold"
            style={{ color: "var(--accent)" }}
          >
            Keep this score — sign in
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center py-3">
      <span
        className="text-xl font-extrabold tabular-nums"
        style={{ fontFamily: "var(--font-display)", color: "#fff" }}
      >
        {value}
      </span>
      <span
        className="mt-0.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: "rgba(255,255,255,.5)" }}
      >
        {label}
      </span>
    </div>
  );
}

function ReplayIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12a8 8 0 1 1 2.34 5.66"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M4 5v4h4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** rAF count-up with an easeOutCubic settle; jumps straight to target if reduced. */
function useCountUp(target: number, durationMs: number, animate: boolean): number {
  const [val, setVal] = useState(animate ? 0 : target);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!animate || target <= 0) {
      setVal(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, animate]);
  return val;
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

/** hex (#rrggbb) + alpha 0..1 -> rgba() string, for glows tinted by game colour. */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
