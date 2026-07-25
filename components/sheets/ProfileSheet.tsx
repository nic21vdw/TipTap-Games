"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import { SectionLabel, Stat } from "@/components/sheets/AccountSheet";
import { MessageIcon, TrashIcon } from "@/components/ui/icons";
import {
  followerCount,
  getAccount,
  isFollowing,
  levelProgress,
} from "@/lib/accounts";
import { gamesByAuthor, removeGame } from "@/lib/library";
import { unregisterSpec } from "@/games/custom";
import { statsFor } from "@/lib/storage";
import { useAccountStore } from "@/store/useAccountStore";
import { useFeedStore } from "@/store/useFeedStore";
import { useMessagesStore } from "@/store/useMessagesStore";
import { useUiStore } from "@/store/useUiStore";

/** Any account's profile — yours, another player's on this device, or a bot's. */
export function ProfileSheet() {
  const open = useUiStore((s) => s.sheet === "profile");
  const profileId = useUiStore((s) => s.profileId);
  const closeSheet = useUiStore((s) => s.closeSheet);
  const openSheet = useUiStore((s) => s.openSheet);
  const openThread = useMessagesStore((s) => s.open);
  const me = useAccountStore((s) => s.me);
  const toggleFollow = useAccountStore((s) => s.toggleFollow);
  // re-reads on every account mutation so follow counts stay live
  useAccountStore((s) => s.accounts);

  const [games, setGames] = useState<ReturnType<typeof gamesByAuthor>>([]);

  const account = open ? getAccount(profileId) : null;

  useEffect(() => {
    if (account) setGames(gamesByAuthor(account.id));
  }, [account]);

  if (!open || !account || !me) return null;

  const isMe = account.id === me.id;
  const stats = statsFor(account.id);
  const { level, pct, next } = levelProgress(account.xp);
  const following = isFollowing(account.id);

  const playNext = (slug: string) => {
    useFeedStore.getState().insertNext(slug);
    closeSheet();
  };

  const unpublish = (slug: string) => {
    if (!removeGame(slug, me.id)) return;
    unregisterSpec(slug);
    useFeedStore.getState().dropSlug(slug);
    setGames(gamesByAuthor(account.id));
  };

  return (
    <Sheet open={open} onClose={closeSheet} title={`@${account.handle}`}>
      <div className="flex items-center gap-3">
        <Avatar account={account} size={56} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-extrabold" style={{ fontFamily: "var(--font-display)" }}>
            {account.name}
          </div>
          <div className="text-xs font-semibold" style={{ color: "var(--ink-dim)" }}>
            {account.kind === "bot" ? "bot account · replies automatically" : `level ${level}`}
            {" · "}
            {followerCount(account.id)} follower
            {followerCount(account.id) === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {account.bio && (
        <p className="mt-2 text-sm leading-snug" style={{ color: "var(--ink-dim)" }}>
          {account.bio}
        </p>
      )}

      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between text-xs font-bold">
          <span>Level {level}</span>
          <span style={{ color: "var(--ink-dim)" }}>
            {account.xp} / {next} XP
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden" style={{ background: "var(--bg)", borderRadius: "999px" }}>
          <div
            className="h-full transition-[width] duration-500"
            style={{ width: `${Math.round(pct * 100)}%`, background: "var(--accent)" }}
          />
        </div>
      </div>

      {account.kind === "bot" ? (
        <p className="mt-3 text-xs leading-snug" style={{ color: "var(--ink-dim)" }}>
          A house account. It holds a spot on the seeded leaderboards and
          answers messages automatically — the level is flavour, not a record
          of runs someone actually played.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-4 gap-2">
          <Stat label="runs" value={stats.runs} />
          <Stat label="games" value={stats.gamesPlayed} />
          <Stat label="mins" value={stats.minutes} />
          <Stat label="made" value={games.length} />
        </div>
      )}

      {!isMe && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => toggleFollow(account.id)}
            className="pressable flex-1 py-2.5 text-xs font-bold"
            style={{
              background: following ? "var(--bg)" : "var(--accent)",
              color: following ? "var(--ink)" : "#fff",
              borderRadius: "var(--radius)",
            }}
          >
            {following ? "Following" : "Follow"}
          </button>
          <button
            onClick={() => {
              openThread(account.id);
              openSheet("messages");
            }}
            className="pressable flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-bold"
            style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
          >
            <MessageIcon size={16} /> Message
          </button>
        </div>
      )}

      {isMe && (
        <button
          onClick={() => openSheet("account")}
          className="pressable mt-4 w-full py-2.5 text-xs font-bold"
          style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
        >
          Edit profile
        </button>
      )}

      <div className="mt-5">
        <SectionLabel>
          {games.length > 0 ? "Games they made" : "No games published yet"}
        </SectionLabel>
        <div className="flex flex-col gap-2">
          {games.map((g) => (
            <div
              key={g.slug}
              className="flex items-center gap-2 px-3 py-2.5"
              style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: g.accent }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{g.title}</span>
                <span className="block truncate text-xs" style={{ color: "var(--ink-dim)" }}>
                  {g.rule}
                </span>
              </span>
              <button
                onClick={() => playNext(g.slug)}
                className="pressable text-xs font-bold"
                style={{ color: "var(--accent)" }}
              >
                Play next
              </button>
              {isMe && (
                <button
                  onClick={() => unpublish(g.slug)}
                  aria-label={`Unpublish ${g.title}`}
                  className="pressable"
                  style={{ color: "var(--ink-dim)" }}
                >
                  <TrashIcon size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
