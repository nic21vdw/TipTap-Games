"use client";

import { useMemo } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { allSignals } from "@/lib/storage";
import { SparkleIcon } from "@/components/ui/icons";
import { getMeta } from "@/games/registry";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";
import type { MemorySource } from "@/lib/memories";

function fmt(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

const SOURCE_LABEL: Record<MemorySource, string> = {
  query: "you said",
  like: "you liked",
  behavior: "how you play",
};

/**
 * Everything the feed has stored about you, in one place: time on each game,
 * the rules it derived from that, and what's queued next. Read-and-erase —
 * the tuning itself lives in the algorithm search bar.
 */
export function SettingsSheet() {
  const open = useUiStore((s) => s.sheet === "settings");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const openSheet = useUiStore((s) => s.openSheet);
  const memories = useAlgorithmStore((s) => s.memories);
  const drop = useAlgorithmStore((s) => s.drop);
  const mute = useAlgorithmStore((s) => s.mute);
  const reset = useAlgorithmStore((s) => s.reset);
  const cards = useFeedStore((s) => s.cards);
  const activeIndex = useFeedStore((s) => s.activeIndex);

  // recomputed each time the sheet opens, so it always reflects this session
  const playTimes = useMemo(() => {
    if (!open) return [];
    return Object.entries(allSignals())
      .map(([slug, s]) => ({
        slug,
        ms: s.dwellMs,
        title: (() => {
          try {
            return getMeta(slug).title;
          } catch {
            return slug;
          }
        })(),
      }))
      .filter((p) => p.ms > 1500)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 8);
  }, [open]);

  const totalMs = playTimes.reduce((a, p) => a + p.ms, 0);
  const nextUp = cards.slice(activeIndex + 1, activeIndex + 6);

  return (
    <Sheet open={open} onClose={closeSheet} title="Settings">
      {/* time tracker — the behaviour half of the algorithm, made legible */}
      <div>
        <div
          className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--ink-dim)" }}
        >
          <span>Time on each game</span>
          {totalMs > 0 && (
            <span className="tabular-nums normal-case tracking-normal">
              {fmt(totalMs)} total
            </span>
          )}
        </div>

        {playTimes.length === 0 ? (
          <p
            className="px-3 py-4 text-center text-xs"
            style={{
              color: "var(--ink-dim)",
              background: "var(--bg)",
              borderRadius: "var(--radius)",
            }}
          >
            Nothing played yet. Play a few games and your time shows up here.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              {playTimes.map((p) => (
                <div key={p.slug} className="flex items-center gap-2">
                  <span
                    className="w-28 shrink-0 truncate text-[13px] font-semibold"
                    style={{ color: "var(--ink)" }}
                  >
                    {p.title}
                  </span>
                  <div
                    className="h-2 flex-1 overflow-hidden"
                    style={{ background: "var(--bg)", borderRadius: "999px" }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.round((p.ms / playTimes[0].ms) * 100)}%`,
                        background: "var(--accent)",
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                  <span
                    className="w-14 shrink-0 text-right text-[11px] font-bold tabular-nums"
                    style={{ color: "var(--ink-dim)" }}
                  >
                    {fmt(p.ms)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px]" style={{ color: "var(--ink-dim)" }}>
              The longer you stay on a game, the more the feed leans that way.
              Times count play, not the demo.
            </p>
          </>
        )}
      </div>

      {/* the memory list — every point the feed is considering */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-dim)" }}
          >
            What it knows about you
          </span>
          {memories.length > 0 && (
            <button
              onClick={reset}
              className="pressable text-[11px] font-bold"
              style={{ color: "var(--danger)" }}
            >
              Forget all
            </button>
          )}
        </div>

        {memories.length === 0 ? (
          <p
            className="px-3 py-4 text-center text-xs"
            style={{
              color: "var(--ink-dim)",
              background: "var(--bg)",
              borderRadius: "var(--radius)",
            }}
          >
            Nothing yet — the feed is showing you a bit of everything. Like a
            game, or search your feed, and the reasons show up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {memories.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 px-3 py-2"
                style={{
                  background: "var(--bg)",
                  borderRadius: "var(--radius)",
                  opacity: m.enabled ? 1 : 0.45,
                }}
              >
                <span
                  className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase"
                  style={{
                    background: "var(--surface)",
                    color: "var(--ink-dim)",
                    borderRadius: "4px",
                  }}
                >
                  {SOURCE_LABEL[m.source]}
                </span>
                <span
                  className="flex-1 text-[13px] font-semibold leading-tight"
                  style={{
                    color: "var(--ink)",
                    textDecoration: m.enabled ? "none" : "line-through",
                  }}
                >
                  {m.label}
                </span>
                <button
                  onClick={() => mute(m.id)}
                  className="pressable shrink-0 text-[11px] font-bold"
                  style={{ color: "var(--ink-dim)" }}
                >
                  {m.enabled ? "Mute" : "Unmute"}
                </button>
                <button
                  onClick={() => drop(m.id)}
                  aria-label="Forget this"
                  className="pressable shrink-0 text-base leading-none"
                  style={{ color: "var(--ink-dim)" }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* live proof the algorithm is real */}
      {nextUp.length > 0 && (
        <div className="mt-6">
          <div
            className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-dim)" }}
          >
            <SparkleIcon size={14} /> Next up
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {nextUp.map((c, i) => (
              <div
                key={c.uid}
                className="shrink-0 px-3 py-2 text-xs font-bold"
                style={{
                  borderRadius: "var(--radius)",
                  background: "var(--bg)",
                  color: i === 0 ? "var(--accent)" : "var(--ink)",
                }}
              >
                {getMeta(c.slug).title}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => openSheet("algo")}
        className="pressable mt-6 w-full py-2.5 text-xs font-bold"
        style={{
          background: "var(--bg)",
          color: "var(--ink-dim)",
          borderRadius: "var(--radius)",
        }}
      >
        Change what you get shown →
      </button>
    </Sheet>
  );
}
