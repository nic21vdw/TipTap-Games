"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SearchIcon } from "@/components/ui/icons";
import { GameIcon } from "@/components/ui/gameIcons";
import { CATALOG } from "@/games/registry";
import type { FullGameMeta } from "@/games/types";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

export function GamesSheet() {
  const open = useUiStore((s) => s.sheet === "games");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const [query, setQuery] = useState("");

  // Read the live catalog each open — it includes any games minted or
  // generated this session, so the gallery is always the full library.
  const games = useMemo<FullGameMeta[]>(() => {
    const all = [...CATALOG].sort((a, b) => a.title.localeCompare(b.title));
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.rule.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const play = (slug: string) => {
    // Same contract as the maker sheet: drop it in as the next card and let
    // the player swipe once into it.
    useFeedStore.getState().insertNext(slug);
    closeSheet();
  };

  return (
    <Sheet open={open} onClose={closeSheet} title="All games">
      <div
        className="mb-3 flex items-center gap-2 px-3 py-2.5"
        style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
      >
        <span style={{ color: "var(--ink-dim)" }}>
          <SearchIcon size={18} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search games, rules, tags..."
          className="w-full bg-transparent text-sm outline-none"
          style={{ color: "var(--ink)" }}
        />
      </div>

      <p className="mb-3 text-xs" style={{ color: "var(--ink-dim)" }}>
        {games.length} game{games.length === 1 ? "" : "s"} · tap one to drop it in
        as your next card
      </p>

      {games.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--ink-dim)" }}>
          Nothing matches “{query.trim()}”.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {games.map((m) => (
            <button
              key={m.slug}
              onClick={() => play(m.slug)}
              className="pressable flex items-center gap-3 p-2.5 text-left"
              style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
            >
              <GameIcon palette={m.palette} tags={m.tags} size={48} />
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-sm font-bold"
                  style={{ color: "var(--ink)" }}
                >
                  {m.title}
                </span>
                <span
                  className="mt-0.5 block truncate text-[11px] leading-snug"
                  style={{ color: "var(--ink-dim)" }}
                >
                  {m.rule}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
