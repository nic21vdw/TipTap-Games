"use client";

import { useEffect, useRef, useState } from "react";
import { GameHost, type RunResult } from "@/components/feed/GameHost";
import { getModule } from "@/games/registry";
import { getBest, getHandle } from "@/lib/storage";
import { useFeedStore, type FeedCard as FeedCardData } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

interface Props {
  card: FeedCardData;
  index: number;
}

export function GameCard({ card, index }: Props) {
  const activeIndex = useFeedStore((s) => s.activeIndex);
  const active = index === activeIndex;
  const mounted = Math.abs(index - activeIndex) <= 1;
  const meta = getModule(card.slug).meta;
  const openSheet = useUiStore((s) => s.openSheet);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (mounted) setBest(getBest(card.slug));
  }, [mounted, card.slug]);

  useEffect(() => {
    return () => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
    };
  }, []);

  const handleRunEnd = (r: RunResult) => {
    setResult(r);
    if (r.isBest) setBest(r.score);
    if (resultTimer.current) clearTimeout(resultTimer.current);
    resultTimer.current = setTimeout(() => setResult(null), 2800);
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `I scored ${best || score} on ${meta.title} — Tip Tap Games`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Tip Tap Games", text, url });
        return;
      }
    } catch {
      // fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing to do
    }
  };

  const locksGestures = meta.tags.some((t) => t === "drag" || t === "hold");

  return (
    <section
      data-index={index}
      className="relative h-dvh w-full snap-start snap-always overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {mounted ? (
        <GameHost
          slug={card.slug}
          active={active}
          onScore={setScore}
          onRunEnd={handleRunEnd}
        />
      ) : (
        <div className="h-full w-full" />
      )}

      {/* drag/hold games eat touches — leave the top strip scrollable */}
      {locksGestures && (
        <div
          className="absolute inset-x-0 top-0 z-20 h-28"
          style={{ touchAction: "pan-y" }}
        />
      )}

      {/* score HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center pt-[calc(env(safe-area-inset-top)+14px)]">
        <div
          className="text-4xl font-extrabold tabular-nums"
          style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
        >
          <span key={score} className="anim-pop tabular-nums">
            {score}
          </span>
          <span className="ml-1 text-base font-semibold" style={{ color: "var(--ink-dim)" }}>
            {meta.scoreUnit}
          </span>
        </div>
        <div className="text-xs font-semibold" style={{ color: "var(--ink-dim)" }}>
          best {Math.max(best, score)}
        </div>
      </div>

      {/* rule overlay, bottom left */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-30 max-w-[70%] p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div
          className="text-xl font-extrabold leading-tight"
          style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
        >
          {meta.title}
        </div>
        <div className="mt-1 text-sm" style={{ color: "var(--ink-dim)" }}>
          {meta.rule}
          {locksGestures ? " · swipe from top edge to skip" : ""}
        </div>
      </div>

      {/* right rail */}
      <div
        className="absolute bottom-24 right-2 z-30 flex flex-col items-center gap-4"
        style={{ touchAction: "pan-y" }}
      >
        <RailButton label="Ranks" icon="🏆" onClick={() => openSheet("leaderboard")} />
        <RailButton label="Tune" icon="🎛️" onClick={() => openSheet("algo")} />
        <RailButton label="Theme" icon="🎨" onClick={() => openSheet("theme")} />
        <RailButton label={copied ? "Copied" : "Share"} icon="↗" onClick={share} />
        <div className="mt-1 text-[10px] font-semibold" style={{ color: "var(--ink-dim)" }}>
          @{typeof window === "undefined" ? "guest" : getHandle()}
        </div>
      </div>

      {/* run result toast */}
      {result && (
        <div
          className="anim-toast absolute inset-x-0 top-[18%] z-30 mx-auto w-fit px-5 py-3 text-center"
          style={{
            background: "var(--surface)",
            borderRadius: "var(--radius)",
            fontFamily: "var(--font-body)",
          }}
        >
          <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            {result.topTen
              ? `#${result.rank} on ${meta.title}!`
              : `You beat ${result.percentile}% of players`}
          </div>
          {result.isBest && result.score > 0 && (
            <div className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
              new personal best · {result.score} {meta.scoreUnit}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RailButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="pressable flex flex-col items-center gap-0.5"
      aria-label={label}
    >
      <span
        className="theme-smooth flex h-12 w-12 items-center justify-center text-xl"
        style={{ background: "color-mix(in srgb, var(--surface) 80%, transparent)", borderRadius: "var(--radius)" }}
      >
        {icon}
      </span>
      <span className="text-[10px] font-semibold" style={{ color: "var(--ink)" }}>
        {label}
      </span>
    </button>
  );
}
