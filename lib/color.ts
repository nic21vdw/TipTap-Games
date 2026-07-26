// Colour maths shared by the game generator and the custom-game engine.
// One implementation, so a generated accent is always a colour the browser
// (and canvas) will actually accept.
import type { GamePalette } from "@/games/types";

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/** h in degrees (any sign), s and l in 0..100. Always returns `#rrggbb`. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const lum = clamp(l, 0, 100) / 100;
  const a = sat * Math.min(lum, 1 - lum);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const v = lum - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Accepts `#abc` or `#aabbcc`, with or without the hash. Null if unusable. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const n = parseInt(norm.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return { h: ((h % 360) + 360) % 360, s: s * 100, l: l * 100 };
}

/**
 * A generated game only ships an accent, but games draw from a five-colour
 * palette. Spin the whole set out of the accent's hue so a custom card
 * genuinely looks like its own game instead of a renamed base engine — while
 * keeping the roles readable: the foe never reads as the hero, and `deep`
 * stays dark enough to sit behind everything.
 */
export function paletteFromAccent(accent: string): GamePalette {
  const hsl = hexToHsl(accent) ?? { h: 205, s: 85, l: 55 };
  const h = hsl.h;
  const s = clamp(hsl.s, 55, 92);
  return {
    hero: hslToHex(h, s, clamp(hsl.l, 52, 68)),
    foe: hslToHex(h + 150, clamp(s + 5, 60, 92), 58),
    prize: hslToHex(h + 48, clamp(s + 10, 65, 95), 62),
    // scenery sits in the accent's own hue, just dark and drained, so the
    // world reads as one place rather than a colour clash
    deep: hslToHex(h + 8, clamp(s - 40, 14, 40), 17),
    glow: hslToHex(h + 18, clamp(s - 10, 45, 85), 74),
  };
}
