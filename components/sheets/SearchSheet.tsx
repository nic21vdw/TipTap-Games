"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SparkleIcon } from "@/components/ui/icons";
import { registerSpec } from "@/games/custom";
import {
  loadCustomSpecs,
  saveCustomSpec,
  type CustomGameSpec,
} from "@/lib/storage";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

// Staged copy for the build bar. The request is one round trip, but the
// player should feel like something is actually happening under the hood.
const STAGES = [
  { at: 0, label: "Reading your prompt..." },
  { at: 0.22, label: "Picking a mechanic..." },
  { at: 0.48, label: "Tuning the algorithm..." },
  { at: 0.72, label: "Painting the palette..." },
  { at: 0.9, label: "Compiling your game..." },
];

export function SearchSheet() {
  const open = useUiStore((s) => s.sheet === "search");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<CustomGameSpec[]>(() =>
    typeof window === "undefined" ? [] : loadCustomSpecs()
  );
  const rafRef = useRef<number>(0);

  // Eases toward 92% over ~2.6s and holds — never claims done before the
  // real response lands, but always keeps visibly climbing while it waits.
  useEffect(() => {
    if (!busy) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 2600;
      const eased = 1 - Math.pow(1 - Math.min(1, t), 3);
      setProgress(Math.min(0.92, eased * 0.92));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [busy]);

  const stageLabel =
    [...STAGES].reverse().find((s) => progress >= s.at)?.label ?? STAGES[0].label;

  const generate = async () => {
    if (busy || !prompt.trim()) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`generate failed: ${res.status}`);
      const { spec } = (await res.json()) as { spec: CustomGameSpec };
      if (!registerSpec(spec)) throw new Error("could not build that one");
      setProgress(1);
      saveCustomSpec(spec);
      setMine(loadCustomSpecs());
      useFeedStore.getState().insertNext(spec.slug);
      setPrompt("");
      // let the bar visibly hit 100% before the sheet closes
      await new Promise((r) => setTimeout(r, 260));
      closeSheet(); // swipe once — it's the next card
    } catch (e) {
      setError(e instanceof Error ? e.message : "something broke, go again");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const playNext = (slug: string) => {
    useFeedStore.getState().insertNext(slug);
    closeSheet();
  };

  return (
    <Sheet open={open} onClose={closeSheet} title="Make a game">
      <p className="mb-3 text-sm" style={{ color: "var(--ink-dim)" }}>
        Yap about a game you wish existed. The feed designs it and drops it in
        as your next card.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        disabled={busy}
        placeholder="something fast and neon where I bet everything and dodge stuff..."
        className="w-full resize-none p-3 text-sm outline-none disabled:opacity-60"
        style={{
          background: "var(--bg)",
          color: "var(--ink)",
          borderRadius: "var(--radius)",
        }}
      />
      <button
        onClick={generate}
        disabled={busy || !prompt.trim()}
        className="pressable mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold disabled:opacity-100"
        style={{
          background: "var(--accent)",
          color: "#fff",
          borderRadius: "var(--radius)",
          opacity: busy ? 1 : !prompt.trim() ? 0.4 : 1,
        }}
      >
        <SparkleIcon size={18} />
        {busy ? "Building..." : "Generate my game"}
      </button>

      {busy && (
        <div className="mt-3">
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ background: "var(--bg)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-150 ease-out"
              style={{
                width: `${Math.round(progress * 100)}%`,
                background:
                  "linear-gradient(90deg, var(--accent), var(--accent-alt, var(--accent)))",
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--ink-dim)" }}
            >
              {stageLabel}
            </span>
            <span
              className="text-xs font-bold tabular-nums"
              style={{ color: "var(--accent)" }}
            >
              {Math.round(progress * 100)}%
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs font-semibold" style={{ color: "var(--danger)" }}>
          {error}
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
