"use client";

/**
 * The iOS Control Centre volume slider: a frosted pill that fills from the
 * bottom, swells under your finger, and carries the speaker glyph at its
 * foot in blend-difference so the icon stays legible whether the fill has
 * reached it or not.
 *
 * Grab it anywhere — there is no separate thumb to hit, which is the whole
 * trick that makes the real one feel so easy on a phone.
 */

import { useEffect, useRef, useState } from "react";
import { SoundOffIcon, SoundOnIcon } from "@/components/ui/icons";
import { haptic } from "@/lib/haptics";

interface Props {
  /** 0..1 */
  value: number;
  onChange: (v: number) => void;
  /** Told when a drag starts and ends, so the parent can hold the popover open. */
  onScrub?: (dragging: boolean) => void;
  muted?: boolean;
  height?: number;
  label?: string;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function VolumeSlider({
  value,
  onChange,
  onScrub,
  muted = false,
  height = 150,
  label = "Volume",
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  // last tenth we buzzed on, so the detents tick once each rather than every
  // pointermove event
  const detentRef = useRef(Math.round(value * 10));

  const commit = (v: number) => {
    const next = clamp01(v);
    const detent = Math.round(next * 10);
    if (detent !== detentRef.current) {
      detentRef.current = detent;
      haptic("light");
    }
    onChange(next);
  };

  /** Pointer position to a 0..1 value, bottom of the pill being zero. */
  const valueAt = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return value;
    const r = el.getBoundingClientRect();
    return clamp01(1 - (clientY - r.top) / r.height);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    onScrub?.(true);
    detentRef.current = Math.round(value * 10);
    commit(valueAt(e.clientY));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    e.stopPropagation();
    commit(valueAt(e.clientY));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setDragging(false);
    onScrub?.(false);
  };

  // The feed is a scroll-snap container, so a wheel over the slider would
  // flick to the next game. Non-passive listener: React's onWheel cannot
  // preventDefault.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      commit(value - e.deltaY / 400);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // `commit` closes over `value`, so this re-binds whenever it moves
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.2 : 0.05;
    const by: Record<string, number> = {
      ArrowUp: step,
      ArrowRight: step,
      ArrowDown: -step,
      ArrowLeft: -step,
    };
    if (e.key in by) {
      e.preventDefault();
      commit(value + by[e.key]);
    } else if (e.key === "Home") {
      e.preventDefault();
      commit(0);
    } else if (e.key === "End") {
      e.preventDefault();
      commit(1);
    }
  };

  const pct = clamp01(value) * 100;
  const off = muted || value <= 0.001;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={`${Math.round(pct)}%`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      data-motion="spring"
      className="relative select-none outline-none"
      style={{
        height,
        width: 40,
        // isolate so the glyph's blend mode only sees the slider, not the game
        isolation: "isolate",
        borderRadius: 20,
        overflow: "hidden",
        touchAction: "none",
        cursor: "pointer",
        background: "rgba(20,26,38,.55)",
        backdropFilter: "blur(14px) saturate(1.4)",
        WebkitBackdropFilter: "blur(14px) saturate(1.4)",
        boxShadow:
          "inset 0 0 0 1px rgba(255,255,255,.18), 0 10px 30px rgba(0,0,0,.45)",
        // the whole pill swells while you hold it, exactly like iOS
        transform: dragging ? "scaleX(1.14) scaleY(1.03)" : "none",
        transition: "transform 260ms cubic-bezier(.34,1.4,.64,1)",
      }}
    >
      {/* the fill */}
      <div
        data-motion="spring"
        className="absolute inset-x-0 bottom-0"
        style={{
          height: `${pct}%`,
          background:
            "linear-gradient(to top, rgba(255,255,255,.92), #fff)",
          // no easing mid-drag: the fill must sit under the finger
          transition: dragging
            ? "none"
            : "height 320ms cubic-bezier(.32,.72,0,1)",
        }}
      />

      {/* speaker glyph at the foot, inverting against the fill */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-2.5 flex justify-center"
        style={{ color: "#fff", mixBlendMode: "difference" }}
      >
        {off ? <SoundOffIcon size={17} /> : <SoundOnIcon size={17} />}
      </span>
    </div>
  );
}
