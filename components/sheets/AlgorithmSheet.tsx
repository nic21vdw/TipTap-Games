"use client";

import { Sheet } from "@/components/ui/Sheet";
import { PRESETS } from "@/lib/algorithm";
import { getModule } from "@/games/registry";
import type { GameTag } from "@/games/types";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

const SLIDERS: {
  key: "intensity" | "luck" | "nostalgia" | "variety";
  left: string;
  right: string;
}[] = [
  { key: "intensity", left: "Calm", right: "Frantic" },
  { key: "luck", left: "Pure skill", right: "Pure chance" },
  { key: "nostalgia", left: "Modern", right: "2008" },
  { key: "variety", left: "More of this", right: "Surprise me" },
];

const CHIP_TAGS: GameTag[] = [
  "casino",
  "retro",
  "oneTap",
  "calm",
  "chaos",
  "memory",
  "precision",
  "luck",
];

export function AlgorithmSheet() {
  const open = useUiStore((s) => s.sheet === "algo");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const vector = useAlgorithmStore((s) => s.vector);
  const presetId = useAlgorithmStore((s) => s.presetId);
  const setSlider = useAlgorithmStore((s) => s.setSlider);
  const cycleTag = useAlgorithmStore((s) => s.cycleTag);
  const applyPreset = useAlgorithmStore((s) => s.applyPreset);
  const cards = useFeedStore((s) => s.cards);
  const activeIndex = useFeedStore((s) => s.activeIndex);

  const nextUp = cards.slice(activeIndex + 1, activeIndex + 6);

  return (
    <Sheet open={open} onClose={closeSheet} title="Your algorithm">
      {/* presets */}
      <div className="mb-5 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className="pressable px-3 py-1.5 text-sm font-bold"
            style={{
              borderRadius: "var(--radius)",
              background: presetId === p.id ? "var(--accent)" : "var(--bg)",
              color: presetId === p.id ? "var(--bg)" : "var(--ink)",
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* sliders */}
      <div className="flex flex-col gap-4">
        {SLIDERS.map((s) => (
          <label key={s.key} className="block">
            <div
              className="mb-1 flex justify-between text-xs font-semibold"
              style={{ color: "var(--ink-dim)" }}
            >
              <span>{s.left}</span>
              <span>{s.right}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={vector[s.key]}
              onChange={(e) => setSlider(s.key, Number(e.target.value))}
              className="w-full"
              style={{ accentColor: "var(--accent)" }}
            />
          </label>
        ))}
      </div>

      {/* tag chips: tap cycles want -> block -> neutral */}
      <div className="mt-5">
        <div className="mb-2 text-xs font-semibold" style={{ color: "var(--ink-dim)" }}>
          tap once to demand a tag, twice to block it
        </div>
        <div className="flex flex-wrap gap-2">
          {CHIP_TAGS.map((tag) => {
            const mode = vector.onlyTags.includes(tag)
              ? "only"
              : vector.blockTags.includes(tag)
                ? "block"
                : "neutral";
            return (
              <button
                key={tag}
                onClick={() => cycleTag(tag)}
                className="pressable px-3 py-1 text-xs font-bold"
                style={{
                  borderRadius: "var(--radius)",
                  background:
                    mode === "only"
                      ? "var(--success)"
                      : mode === "block"
                        ? "var(--danger)"
                        : "var(--bg)",
                  color: mode === "neutral" ? "var(--ink-dim)" : "var(--bg)",
                  textDecoration: mode === "block" ? "line-through" : "none",
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* live proof the algorithm is real */}
      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-dim)" }}>
          Next up
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
              {getModule(c.slug).meta.title}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
