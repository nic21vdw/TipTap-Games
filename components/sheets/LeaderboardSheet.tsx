"use client";

import { getModule } from "@/games/registry";
import { Sheet } from "@/components/ui/Sheet";
import { getBest, getHandle, leaderboard, seededScores } from "@/lib/storage";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

export function LeaderboardSheet() {
  const open = useUiStore((s) => s.sheet === "leaderboard");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const cards = useFeedStore((s) => s.cards);
  const activeIndex = useFeedStore((s) => s.activeIndex);

  const slug = cards[activeIndex]?.slug;
  if (!slug) return null;
  const meta = getModule(slug).meta;
  const rows = open ? leaderboard(slug, 10) : [];
  const best = open ? getBest(slug) : 0;
  const above = open ? seededScores(slug).filter((s) => s.score > best).length : 0;

  return (
    <Sheet open={open} onClose={closeSheet} title={`${meta.title} — top 10`}>
      <ol className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <li
            key={`${r.handle}-${i}`}
            className="flex items-center justify-between px-3 py-2 text-sm"
            style={{
              borderRadius: "var(--radius)",
              background: r.you ? "var(--accent)" : "var(--bg)",
              color: r.you ? "var(--bg)" : "var(--ink)",
              fontWeight: r.you ? 800 : 500,
            }}
          >
            <span>
              <span className="mr-2 inline-block w-6 tabular-nums" style={{ opacity: 0.6 }}>
                {i + 1}
              </span>
              @{r.handle}
              {r.you ? " (you)" : ""}
            </span>
            <span className="font-bold tabular-nums">
              {r.score} {meta.scoreUnit}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 text-center text-xs font-semibold" style={{ color: "var(--ink-dim)" }}>
        {best > 0
          ? `@${getHandle()} — best ${best} ${meta.scoreUnit} · rank #${above + 1}`
          : "finish a run to get on the board"}
      </div>
    </Sheet>
  );
}
