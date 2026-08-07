"use client";

import { useEffect, useRef, useState } from "react";
import { GameHost, type RunResult } from "@/components/feed/GameHost";
import { DeathScreen } from "@/components/feed/DeathScreen";
import { RailButton } from "@/components/feed/RailButton";
import { SoundRail } from "@/components/feed/SoundRail";
import { goToCard, useFinePointer } from "@/components/feed/nav";
import {
  HeartIcon,
  SendIcon,
  SlidersIcon,
  DropletIcon,
  GearIcon,
  GridIcon,
  MoreIcon,
  SearchIcon,
  SoundOffIcon,
  SoundOnIcon,
  TrophyIcon,
} from "@/components/ui/icons";
import { getMeta } from "@/games/registry";
import type { FullGameMeta } from "@/games/types";
import { haptic } from "@/lib/haptics";
import { getBest, getHandle, likedSlugs, toggleLike } from "@/lib/storage";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useMusicStore } from "@/store/useMusicStore";
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
  const fine = useFinePointer();

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [liked, setLiked] = useState(false);
  // "guest" until mount: localStorage doesn't exist during the server render.
  const [localHandle, setLocalHandle] = useState("guest");
  const [expanded, setExpanded] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [copied, setCopied] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const musicOn = useMusicStore((s) => s.enabled);
  const musicUnlocked = useMusicStore((s) => s.unlocked);
  const toggleMusic = useMusicStore((s) => s.toggle);
  const track = useMusicStore((s) => s.track);
  const soundLive = musicOn && musicUnlocked && track?.slug === card.slug;

  const askToSave = useAuthStore((s) => s.askToSave);
  const dismissPrompt = useAuthStore((s) => s.dismissPrompt);
  const savePrompt = useAuthStore((s) => s.prompt);
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  const playerHandle = useAuthStore((s) => s.player?.handle);

  const playingUid = useUiStore((s) => s.playingUid);
  const enterPlay = useUiStore((s) => s.enterPlay);
  const exitPlay = useUiStore((s) => s.exitPlay);
  const playing = playingUid === card.uid;
  const swipeRef = useRef<Swipe | null>(null);

  // Scroll a card into view and you're playing immediately — no demo, no tap.
  // The reflex has to fire the moment the game lands on screen.
  useEffect(() => {
    if (active) enterPlay(card.uid);
  }, [active, card.uid, enterPlay]);

  // If you swiped out but stayed on the card, a single tap drops you back in.
  const resumePlay = () => {
    enterPlay(card.uid);
    haptic("hit");
  };

  // Hand control back and land on the neighbouring card in one motion —
  // downwards for the next game, upwards for the one you just left.
  // The canvas goes pointer-events:none the instant control is handed back, so
  // a game caught mid-drag would never see the end of the gesture and would
  // sit on a half-drawn aim line until it was remounted. Cancel it first.
  const leaveTo = (delta: number) => {
    haptic("light");
    const canvas = sectionRef.current?.querySelector("canvas");
    if (canvas) {
      try {
        canvas.dispatchEvent(
          new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 })
        );
      } catch {
        // a browser without the PointerEvent constructor has nothing to cancel
      }
    }
    goToCard(sectionRef.current?.parentElement, index + delta);
  };

  // While playing, the game owns the surface — so the card watches the same
  // pointer stream in the capture phase and claims anything that reads as a
  // vertical flick. No game control is an upward drag, so the two never
  // compete: taps, holds and sideways drags all fall through untouched.
  // Touch and pen only: on desktop the wheel is the one way through the feed,
  // so a mouse drag stays with the game it started on.
  const onPlayDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    swipeRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: e.timeStamp,
    };
  };
  const onPlayMove = (e: React.PointerEvent) => {
    const s = swipeRef.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const dir = detectSwipe(dx, dy, e.timeStamp - s.t);
    if (dir === "none") return;
    swipeRef.current = null;
    if (dir === "sideways") return; // that gesture belongs to the game
    leaveTo(dir === "up" ? 1 : -1);
  };
  const onPlayUp = () => {
    swipeRef.current = null;
  };

  // leaving the card always drops you back to browsing
  useEffect(() => {
    if (!active && playing) exitPlay();
  }, [active, playing, exitPlay]);

  // The compact menu belongs only to the live card. Never leave an invisible
  // overlay hanging around after a swipe, pause, or game-over transition.
  useEffect(() => {
    if (!active || !playing || result) setControlsOpen(false);
  }, [active, playing, result]);

  useEffect(() => {
    if (mounted) {
      setBest(getBest(card.slug));
      setLiked(likedSlugs().has(card.slug));
      setLocalHandle(getHandle());
    }
  }, [mounted, card.slug]);

  // the death screen owns the screen until the player acts, so leaving play —
  // by button or by swiping out — always tears it down.
  useEffect(() => {
    if (!playing) setResult(null);
  }, [playing]);

  const handleRunEnd = (r: RunResult) => {
    setResult(r);
    if (r.isBest) setBest(r.score);
    // Guest play comes first: the only moment we ever mention an account is
    // one where the player has just earned something worth keeping.
    if (r.score > 0 && (r.isBest || r.topTen)) askToSave();
    haptic(r.isBest ? "hit" : "fail");
  };

  // "Play again" restarts in place: every game treats a tap on a dead board as
  // "go again", so we hand the frozen canvas exactly that.
  const playAgain = () => {
    setResult(null);
    const canvas = sectionRef.current?.querySelector("canvas");
    if (!canvas) return;
    haptic("light");
    try {
      canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    } catch {
      canvas.dispatchEvent(new Event("pointerdown"));
    }
  };

  const leaveToFeed = () => {
    setResult(null);
    exitPlay();
    haptic("light");
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
    setControlsOpen(false);
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

  const openFromControls = (
    id: "leaderboard" | "algo" | "theme" | "games" | "search" | "settings" | "account"
  ) => {
    setControlsOpen(false);
    openSheet(id);
  };

  // A card is never dropped from the list once it has been shown, so by the
  // hundredth swipe the feed holds a hundred sections. Off-screen ones are
  // the poster and nothing else: no rail, no caption, no HUD, no listeners.
  if (!mounted) {
    return (
      <section
        ref={sectionRef}
        data-index={index}
        data-uid={card.uid}
        className="relative h-[var(--app-h)] w-full snap-start snap-always overflow-hidden"
        style={{ background: "var(--bg)" }}
      >
        <CardPoster meta={meta} />
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      data-index={index}
      data-uid={card.uid}
      className="relative h-[var(--app-h)] w-full snap-start snap-always overflow-hidden"
      style={{ background: "var(--bg)" }}
      onPointerDownCapture={playing ? onPlayDown : undefined}
      onPointerMoveCapture={playing ? onPlayMove : undefined}
      onPointerUpCapture={playing ? onPlayUp : undefined}
      onPointerCancelCapture={playing ? onPlayUp : undefined}
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
        <CardPoster meta={meta} />
      )}

      {/* Browsing: the canvas is inert and a tap hands control back over.
          Swipes pass straight through to the feed. */}
      {!playing && (
        <div
          className="absolute inset-0 z-10"
          onPointerDown={resumePlay}
          style={{ touchAction: "pan-y" }}
        />
      )}

      {/* Playing: a hint only. The gesture itself is caught on the whole card,
          so there is no strip to find and nothing here to swallow a tap. */}
      {playing && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-center gap-1 pb-[calc(var(--safe-bottom)+12px)]">
          <div
            className="h-1 w-10 rounded-full"
            style={{ background: "rgba(255,255,255,.7)" }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "rgba(255,255,255,.8)" }}
          >
            {fine
              ? "scroll or ↑ ↓ to move · esc to stop"
              : "swipe up or down to move on"}
          </span>
        </div>
      )}

      {/* paused after swiping out but staying on the card — one tap resumes */}
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
            {fine ? "Click to play" : "Tap to play"}
          </div>
          <span
            className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "rgba(255,255,255,.8)" }}
          >
            paused
          </span>
        </div>
      )}

      {/* The heavy scrims are browsing chrome. Once play starts the artwork is
          left untouched; the score's text shadow is enough to keep it legible. */}
      {!playing && (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-40"
            style={{ background: "linear-gradient(rgba(0,0,0,.5), transparent)" }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-64"
            style={{ background: "linear-gradient(transparent, rgba(0,0,0,.62))" }}
          />
        </>
      )}

      {/* score HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center pt-[calc(var(--safe-top)+14px)]">
        <div
          className="w-[46%] truncate text-center text-4xl font-extrabold tabular-nums"
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
        <div
          className="w-[46%] truncate text-center text-xs font-semibold"
          style={{ color: "rgba(255,255,255,.78)" }}
        >
          {playing ? `best ${Math.max(best, score)}` : "paused"}
        </div>
      </div>

      {/* caption — Reels/TikTok style: title, era, expandable history */}
      {!playing && (
        <div
          className="absolute bottom-0 left-0 z-30 max-w-[76%] p-4 pb-[calc(var(--safe-bottom)+16px)]"
          style={{ touchAction: "pan-y" }}
        >
        {/* now playing: the track is generated, so it gets a name too */}
        {active && (
          <button
            onClick={toggleMusic}
            className="pressable mb-2 flex min-h-11 max-w-full items-center gap-1.5 px-3 py-1 text-[11px] font-bold"
            style={{
              background: "rgba(12,18,28,.6)",
              color: "#fff",
              borderRadius: "999px",
              fontFamily: "var(--font-body)",
            }}
          >
            {soundLive ? <SoundOnIcon size={13} /> : <SoundOffIcon size={13} />}
            {soundLive && track ? (
              <>
                <EqBars />
                <span className="min-w-0 truncate">
                  {track.name} · {track.styleLabel} · {track.bpm} BPM
                </span>
              </>
            ) : (
              <span>{musicOn ? "Tap for sound" : "Sound off"}</span>
            )}
          </button>
        )}

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
      )}

      {/* Browsing keeps the descriptive rail. During play it collapses to one
          small button so it cannot reserve or intercept a strip of canvas. */}
      {!playing && (
        <div
          className="no-scrollbar absolute bottom-[calc(var(--safe-bottom)+112px)] right-2.5 z-30 flex max-h-[calc(var(--app-h)-var(--safe-top)-var(--safe-bottom)-160px)] flex-col items-center gap-4 overflow-y-auto"
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
        <SoundRail />
        <RailButton label={copied ? "Copied" : "Share"} onClick={share}>
          <SendIcon size={26} />
        </RailButton>
        <button
          onClick={() => openSheet("account")}
          aria-label={signedIn ? "Your account" : "Save your progress"}
          className="pressable flex min-h-11 items-center justify-center px-2 text-[10px] font-semibold"
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
      )}

      {playing && !result && (
        <>
          {controlsOpen && (
            <button
              aria-label="Close game controls"
              className="absolute inset-0 z-[31] cursor-default"
              onClick={() => setControlsOpen(false)}
            />
          )}
          <div
            className="absolute right-3 z-40"
            style={{ bottom: "calc(var(--safe-bottom) + 58px)" }}
          >
            <div
              aria-hidden={!controlsOpen}
              className={`absolute bottom-12 right-0 grid w-[228px] grid-cols-3 gap-x-2 gap-y-4 rounded-[22px] border border-white/10 px-3 py-4 text-white shadow-2xl backdrop-blur-xl transition duration-200 ${
                controlsOpen
                  ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none translate-y-2 scale-95 opacity-0"
              }`}
              style={{
                background: "rgba(9,14,23,.9)",
                transformOrigin: "bottom right",
              }}
            >
              <RailButton
                label={liked ? "Liked" : "Like"}
                onClick={() => {
                  like();
                  setControlsOpen(false);
                }}
                tint={liked ? "var(--danger)" : undefined}
              >
                <HeartIcon size={25} filled={liked} />
              </RailButton>
              <RailButton label="Ranks" onClick={() => openFromControls("leaderboard")}>
                <TrophyIcon size={23} />
              </RailButton>
              <RailButton label="Tune" onClick={() => openFromControls("algo")}>
                <SlidersIcon size={23} />
              </RailButton>
              <RailButton label="Theme" onClick={() => openFromControls("theme")}>
                <DropletIcon size={23} />
              </RailButton>
              <SoundRail />
              <RailButton label={copied ? "Copied" : "Share"} onClick={share}>
                <SendIcon size={23} />
              </RailButton>
              <RailButton label="Games" onClick={() => openFromControls("games")}>
                <GridIcon size={23} />
              </RailButton>
              <RailButton label="Search" onClick={() => openFromControls("search")}>
                <SearchIcon size={23} />
              </RailButton>
              <RailButton label="Settings" onClick={() => openFromControls("settings")}>
                <GearIcon size={23} />
              </RailButton>
              <button
                onClick={() => openFromControls("account")}
                aria-label={signedIn ? "Your account" : "Save your progress"}
                className="pressable col-span-3 -mt-1 flex min-h-11 items-center justify-center text-[10px] font-semibold"
                style={{ color: "rgba(255,255,255,.76)" }}
              >
                @{playerHandle ?? localHandle}
                {!signedIn && (
                  <span className="ml-1 font-bold" style={{ color: "var(--accent)" }}>
                    save
                  </span>
                )}
              </button>
            </div>

            <button
              onClick={() => setControlsOpen((open) => !open)}
              aria-label={controlsOpen ? "Close game controls" : "Open game controls"}
              aria-expanded={controlsOpen}
              className="pressable flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-white shadow-lg backdrop-blur-md"
              style={{
                background: controlsOpen
                  ? "rgba(12,18,28,.92)"
                  : "rgba(12,18,28,.58)",
                filter: "drop-shadow(0 2px 8px rgba(0,0,0,.45))",
              }}
            >
              <MoreIcon size={23} />
            </button>
          </div>
        </>
      )}

      {/* the iOS-style game-over sheet — only during real play, never the demo */}
      {playing && result && (
        <DeathScreen
          result={result}
          meta={meta}
          best={best}
          onPlayAgain={playAgain}
          onLeave={leaveToFeed}
          onSignIn={
            savePrompt
              ? () => {
                  dismissPrompt();
                  setResult(null);
                  openSheet("account");
                }
              : undefined
          }
        />
      )}
    </section>
  );
}

