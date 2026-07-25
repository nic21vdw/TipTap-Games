"use client";

import { useEffect, useState } from "react";
import { getModule } from "@/games/registry";
import { Sheet } from "@/components/ui/Sheet";
import {
  fetchLeaderboard,
  fetchStanding,
  type CloudStanding,
} from "@/lib/cloud";
import {
  getBest,
  getHandle,
  leaderboard,
  seededScores,
  type LeaderboardEntry,
} from "@/lib/storage";
import { useAuthStore } from "@/store/useAuthStore";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

export function LeaderboardSheet() {
  const open = useUiStore((s) => s.sheet === "leaderboard");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const openSheet = useUiStore((s) => s.openSheet);
  const cards = useFeedStore((s) => s.cards);
  const activeIndex = useFeedStore((s) => s.activeIndex);
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  const cloudOff = useAuthStore((s) => s.status === "off");

  const slug = cards[activeIndex]?.slug;

  // Real rows when there's a backend, seeded rows otherwise. Held in state so
  // an empty new board falls back rather than showing nothing.
  const [live, setLive] = useState<LeaderboardEntry[] | null>(null);
  const [standing, setStanding] = useState<CloudStanding | null>(null);

  useEffect(() => {
    if (!open || !slug) return;
    let stale = false;
    setLive(null);
    setStanding(null);
    void fetchLeaderboard(slug, 10).then((rows) => {
      if (stale || !rows?.length) return;
      setLive(rows.map((r) => ({ handle: r.handle, score: r.score, you: r.you })));
    });
    if (signedIn) {
      void fetchStanding(slug).then((s) => {
        if (!stale) setStanding(s);
      });
    }
    return () => {
      stale = true;
    };
  }, [open, slug, signedIn]);

  if (!slug) return null;
  const meta = getModule(slug).meta;

  const rows = live ?? (open ? leaderboard(slug, 10) : []);
  const localBest = open ? getBest(slug) : 0;
  const localRank = open
    ? seededScores(slug).filter((s) => s.score > localBest).length + 1
    : 1;
  const best = standing?.best ?? localBest;
  const rank = standing?.rank ?? localRank;

  return (
    <Sheet
      open={open}
      onClose={closeSheet}
      title={`${meta.title} — top 10`}
    >
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
          ? `@${getHandle()} — best ${best} ${meta.scoreUnit} · rank #${rank}`
          : "finish a run to get on the board"}
      </div>

      {!signedIn && !cloudOff && (
        <button
          onClick={() => {
            closeSheet();
            openSheet("account");
          }}
          className="pressable mt-3 w-full py-2.5 text-xs font-extrabold"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
            borderRadius: "var(--radius)",
          }}
        >
          Sign in to rank against everyone
        </button>
      )}

      <p className="mt-3 text-center text-[11px]" style={{ color: "var(--ink-dim)" }}>
        {live
          ? "live board · ranked runs only"
          : "sample board — no ranked runs on this game yet"}
      </p>
    </Sheet>
  );
}
