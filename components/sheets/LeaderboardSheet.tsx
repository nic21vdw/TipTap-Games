"use client";

import { useEffect, useState } from "react";
import { getModule } from "@/games/registry";
import { Sheet } from "@/components/ui/Sheet";
import {
  fetchLeaderboard,
  fetchSeason,
  fetchSeasonLeaderboard,
  fetchSeasonOverall,
  fetchSeasonStanding,
  fetchStanding,
  type CloudStanding,
  type Season,
  type SeasonRankRow,
  type SeasonStanding,
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

type Scope = "season" | "allTime" | "contest";

function daysLeft(endsAt: number): string {
  const ms = endsAt - Date.now();
  if (ms <= 0) return "closed";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 2) return `${days} days left`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return hours >= 24 ? "1 day left" : `${hours}h left`;
}

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
  const [season, setSeason] = useState<Season | null>(null);
  const [scope, setScope] = useState<Scope>("allTime");
  const [contest, setContest] = useState<SeasonRankRow[] | null>(null);
  const [seasonStanding, setSeasonStanding] = useState<SeasonStanding | null>(null);

  // The contest, if one is running, is the headline — so a sheet opened
  // during a season lands on the month, not on all time.
  useEffect(() => {
    if (!open) return;
    let stale = false;
    void fetchSeason().then((s) => {
      if (stale || !s) return;
      setSeason(s);
      setScope((current) => (current === "allTime" ? "season" : current));
    });
    return () => {
      stale = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !slug || scope === "contest") return;
    let stale = false;
    setLive(null);
    setStanding(null);
    const board =
      scope === "season" ? fetchSeasonLeaderboard(slug, 10) : fetchLeaderboard(slug, 10);
    void board.then((rows) => {
      if (stale || !rows?.length) return;
      setLive(rows.map((r) => ({ handle: r.handle, score: r.score, you: r.you })));
    });
    if (signedIn && scope === "allTime") {
      void fetchStanding(slug).then((s) => {
        if (!stale) setStanding(s);
      });
    }
    return () => {
      stale = true;
    };
  }, [open, slug, signedIn, scope]);

  useEffect(() => {
    if (!open || !season) return;
    let stale = false;
    void fetchSeasonOverall(25).then((rows) => {
      if (!stale) setContest(rows);
    });
    if (signedIn) {
      void fetchSeasonStanding().then((s) => {
        if (!stale) setSeasonStanding(s);
      });
    }
    return () => {
      stale = true;
    };
  }, [open, season, signedIn, scope]);

  if (!slug) return null;
  const meta = getModule(slug).meta;

  const rows = live ?? (open && scope !== "season" ? leaderboard(slug, 10) : []);
  const localBest = open ? getBest(slug) : 0;
  const localRank = open
    ? seededScores(slug).filter((s) => s.score > localBest).length + 1
    : 1;
  const best = standing?.best ?? localBest;
  const rank = standing?.rank ?? localRank;

  const tabs: Array<{ id: Scope; label: string }> = season
    ? [
        { id: "season", label: "This month" },
        { id: "allTime", label: "All time" },
        { id: "contest", label: "Contest" },
      ]
    : [];

  const title =
    scope === "contest" && season ? season.title : `${meta.title} — top 10`;

  return (
    <Sheet open={open} onClose={closeSheet} title={title}>
      {season && (
        <div
          className="mb-3 px-3 py-2.5"
          style={{
            background: "var(--bg)",
            borderRadius: "var(--radius)",
          }}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-extrabold" style={{ color: "var(--accent)" }}>
              {season.title}
            </span>
            <span className="text-[11px] font-semibold" style={{ color: "var(--ink-dim)" }}>
              {daysLeft(season.endsAt)}
            </span>
          </div>
          {season.prize && (
            <p className="mt-1 text-[11px]" style={{ color: "var(--ink-dim)" }}>
              {season.prize}
            </p>
          )}
          <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--ink-dim)" }}>
            {seasonStanding && seasonStanding.rank > 0
              ? `${seasonStanding.points} pts · #${seasonStanding.rank} of ${seasonStanding.total} · ${seasonStanding.gamesPlayed} games placed`
              : "top 25 on any game scores points — every game you place on adds up"}
          </p>
        </div>
      )}

      {tabs.length > 0 && (
        <div className="mb-3 flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setScope(tab.id)}
              className="pressable flex-1 py-2 text-[11px] font-extrabold"
              style={{
                background: scope === tab.id ? "var(--accent)" : "var(--bg)",
                color: scope === tab.id ? "var(--bg)" : "var(--ink-dim)",
                borderRadius: "var(--radius)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {scope === "contest" ? (
        <>
          <ol className="flex flex-col gap-1">
            {(contest ?? []).map((r) => (
              <li
                key={`${r.handle}-${r.rank}`}
                className="flex items-center justify-between px-3 py-2 text-sm"
                style={{
                  borderRadius: "var(--radius)",
                  background: r.you ? "var(--accent)" : "var(--bg)",
                  color: r.you ? "var(--bg)" : "var(--ink)",
                  fontWeight: r.you ? 800 : 500,
                }}
              >
                <span>
                  <span
                    className="mr-2 inline-block w-6 tabular-nums"
                    style={{ opacity: 0.6 }}
                  >
                    {r.rank}
                  </span>
                  @{r.handle}
                  {r.you ? " (you)" : ""}
                </span>
                <span className="font-bold tabular-nums">
                  {r.points} pts
                  <span className="ml-2 text-[11px]" style={{ opacity: 0.6 }}>
                    {r.gamesPlayed} games
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {(contest ?? []).length === 0 && (
            <p
              className="py-6 text-center text-xs font-semibold"
              style={{ color: "var(--ink-dim)" }}
            >
              nobody has placed yet — first ranked run takes the lead
            </p>
          )}
        </>
      ) : (
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
          {rows.length === 0 && (
            <p
              className="py-6 text-center text-xs font-semibold"
              style={{ color: "var(--ink-dim)" }}
            >
              no ranked run on this game this month yet
            </p>
          )}
        </ol>
      )}

      {scope !== "contest" && (
        <div
          className="mt-4 text-center text-xs font-semibold"
          style={{ color: "var(--ink-dim)" }}
        >
          {best > 0
            ? `@${getHandle()} — best ${best} ${meta.scoreUnit} · rank #${rank}`
            : "finish a run to get on the board"}
        </div>
      )}

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
          {season ? "Sign in to enter the contest" : "Sign in to rank against everyone"}
        </button>
      )}

      <p className="mt-3 text-center text-[11px]" style={{ color: "var(--ink-dim)" }}>
        {scope === "contest"
          ? "points from your best run on every game · ranked runs only"
          : live
            ? "live board · ranked runs only"
            : "sample board — no ranked runs on this game yet"}
      </p>
    </Sheet>
  );
}