/**
 * Stands in for a card whose game isn't mounted. Only the active card and its
 * two neighbours run a game, so scrolling several cards at once — forwards, or
 * back through games you've already played — would otherwise fly over empty
 * rectangles. The poster wears the game's own palette, so the card still reads
 * as itself the moment it passes.
 */
function CardPoster({ meta }: { meta: FullGameMeta }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{
        background: `radial-gradient(130% 90% at 50% 32%, ${meta.palette.deep}, var(--bg))`,
      }}
    >
      {/* the chrome stays white on a scrim, never themed, so it reads over a
          pale palette as well as a dark one */}
      <div
        className="mx-8 flex max-w-[70%] flex-col items-center px-5 py-4 text-center"
        style={{ background: "rgba(12,18,28,.72)", borderRadius: "var(--radius)" }}
      >
        <span
          className="mb-2 block h-1 w-8 rounded-full"
          style={{ background: meta.palette.glow }}
        />
        <div
          className="text-2xl font-extrabold leading-tight"
          style={{ fontFamily: "var(--font-display)", color: "#fff" }}
        >
          {meta.title}
        </div>
        <div
          className="mt-1.5 text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "rgba(255,255,255,.72)" }}
        >
          {meta.rule}
        </div>
      </div>
    </div>
  );
}

interface Swipe {
  id: number;
  x: number;
  y: number;
  t: number;
}

// Deliberately cheap to satisfy: a flick of ~a finger's width is enough, and a
// slow drag still counts once it's clearly gone somewhere. The verticality
// check is what keeps it off the games — a sideways drag bails out for good the
// moment it commits, so aiming and steering never trip an exit.
const FLICK_PX = 40; // quick flick
const FLICK_MS = 550;
const DRAG_PX = 90; // unhurried drag
const AXIS_RATIO = 1.2;

function detectSwipe(
  dx: number,
  dy: number,
  dt: number
): "up" | "down" | "sideways" | "none" {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > 24 && ax > ay * AXIS_RATIO) return "sideways";
  if (ay < ax * AXIS_RATIO) return "none";
  if (ay >= DRAG_PX || (ay >= FLICK_PX && dt <= FLICK_MS))
    return dy < 0 ? "up" : "down";
  return "none";
}

/** Three bars bouncing out of phase. Purely decorative. */
function EqBars() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden>
      {[0, 190, 95].map((delay, i) => (
        <span
          key={i}
          className="anim-eq block w-[2px] rounded-sm"
          style={{
            height: "100%",
            background: "currentColor",
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </span>
  );
}
