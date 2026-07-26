"use client";

import { Sheet } from "@/components/ui/Sheet";
import { TagIcon } from "@/components/ui/tagIcon";
import { CATALOG } from "@/games/registry";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

export function GamesSheet() {
  const open = useUiStore((s) => s.sheet === "games");
  const closeSheet = useUiStore((s) => s.closeSheet);

  const play = (slug: string) => {
    useFeedStore.getState().insertNext(slug);
    closeSheet();
  };

  return (
    <Sheet open={open} onClose={closeSheet} title="All games">
      <p className="mb-3 text-sm" style={{ color: "var(--ink-dim)" }}>
        {CATALOG.length} games. Tap one to play it next.
      </p>
      <div className="grid grid-cols-3 gap-3">
        {CATALOG.map((meta) => (
          <button
            key={meta.slug}
            onClick={() => play(meta.slug)}
            className="pressable flex flex-col items-center gap-2 px-2 py-3 text-center"
            style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
          >
            <span
              className="flex h-12 w-12 items-center justify-center"
              style={{
                background: `${meta.palette.hero}22`,
                color: meta.palette.hero,
                borderRadius: "999px",
              }}
            >
              <TagIcon tags={meta.tags} size={24} />
            </span>
            <span
              className="text-xs font-bold leading-tight"
              style={{ color: "var(--ink)" }}
            >
              {meta.title}
            </span>
            <span
              className="text-[10px] leading-tight"
              style={{ color: "var(--ink-dim)" }}
            >
              {meta.rule}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
