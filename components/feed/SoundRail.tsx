"use client";

/**
 * The rail's sound button, plus the volume slider that flies out of it.
 *
 * Desktop hovers it open. Touch has no hover, so a press-and-hold opens it
 * instead and a plain tap still mutes — the same split Instagram uses for
 * its own long-press affordances.
 */

import { useEffect, useRef, useState } from "react";
import { RailButton } from "@/components/feed/RailButton";
import { SoundOffIcon, SoundOnIcon } from "@/components/ui/icons";
import { VolumeSlider } from "@/components/ui/VolumeSlider";
import { haptic } from "@/lib/haptics";
import { useMusicStore } from "@/store/useMusicStore";

const HOVER_OUT_MS = 320; // grace period crossing the gap to the slider
const HOLD_MS = 260; // press-and-hold before the slider takes over the tap
const IDLE_MS = 2600; // touch: how long it lingers once you let go

export function SoundRail() {
  const musicOn = useMusicStore((s) => s.enabled);
  const volume = useMusicStore((s) => s.volume);
  const setVolume = useMusicStore((s) => s.setVolume);
  const toggleMusic = useMusicStore((s) => s.toggle);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // a hold has already acted, so the click it becomes must not also mute
  const heldRef = useRef(false);
  const scrubbingRef = useRef(false);

  const clearClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const closeIn = (ms: number) => {
    clearClose();
    closeTimer.current = setTimeout(() => {
      if (!scrubbingRef.current) setOpen(false);
    }, ms);
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  // touch: anything outside puts it away
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onEnter = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    clearClose();
    setOpen(true);
  };

  const onLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    closeIn(HOVER_OUT_MS);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    heldRef.current = false;
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      clearClose();
      setOpen(true);
      haptic("light");
    }, HOLD_MS);
  };

  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (heldRef.current && !scrubbingRef.current) closeIn(IDLE_MS);
  };

  const onClick = () => {
    if (heldRef.current) {
      // the hold already opened the slider; swallow the click it produced
      heldRef.current = false;
      return;
    }
    toggleMusic();
  };

  const onVolume = (v: number) => {
    // reaching for the slider while muted means you want sound back
    if (!musicOn && v > 0) toggleMusic();
    setVolume(v);
  };

  const onScrub = (dragging: boolean) => {
    scrubbingRef.current = dragging;
    if (dragging) clearClose();
    else closeIn(IDLE_MS);
  };

  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onPointerDown={onDown}
      onPointerUp={endHold}
      onPointerCancel={endHold}
    >
      {/* the flyout, and a padded gutter so the hover survives the gap */}
      <div
        data-motion="spring"
        className="absolute top-1/2 right-full z-40 -translate-y-1/2 pr-3 pl-2"
        style={{
          transformOrigin: "right center",
          opacity: open ? 1 : 0,
          transform: open
            ? "translateY(-50%) scale(1)"
            : "translateY(-50%) scale(.55)",
          filter: open ? "none" : "blur(2px)",
          pointerEvents: open ? "auto" : "none",
          transition: open
            ? "opacity 200ms ease, transform 380ms cubic-bezier(.34,1.4,.64,1), filter 200ms ease"
            : "opacity 160ms ease, transform 200ms cubic-bezier(.32,.72,0,1), filter 160ms ease",
        }}
      >
        <VolumeSlider
          value={volume}
          muted={!musicOn}
          onChange={onVolume}
          onScrub={onScrub}
          label="Music volume"
        />
      </div>

      <RailButton
        label={musicOn ? "Sound" : "Muted"}
        onClick={onClick}
        tint={musicOn ? undefined : "rgba(255,255,255,.55)"}
      >
        {musicOn ? <SoundOnIcon size={26} /> : <SoundOffIcon size={26} />}
      </RailButton>
    </div>
  );
}
