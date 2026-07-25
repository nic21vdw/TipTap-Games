"use client";

import { useState } from "react";
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

export function SearchSheet() {
  const open = useUiStore((s) => s.sheet === "search");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<CustomGameSpec[]>(() =>
    typeof window === "undefined" ? [] : loadCustomSpecs()
  );

  const generate = async () => {
    if (busy || !prompt.trim()) return;
    setBusy(true);
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
      saveCustomSpec(spec);
      setMine(loadCustomSpecs());
      useFeedStore.getState().insertNext(spec.slug);
      setPrompt("");
      closeSheet(); // swipe once — it's the next card
    } catch (e) {
      setError(e instanceof Error ? e.message : "something broke, go again");
    } finally {
      setBusy(false);
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
        disabled={busy || !prompt.trim()}
        className="pressable mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold disabled:opacity-40"
        style={{
          background: "var(--accent)",
          color: "#fff",
          borderRadius: "var(--radius)",
        }}
      >
        <SparkleIcon size={18} />
        {busy ? "Designing..." : "Generate my game"}
      </button>
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
