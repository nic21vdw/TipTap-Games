"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import { SectionLabel } from "@/components/sheets/AccountSheet";
import { ChevronLeftIcon, GamepadIcon, SendIcon } from "@/components/ui/icons";
import { getAccount, people } from "@/lib/accounts";
import { gamesByAuthor } from "@/lib/library";
import { getMeta } from "@/games/registry";
import type { GameAttachment } from "@/lib/social";
import { useAccountStore } from "@/store/useAccountStore";
import { useFeedStore } from "@/store/useFeedStore";
import { useMessagesStore } from "@/store/useMessagesStore";
import { useUiStore } from "@/store/useUiStore";

export function MessagesSheet() {
  const open = useUiStore((s) => s.sheet === "messages");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const peerId = useMessagesStore((s) => s.peerId);
  const back = useMessagesStore((s) => s.back);
  const peer = getAccount(peerId);

  return (
    <Sheet
      open={open}
      onClose={() => {
        back();
        closeSheet();
      }}
      title={peer ? `@${peer.handle}` : "Messages"}
    >
      {peerId ? <Thread /> : <Inbox />}
    </Sheet>
  );
}

// ---- inbox ----

function Inbox() {
  const threads = useMessagesStore((s) => s.threads);
  const openThread = useMessagesStore((s) => s.open);
  const me = useAccountStore((s) => s.me);
  const suggestions = me ? people(me.id).slice(0, 6) : [];

  return (
    <div>
      {threads.length === 0 && (
        <p className="mb-4 text-sm" style={{ color: "var(--ink-dim)" }}>
          No threads yet. Send someone a game you made — that&apos;s the whole
          point of the studio.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {threads.map((t) => (
          <button
            key={t.conversation.id}
            onClick={() => t.peer && openThread(t.peer.id)}
            className="pressable flex items-center gap-3 px-3 py-2.5 text-left"
            style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
          >
            <Avatar account={t.peer} size={40} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="truncate text-sm font-bold">
                  {t.peer?.name ?? "unknown"}
                </span>
                <span className="truncate text-[11px]" style={{ color: "var(--ink-dim)" }}>
                  @{t.peer?.handle}
                </span>
              </span>
              <span className="block truncate text-xs" style={{ color: "var(--ink-dim)" }}>
                {t.last?.game && !t.last.text
                  ? `sent a game · ${t.last.game.title}`
                  : t.last?.text}
              </span>
            </span>
            {t.unread > 0 && (
              <span
                className="min-w-5 px-1.5 py-0.5 text-center text-[10px] font-extrabold"
                style={{ background: "var(--accent)", color: "#fff", borderRadius: "999px" }}
              >
                {t.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <SectionLabel>Start a chat</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((a) => (
            <button
              key={a.id}
              onClick={() => openThread(a.id)}
              className="pressable flex items-center gap-2 py-1.5 pl-1.5 pr-2.5"
              style={{ background: "var(--bg)", borderRadius: "999px" }}
            >
              <Avatar account={a} size={26} />
              <span className="text-xs font-bold">@{a.handle}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- one thread ----

function Thread() {
  const me = useAccountStore((s) => s.me);
  const peerId = useMessagesStore((s) => s.peerId);
  const thread = useMessagesStore((s) => s.thread);
  const typing = useMessagesStore((s) => s.typing);
  const back = useMessagesStore((s) => s.back);
  const send = useMessagesStore((s) => s.send);
  const shareGame = useUiStore((s) => s.shareGame);
  const clearShare = useUiStore((s) => s.clearShare);
  const closeSheet = useUiStore((s) => s.closeSheet);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<GameAttachment | null>(null);
  const [picking, setPicking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const peer = getAccount(peerId);

  // a game shared from the feed arrives pre-attached
  useEffect(() => {
    if (shareGame) {
      setAttachment(shareGame);
      clearShare();
    }
  }, [shareGame, clearShare]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length, typing]);

  const submit = () => {
    if (!text.trim() && !attachment) return;
    send({ text, game: attachment ?? undefined });
    setText("");
    setAttachment(null);
  };

  const playNext = (slug: string) => {
    useFeedStore.getState().insertNext(slug);
    closeSheet();
  };

  const myGames = me ? gamesByAuthor(me.id) : [];

  return (
    <div>
      <button
        onClick={back}
        className="pressable mb-2 flex items-center gap-1 text-xs font-bold"
        style={{ color: "var(--ink-dim)" }}
      >
        <ChevronLeftIcon size={14} /> All messages
      </button>

      {peer?.kind === "bot" && (
        <p className="mb-2 text-[11px]" style={{ color: "var(--ink-dim)" }}>
          @{peer.handle} is a bot account — the replies are generated, not a
          person typing.
        </p>
      )}

      <div className="flex max-h-[42dvh] flex-col gap-2 overflow-y-auto py-1">
        {(thread?.messages ?? []).map((m) => {
          const mine = m.from === me?.id;
          return (
            <div
              key={m.id}
              className="flex"
              style={{ justifyContent: mine ? "flex-end" : "flex-start" }}
            >
              <div
                className="max-w-[80%] px-3 py-2"
                style={{
                  background: mine ? "var(--accent)" : "var(--bg)",
                  color: mine ? "#fff" : "var(--ink)",
                  borderRadius: "var(--radius)",
                }}
              >
                {m.text && <div className="text-sm leading-snug">{m.text}</div>}
                {m.game && (
                  <button
                    onClick={() => playNext(m.game!.slug)}
                    className="pressable mt-1.5 flex w-full items-center gap-2 px-2 py-2 text-left"
                    style={{
                      background: mine ? "rgba(255,255,255,.18)" : "var(--surface)",
                      borderRadius: "calc(var(--radius) * 0.7)",
                    }}
                  >
                    <span
                      className="inline-block h-6 w-6 shrink-0"
                      style={{ background: m.game.accent, borderRadius: "8px" }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-extrabold">
                        {m.game.title}
                      </span>
                      <span className="block truncate text-[10px] opacity-80">
                        {m.game.rule ?? "tap to queue it up"}
                      </span>
                    </span>
                    <span className="ml-auto text-[10px] font-extrabold uppercase tracking-wide">
                      Play
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="text-xs font-semibold" style={{ color: "var(--ink-dim)" }}>
            @{peer?.handle} is typing…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {attachment && (
        <div
          className="mt-2 flex items-center gap-2 px-3 py-2"
          style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
        >
          <span
            className="inline-block h-5 w-5"
            style={{ background: attachment.accent, borderRadius: "6px" }}
          />
          <span className="flex-1 truncate text-xs font-bold">
            Attaching {attachment.title}
          </span>
          <button
            onClick={() => setAttachment(null)}
            className="pressable text-xs font-bold"
            style={{ color: "var(--ink-dim)" }}
          >
            remove
          </button>
        </div>
      )}

      {picking && (
        <div className="mt-2 flex flex-col gap-1.5">
          {myGames.length === 0 && (
            <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
              You haven&apos;t published a game yet — the studio is one tap away.
            </span>
          )}
          {myGames.map((g) => (
            <button
              key={g.slug}
              onClick={() => {
                setAttachment({
                  slug: g.slug,
                  title: g.title,
                  accent: g.accent,
                  rule: g.rule,
                });
                setPicking(false);
              }}
              className="pressable flex items-center gap-2 px-3 py-2 text-left"
              style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
            >
              <span
                className="inline-block h-4 w-4"
                style={{ background: g.accent, borderRadius: "5px" }}
              />
              <span className="truncate text-xs font-bold">{g.title}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => setPicking((p) => !p)}
          aria-label="Attach a game"
          className="pressable flex h-10 w-10 shrink-0 items-center justify-center"
          style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
        >
          <GamepadIcon size={18} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="message"
          className="w-full px-3 py-2.5 text-sm outline-none"
          style={{ background: "var(--bg)", color: "var(--ink)", borderRadius: "var(--radius)" }}
        />
        <button
          onClick={submit}
          disabled={!text.trim() && !attachment}
          aria-label="Send"
          className="pressable flex h-10 w-10 shrink-0 items-center justify-center disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#fff", borderRadius: "var(--radius)" }}
        >
          <SendIcon size={18} />
        </button>
      </div>
    </div>
  );
}

/** The attachment payload for a card in the feed. */
export function attachmentFor(slug: string): GameAttachment {
  const meta = getMeta(slug);
  return {
    slug,
    title: meta.title,
    accent: meta.palette.hero,
    rule: meta.rule,
  };
}
