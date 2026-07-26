"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SparkleIcon } from "@/components/ui/icons";
import { startGeneration } from "@/lib/generator";
import { loadCustomSpecs, type CustomGameSpec } from "@/lib/storage";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

export function SearchSheet() {
  const open = useUiStore((s) => s.sheet === "search");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const [prompt, setPrompt] = useState("");
  const [building, setBuilding] = useState<string | null>(null);
  const [mine, setMine] = useState<CustomGameSpec[]>(() =>
    typeof window === "undefined" ? [] : loadCustomSpecs()
  );

  // Fire and forget: the placeholder card drops into the feed and builds
  // itself in the background, then swaps to the finished game in place.
  const generate = () => {
    if (!prompt.trim()) return;
    const { title, done } = startGeneration(prompt);
    setBuilding(title);
    setPrompt("");
    done
      .then(() => setMine(loadCustomSpecs()))
      .catch(() => {})
      .finally(() => setBuilding((t) => (t === title ? null : t)));
    // Close after a beat so the "it's building" line registers first.
    setTimeout(closeSheet, 900);
  };

  const playNext = (slug: string) => {
    useFeedStore.getState().insertNext(slug);
    closeSheet();
  };

  return (
    <Sheet open={open} onClose={closeSheet} title="Make a game">
      <p className="mb-3 text-sm" style={{ color: "var(--ink-dim)" }}>
        Yap about a game you wish existed. The feed designs it and drops it in
        as your next card — watch it build itself right there.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="something fast and neon where I bet everything and dodge stuff..."
        className="w-full resize-none p-3 text-sm outline-none"
        style={{
          background: "var(--bg)",
          color: "var(--ink)",
          borderRadius: "var(--radius)",
        }}
      />
      <button
        onClick={generate}
        disabled={!prompt.trim()}
        className="pressable mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold disabled:opacity-40"
        style={{
          background: "var(--accent)",
          color: "#fff",
          borderRadius: "var(--radius)",
        }}
      >
        <SparkleIcon size={18} />
        Generate my game
      </button>
      {building && (
        <p className="mt-2 text-xs font-semibold" style={{ color: "var(--accent)" }}>
          Building “{building}” — it's designing itself in your feed as the next
          card.
        </p>
      )}

      {mine.length > 0 && (
        <div className="mt-6">
          <div
            className="mb-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-dim)" }}
          >
            Your games
          </div>
          <div className="flex flex-col gap-2">
            {mine.map((s) => (
              <button
                key={s.slug}
                onClick={() => playNext(s.slug)}
                className="pressable flex items-center justify-between px-3 py-2.5 text-left"
                style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
              >
                <span>
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                    style={{ background: s.accent }}
                  />
                  <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                    {s.title}
                  </span>
                  <span className="ml-2 text-xs" style={{ color: "var(--ink-dim)" }}>
                    {s.rule}
                  </span>
                </span>
                <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                  Play next
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
