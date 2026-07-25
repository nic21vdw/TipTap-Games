"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { allSignals } from "@/lib/storage";
import { SearchIcon, SparkleIcon } from "@/components/ui/icons";
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

export function AlgorithmSheet() {
  const open = useUiStore((s) => s.sheet === "algo");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const memories = useAlgorithmStore((s) => s.memories);
  const applyQuery = useAlgorithmStore((s) => s.applyQuery);
  const drop = useAlgorithmStore((s) => s.drop);
  const mute = useAlgorithmStore((s) => s.mute);
  const reset = useAlgorithmStore((s) => s.reset);
  const cards = useFeedStore((s) => s.cards);
  const activeIndex = useFeedStore((s) => s.activeIndex);

  const [query, setQuery] = useState("");
  const [understood, setUnderstood] = useState<string[]>([]);
  const [missed, setMissed] = useState(false);

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
      .slice(0, 6);
  }, [open]);

  const run = (text: string) => {
    const q = text.trim();
    if (!q) return;
    const matched = applyQuery(q);
    setUnderstood(matched.map((m) => m.effect));
    setMissed(matched.length === 0);
    setQuery("");
  };

  const nextUp = cards.slice(activeIndex + 1, activeIndex + 6);

  return (
    <Sheet open={open} onClose={closeSheet} title="Your algorithm">
      {/* the search bar replaces every slider */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
      >
        <span style={{ color: "var(--ink-dim)" }}>
          <SearchIcon size={18} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(query);
          }}
          placeholder="say what you feel like playing"
          className="w-full bg-transparent text-sm outline-none"
          style={{ color: "var(--ink)" }}
        />
        <button
          onClick={() => run(query)}
          disabled={!query.trim()}
          className="pressable shrink-0 px-3 py-1 text-xs font-bold disabled:opacity-40"
          style={{
            background: "var(--accent)",
            color: "#fff",
            borderRadius: "calc(var(--radius) * 0.6)",
          }}
        >
          Tune
        </button>
      </div>

      {understood.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px]" style={{ color: "var(--ink-dim)" }}>
            picked up:
          </span>
          {understood.map((u, i) => (
            <span
              key={`${u}-${i}`}
              className="px-2 py-0.5 text-[11px] font-bold"
              style={{
                background: "var(--success)",
                color: "#fff",
                borderRadius: "999px",
              }}
            >
              {u}
            </span>
          ))}
        </div>
      )}
      {missed && (
        <p className="mt-2 text-[11px]" style={{ color: "var(--ink-dim)" }}>
          didn&apos;t catch anything in that one — say it another way
        </p>
      )}

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
            Nothing yet — the feed is showing you a bit of everything. Search
            above, or like a game, and the reasons show up here.
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

      {/* time tracker — the behaviour half of the algorithm, made legible */}
      {playTimes.length > 0 && (
        <div className="mt-6">
          <div
            className="mb-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-dim)" }}
          >
            Time on each game
          </div>
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
        </div>
      )}

      {/* live proof the algorithm is real */}
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
    </Sheet>
  );
}
