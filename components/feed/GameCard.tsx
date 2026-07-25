"use client";

import { useEffect, useRef, useState } from "react";
import { GameHost, type RunResult } from "@/components/feed/GameHost";
import {
  HeartIcon,
  SendIcon,
  SlidersIcon,
  DropletIcon,
  TrophyIcon,
} from "@/components/ui/icons";
import { getMeta } from "@/games/registry";
import { haptic } from "@/lib/haptics";
import { getBest, getHandle, likedSlugs, toggleLike } from "@/lib/storage";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useFeedStore, type FeedCard as FeedCardData } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

interface Props {
  card: FeedCardData;
  index: number;
}

export function GameCard({ card, index }: Props) {
  const activeIndex = useFeedStore((s) => s.activeIndex);
  const active = index === activeIndex;
  const mounted = Math.abs(index - activeIndex) <= 1;
  const meta = getMeta(card.slug);
  const openSheet = useUiStore((s) => s.openSheet);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [liked, setLiked] = useState(false);
  // "guest" until mount: localStorage doesn't exist during the server render.
  const [localHandle, setLocalHandle] = useState("guest");
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);

  const askToSave = useAuthStore((s) => s.askToSave);
  const dismissPrompt = useAuthStore((s) => s.dismissPrompt);
  const savePrompt = useAuthStore((s) => s.prompt);
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  const playerHandle = useAuthStore((s) => s.player?.handle);

  const playingUid = useUiStore((s) => s.playingUid);
  const enterPlay = useUiStore((s) => s.enterPlay);
  const exitPlay = useUiStore((s) => s.exitPlay);
  const playing = playingUid === card.uid;
  const lastTapRef = useRef(0);
  const edgeRef = useRef<{ x: number; y: number } | null>(null);

  // double-tap the preview to take over
  const onPreviewTap = (e: React.PointerEvent) => {
    const now = e.timeStamp;
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      enterPlay(card.uid);
      haptic("hit");
    } else {
      lastTapRef.current = now;
    }
  };

  // a drag on the bottom strip — in any direction — hands control back
  const onEdgeDown = (e: React.PointerEvent) => {
    edgeRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onEdgeMove = (e: React.PointerEvent) => {
    const start = edgeRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > 34) {
      edgeRef.current = null;
      exitPlay();
      haptic("light");
    }
  };
  const onEdgeUp = () => {
    edgeRef.current = null;
  };

  // leaving the card always drops you back to browsing
  useEffect(() => {
    if (!active && playing) exitPlay();
  }, [active, playing, exitPlay]);

  useEffect(() => {
    if (mounted) {
      setBest(getBest(card.slug));
      setLiked(likedSlugs().has(card.slug));
      setLocalHandle(getHandle());
    }
  }, [mounted, card.slug]);

  useEffect(() => {
    return () => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
    };
  }, []);

  const handleRunEnd = (r: RunResult) => {
    setResult(r);
    if (r.isBest) setBest(r.score);
    // Guest play comes first: the only moment we ever mention an account is
    // one where the player has just earned something worth keeping.
    if (r.score > 0 && (r.isBest || r.topTen)) askToSave();
    // A toast carrying a call to action has to outlast a glance.
    const asking = useAuthStore.getState().prompt;
    if (resultTimer.current) clearTimeout(resultTimer.current);
    resultTimer.current = setTimeout(() => setResult(null), asking ? 6500 : 2800);
  };

  // A like is a visible, editable reason in the algorithm's memory list.
  const like = () => {
    const nowLiked = toggleLike(card.slug);
    setLiked(nowLiked);
    const algo = useAlgorithmStore.getState();
    if (nowLiked) algo.rememberLike(card.slug, meta.title, meta.tags);
    else algo.forgetLike(card.slug);
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `I scored ${best || score} on ${meta.title} — Tip Tap Games`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Tip Tap Games", text, url });
        return;
      }
    } catch {
      // fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing to do
    }
  };

  return (
    <section
      data-index={index}
      className="relative h-dvh w-full snap-start snap-always overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {mounted ? (
        <GameHost
          slug={card.slug}
          active={active}
          interactive={playing}
          onScore={setScore}
          onRunEnd={handleRunEnd}
        />
      ) : (
        <div className="h-full w-full" />
      )}

      {/* Browsing: the canvas is inert and this layer catches the double-tap
          that hands control over. Swipes pass straight through to the feed. */}
      {!playing && (
        <div
          className="absolute inset-0 z-10"
          onPointerDown={onPreviewTap}
          style={{ touchAction: "pan-y" }}
        />
      )}

      {/* Playing: the strip along the bottom — where you'd swipe for the next
          card anyway — swipes you back out to the feed. */}
      {playing && (
        <div
          // above the caption and rail, or they swallow the swipe
          className="absolute inset-x-0 bottom-0 z-40 h-24"
          onPointerDown={onEdgeDown}
          onPointerMove={onEdgeMove}
          onPointerUp={onEdgeUp}
          onPointerCancel={onEdgeUp}
          style={{ touchAction: "none" }}
        >
          <div className="pointer-events-none flex h-full flex-col items-center justify-end gap-1 pb-3">
            <div
              className="h-1 w-10 rounded-full"
              style={{ background: "rgba(255,255,255,.7)" }}
            />
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "rgba(255,255,255,.8)" }}
            >
              swipe here to leave
            </span>
          </div>
        </div>
      )}

      {/* browsing: "this is a demo, tap in to actually play" */}
      {!playing && active && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1">
          <div
            className="anim-breathe px-4 py-2 text-sm font-extrabold"
            style={{
              background: "rgba(12,18,28,.72)",
              color: "#fff",
              borderRadius: "999px",
              fontFamily: "var(--font-display)",
            }}
          >
            Double tap to play
          </div>
          <span
            className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "rgba(255,255,255,.8)" }}
          >
            demo running
          </span>
        </div>
      )}

      {/* Reels-style scrims: the chrome is white on gradient, never themed,
          so it stays legible over any game's own artwork. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-40"
        style={{ background: "linear-gradient(rgba(0,0,0,.5), transparent)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-64"
        style={{ background: "linear-gradient(transparent, rgba(0,0,0,.62))" }}
      />

      {/* score HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center pt-[calc(env(safe-area-inset-top)+14px)]">
        <div
          className="text-4xl font-extrabold tabular-nums"
          style={{
            fontFamily: "var(--font-display)",
            color: "#fff",
            textShadow: "0 2px 10px rgba(0,0,0,.5)",
          }}
        >
          <span key={score} className="anim-pop tabular-nums">
            {score}
          </span>
          <span className="ml-1 text-base font-semibold" style={{ color: "rgba(255,255,255,.8)" }}>
            {meta.scoreUnit}
          </span>
        </div>
        <div className="text-xs font-semibold" style={{ color: "rgba(255,255,255,.78)" }}>
          {playing ? `best ${Math.max(best, score)}` : "demo score"}
        </div>
      </div>

      {/* caption — Reels/TikTok style: title, era, expandable history */}
      <div
        className="absolute bottom-0 left-0 z-30 max-w-[76%] p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        style={{ touchAction: "pan-y" }}
      >
        <button
          onClick={() => setExpanded((e) => !e)}
          className="block text-left"
        >
          <div className="flex items-baseline gap-2">
            <span
              className="text-xl font-extrabold leading-tight"
              style={{ fontFamily: "var(--font-display)", color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,.5)" }}
            >
              {meta.title}
            </span>
            <span
              className="px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                background: "rgba(255,255,255,.22)",
                color: "#fff",
                borderRadius: "6px",
              }}
            >
              est. {meta.year}
            </span>
          </div>
          <div className="mt-1 text-sm leading-snug" style={{ color: "#fff" }}>
            {meta.rule}
          </div>
          {expanded ? (
            <div className="mt-1.5 text-[13px] leading-snug" style={{ color: "rgba(255,255,255,.82)" }}>
              {meta.description}
              <span className="mt-1 block">{meta.history}</span>
              <span className="mt-0.5 block font-semibold" style={{ color: "#fff" }}>
                less
              </span>
            </div>
          ) : (
            <div className="mt-0.5 text-[13px]" style={{ color: "rgba(255,255,255,.82)" }}>
              {meta.description.slice(0, 46)}
              <span className="font-semibold" style={{ color: "#fff" }}>
                {" "}
                ... more
              </span>
            </div>
          )}
        </button>

      </div>

      {/* right rail — symbolic line icons, Instagram spacing */}
      <div
        className="absolute bottom-28 right-2.5 z-30 flex flex-col items-center gap-5"
        style={{ touchAction: "pan-y", color: "#fff", filter: "drop-shadow(0 2px 8px rgba(0,0,0,.5))" }}
      >
        <RailButton
          label={liked ? "Liked" : "Like"}
          onClick={like}
          tint={liked ? "var(--danger)" : undefined}
        >
          <HeartIcon size={29} filled={liked} />
        </RailButton>
        <RailButton label="Ranks" onClick={() => openSheet("leaderboard")}>
          <TrophyIcon size={26} />
        </RailButton>
        <RailButton label="Tune" onClick={() => openSheet("algo")}>
          <SlidersIcon size={26} />
        </RailButton>
        <RailButton label="Theme" onClick={() => openSheet("theme")}>
          <DropletIcon size={26} />
        </RailButton>
        <RailButton label={copied ? "Copied" : "Share"} onClick={share}>
          <SendIcon size={26} />
        </RailButton>
        <button
          onClick={() => openSheet("account")}
          aria-label={signedIn ? "Your account" : "Save your progress"}
          className="pressable text-[10px] font-semibold"
          style={{ color: "rgba(255,255,255,.8)" }}
        >
          @{playerHandle ?? localHandle}
          {!signedIn && (
            <span className="ml-1 font-bold" style={{ color: "var(--accent)" }}>
              save
            </span>
          )}
        </button>
      </div>

      {/* run result toast */}
      {result && (
        <div
          className="anim-toast absolute inset-x-0 top-[18%] z-30 mx-auto w-fit px-5 py-3 text-center"
          style={{
            background: "rgba(12,18,28,.85)",
            borderRadius: "var(--radius)",
            fontFamily: "var(--font-body)",
          }}
        >
          <div className="text-sm font-bold" style={{ color: "#fff" }}>
            {result.topTen
              ? `#${result.rank} on ${meta.title}!`
              : `You beat ${result.percentile}% of players`}
          </div>
          {result.isBest && result.score > 0 && (
            <div className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
              new personal best · {result.score} {meta.scoreUnit}
            </div>
          )}
          {savePrompt && (
            <button
              onClick={() => {
                dismissPrompt();
                openSheet("account");
              }}
              className="pressable mt-2 w-full px-3 py-1.5 text-xs font-extrabold"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
                borderRadius: "var(--radius)",
              }}
            >
              Keep this score — sign in
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function RailButton({
  label,
  onClick,
  tint,
  children,
}: {
  label: string;
  onClick: () => void;
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="pressable flex flex-col items-center gap-1"
      aria-label={label}
      style={{ color: tint ?? "inherit" }}
    >
      {children}
      <span
        className="text-[10px] font-semibold"
        style={{ color: "#fff" }}
      >
        {label}
      </span>
    </button>
  );
}
