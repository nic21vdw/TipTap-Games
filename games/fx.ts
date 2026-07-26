// The juice layer. Every game gets particles, screen shake, score pops,
// combo meters and living backdrops from here, so "feel" is a shared
// resource instead of something each game re-invents (or skips).
//
// Rules of the house:
// - Nothing here allocates per-frame beyond the particle pool.
// - Colours come in from the caller (theme tokens or the game palette),
//   never hard-coded, so themes keep control of the ground.
// - Everything is time-based (dt seconds), never frame-count based.

import { clamp, rand, roundRect } from "@/games/engine";
import type { GamePalette } from "@/games/types";

// ---------------------------------------------------------------- maths

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Frame-rate independent smoothing: approach `to` by `rate` per second. */
export const approach = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.pow(1 - clamp(rate, 0, 0.999), dt * 60));

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
export const easeInCubic = (t: number) => t * t * t;
export const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t: number) => {
  if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

/** 0..1..0 triangle wave, for breathing highlights. */
export const pulse = (t: number, period = 1) => {
  const p = (t % period) / period;
  return p < 0.5 ? p * 2 : 2 - p * 2;
};

// ---------------------------------------------------------------- colour

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#rrggbb` (or `#rgb`) plus an alpha, as an rgba() string. */
export function hexA(hex: string, a: number): string {
  const m = HEX.exec(hex.trim());
  if (!m) return hex; // already rgba()/named — pass it through untouched
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1)})`;
}

/** Blend two hex colours. `t` 0 = a, 1 = b. */
export function mix(a: string, b: string, t: number): string {
  const pa = HEX.exec(a);
  const pb = HEX.exec(b);
  if (!pa || !pb) return a;
  const na = parseInt(pa[1].length === 3 ? pa[1].replace(/./g, "$&$&") : pa[1], 16);
  const nb = parseInt(pb[1].length === 3 ? pb[1].replace(/./g, "$&$&") : pb[1], 16);
  const f = (sa: number, sb: number) => Math.round(lerp(sa, sb, clamp(t, 0, 1)));
  const r = f((na >> 16) & 255, (nb >> 16) & 255);
  const g = f((na >> 8) & 255, (nb >> 8) & 255);
  const bl = f(na & 255, nb & 255);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

// ---------------------------------------------------------------- glow

/**
 * Draws `body` twice: once as a blurred halo, once clean on top. Costs one
 * extra pass, so keep it for the handful of things that should look lit.
 */
export function glow(
  g: CanvasRenderingContext2D,
  colour: string,
  blur: number,
  body: () => void
) {
  g.save();
  g.shadowColor = colour;
  g.shadowBlur = blur;
  body();
  g.restore();
  body();
}

/** A radial halo behind something bright. Cheaper than a shadow pass. */
export function halo(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colour: string,
  strength = 0.5
) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, hexA(colour, strength));
  grad.addColorStop(0.55, hexA(colour, strength * 0.28));
  grad.addColorStop(1, hexA(colour, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// ---------------------------------------------------------------- particles

type Kind = "dot" | "square" | "spark" | "ring" | "text";

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  colour: string;
  spin: number;
  angle: number;
  grav: number;
  drag: number;
  text: string;
  font: number;
  family: string;
}

export interface BurstOpts {
  /** how many bits of debris (clamped to the pool) */
  count?: number;
  colour?: string | string[];
  /** px/s, randomised ±40% per particle */
  speed?: number;
  /** seconds */
  life?: number;
  size?: number;
  /** px/s², positive pulls down */
  gravity?: number;
  /** restrict to a cone: centre angle in radians */
  angle?: number;
  /** cone half-width in radians (default: full circle) */
  spread?: number;
  kind?: "dot" | "square" | "spark";
}

export interface Fx {
  /** debris explosion */
  burst(x: number, y: number, opts?: BurstOpts): void;
  /** expanding shockwave ring */
  ring(x: number, y: number, colour: string, radius?: number, width?: number): void;
  /** floating score text, e.g. "+3" or "PERFECT" */
  pop(
    x: number,
    y: number,
    text: string,
    colour: string,
    size?: number,
    family?: string
  ): void;
  /** one soft fading dot — call every frame for a motion trail */
  trail(x: number, y: number, colour: string, size?: number, life?: number): void;
  /** camera kick, in px of amplitude */
  shake(mag: number): void;
  /** full-screen colour wash that decays */
  flash(colour: string, amount?: number): void;
  update(dt: number): void;
  /** rings + trails, drawn under the game */
  drawUnder(g: CanvasRenderingContext2D): void;
  /** debris + score pops + the flash wash, drawn over the game */
  drawOver(g: CanvasRenderingContext2D, W: number, H: number): void;
  /** wraps the world draw so the shake actually moves the camera */
  begin(g: CanvasRenderingContext2D): void;
  end(g: CanvasRenderingContext2D): void;
  clear(): void;
  readonly count: number;
}

const POOL = 260;

export function createFx(): Fx {
  const ps: Particle[] = [];
  const under: Particle[] = [];
  let shakeMag = 0;
  let shakeT = 0;
  let sx = 0;
  let sy = 0;
  let flashColour = "";
  let flashAmt = 0;

  const push = (arr: Particle[], p: Particle) => {
    if (arr.length >= POOL) arr.shift();
    arr.push(p);
  };

  const step = (arr: Particle[], dt: number) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) {
        arr.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.angle += p.spin * dt;
    }
  };

  const paint = (g: CanvasRenderingContext2D, arr: Particle[]) => {
    for (const p of arr) {
      const k = clamp(p.life / p.max, 0, 1);
      g.globalAlpha = k;
      g.fillStyle = p.colour;
      if (p.kind === "ring") {
        const r = p.size * (1 + (1 - k) * 3.2);
        g.globalAlpha = k * 0.75;
        g.strokeStyle = p.colour;
        g.lineWidth = Math.max(1, p.font * k);
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.stroke();
      } else if (p.kind === "text") {
        g.globalAlpha = k > 0.8 ? (1 - k) * 5 : Math.min(1, k * 2.2);
        g.textAlign = "center";
        g.font = `900 ${p.font}px ${p.family}`;
        g.fillText(p.text, p.x, p.y);
        g.textAlign = "left";
      } else if (p.kind === "square") {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.angle);
        const s = p.size * (0.4 + k * 0.6);
        g.fillRect(-s / 2, -s / 2, s, s);
        g.restore();
      } else if (p.kind === "spark") {
        const len = p.size * (1 + k * 2.5);
        g.strokeStyle = p.colour;
        g.lineWidth = Math.max(1, p.size * 0.5 * k);
        g.lineCap = "round";
        const a = Math.atan2(p.vy, p.vx);
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
        g.stroke();
      } else {
        g.beginPath();
        g.arc(p.x, p.y, Math.max(0.4, p.size * k), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  };

  const blank = (kind: Kind, x: number, y: number, colour: string): Particle => ({
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    life: 0.5,
    max: 0.5,
    size: 3,
    colour,
    spin: 0,
    angle: 0,
    grav: 0,
    drag: 0.94,
    text: "",
    font: 14,
    family: "system-ui, sans-serif",
  });

  return {
    burst(x, y, opts = {}) {
      const n = Math.min(48, opts.count ?? 14);
      const speed = opts.speed ?? 190;
      const life = opts.life ?? 0.55;
      const size = opts.size ?? 4;
      const cols = opts.colour ?? "#ffffff";
      const spread = opts.spread ?? Math.PI;
      const centre = opts.angle ?? 0;
      const full = opts.angle === undefined;
      for (let i = 0; i < n; i++) {
        const a = full ? rand(0, Math.PI * 2) : centre + rand(-spread, spread);
        const v = speed * rand(0.55, 1.45);
        const p = blank(
          opts.kind ?? "dot",
          x,
          y,
          Array.isArray(cols) ? cols[i % cols.length] : cols
        );
        p.vx = Math.cos(a) * v;
        p.vy = Math.sin(a) * v;
        p.max = p.life = life * rand(0.7, 1.3);
        p.size = size * rand(0.6, 1.4);
        p.grav = opts.gravity ?? 0;
        p.spin = rand(-9, 9);
        p.angle = rand(0, Math.PI * 2);
        push(ps, p);
      }
    },
    ring(x, y, colour, radius = 16, width = 4) {
      const p = blank("ring", x, y, colour);
      p.size = radius;
      p.font = width;
      p.max = p.life = 0.45;
      p.drag = 1;
      push(under, p);
    },
    pop(x, y, text, colour, size = 20, family) {
      const p = blank("text", x, y, colour);
      p.text = text;
      p.font = size;
      if (family) p.family = family;
      p.vy = -78;
      p.drag = 0.9;
      p.max = p.life = 0.8;
      push(ps, p);
    },
    trail(x, y, colour, size = 5, life = 0.32) {
      const p = blank("dot", x, y, colour);
      p.size = size;
      p.max = p.life = life;
      p.drag = 0.9;
      push(under, p);
    },
    shake(mag) {
      shakeMag = Math.min(26, Math.max(shakeMag, mag));
      shakeT = Math.max(shakeT, 0.36);
    },
    flash(colour, amount = 0.4) {
      flashColour = colour;
      flashAmt = Math.max(flashAmt, amount);
    },
    update(dt) {
      step(ps, dt);
      step(under, dt);
      if (shakeT > 0) {
        shakeT = Math.max(0, shakeT - dt);
        const k = shakeT / 0.36;
        const amp = shakeMag * k * k;
        sx = rand(-amp, amp);
        sy = rand(-amp, amp);
        if (shakeT === 0) {
          shakeMag = 0;
          sx = sy = 0;
        }
      }
      if (flashAmt > 0) flashAmt = Math.max(0, flashAmt - dt * 2.6);
    },
    drawUnder(g) {
      paint(g, under);
    },
    drawOver(g, W, H) {
      paint(g, ps);
      if (flashAmt > 0.002) {
        g.fillStyle = hexA(flashColour, flashAmt);
        g.fillRect(-40, -40, W + 80, H + 80);
      }
    },
    begin(g) {
      g.save();
      if (sx || sy) g.translate(sx, sy);
    },
    end(g) {
      g.restore();
    },
    clear() {
      ps.length = 0;
      under.length = 0;
      shakeMag = shakeT = flashAmt = 0;
      sx = sy = 0;
    },
    get count() {
      return ps.length + under.length;
    },
  };
}

// ---------------------------------------------------------------- ink

/** Perceived brightness, 0..1. */
function luma(hex: string): number {
  const m = HEX.exec(hex.trim());
  if (!m) return 0.5;
  const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  const n = parseInt(h, 16);
  return (
    (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) /
    255
  );
}

/**
 * Themes set `ink` to read against the *page* background, but a game paints
 * its own ground out of its palette — so on a light theme the theme's ink
 * would be near-black text on a near-black backdrop. This picks whichever of
 * the theme's two ends actually reads on that ground, so the theme still
 * decides the colour and the player can still see the HUD.
 */
export function groundInk(
  t: { ink: string; inkDim: string; bg: string },
  ground: string
): { main: string; dim: string } {
  const gl = luma(ground);
  if (Math.abs(luma(t.ink) - gl) > 0.35) return { main: t.ink, dim: t.inkDim };
  return { main: t.bg, dim: mix(t.bg, ground, 0.4) };
}

// ---------------------------------------------------------------- safe area

/**
 * Play mode now collapses all feed chrome to a score and one small controls
 * button. Keep interactive elements clear of those two corners without
 * sacrificing a permanent rail-width strip of the actual game.
 */
export function safeBox(W: number, H: number) {
  const top = H * 0.13;
  const bottom = H - 76;
  return {
    top,
    bottom,
    left: 16,
    right: W - 16,
    /** vertical centre of the usable area */
    midY: (top + bottom) / 2,
    height: bottom - top,
  };
}

// ---------------------------------------------------------------- backdrop

export type BackdropKind =
  | "blobs" // slow drifting light, the house default
  | "stars" // parallax starfield
  | "grid" // perspective floor grid
  | "rays" // rotating light shafts
  | "hills" // layered rolling silhouettes
  | "flat"; // gradient only

export interface BackdropOpts {
  kind?: BackdropKind;
  /** 0..1, how loud the decoration is */
  intensity?: number;
  /** scrolls grid/hills/stars; pass a distance that grows with the run */
  scroll?: number;
  /** darkens the frame edges */
  vignette?: number;
}

/**
 * The ground every game stands on. Replaces the two-stop gradient every
 * game used to paste in, and gives each one a layer that actually moves.
 */
export function drawBackdrop(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  pal: GamePalette,
  time: number,
  opts: BackdropOpts = {}
) {
  const kind = opts.kind ?? "blobs";
  const k = opts.intensity ?? 1;
  const scroll = opts.scroll ?? 0;

  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, mix(pal.deep, pal.glow, 0.18));
  sky.addColorStop(0.55, pal.deep);
  sky.addColorStop(1, mix(pal.deep, "#000000", 0.55));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  if (kind === "blobs") {
    for (let i = 0; i < 3; i++) {
      const ph = time * (0.06 + i * 0.03) + i * 2.1;
      const cx = W * (0.5 + Math.cos(ph) * 0.38);
      const cy = H * (0.35 + Math.sin(ph * 1.3) * 0.3);
      const r = Math.max(W, H) * (0.34 + i * 0.1);
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, hexA(i === 1 ? pal.hero : pal.glow, 0.16 * k));
      grad.addColorStop(1, hexA(pal.glow, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
  } else if (kind === "stars") {
    // deterministic positions, three parallax planes, so it never shimmers
    for (let plane = 0; plane < 3; plane++) {
      const depth = 0.25 + plane * 0.45;
      const n = 26 - plane * 6;
      g.fillStyle = hexA(plane === 2 ? pal.glow : "#ffffff", (0.2 + plane * 0.22) * k);
      for (let i = 0; i < n; i++) {
        const seed = i * 97 + plane * 311;
        const x = ((seed * 733) % 1000) / 1000 * W;
        const base = ((seed * 947) % 1000) / 1000 * H;
        const y = (base + scroll * depth + time * 6 * depth) % (H + 8);
        const s = 1 + plane * 0.9;
        g.fillRect(x, y, s, s);
      }
    }
  } else if (kind === "grid") {
    const horizon = H * 0.42;
    const glowGrad = g.createLinearGradient(0, horizon - H * 0.2, 0, horizon);
    glowGrad.addColorStop(0, hexA(pal.glow, 0));
    glowGrad.addColorStop(1, hexA(pal.glow, 0.3 * k));
    g.fillStyle = glowGrad;
    g.fillRect(0, horizon - H * 0.2, W, H * 0.2);
    g.strokeStyle = hexA(pal.glow, 0.34 * k);
    g.lineWidth = 1.2;
    g.beginPath();
    for (let i = -7; i <= 7; i++) {
      g.moveTo(W / 2 + i * W * 0.06, horizon);
      g.lineTo(W / 2 + i * W * 0.62, H);
    }
    // horizontal lines bunch toward the horizon, and crawl with `scroll`
    const off = (scroll * 0.004) % 1;
    for (let i = 0; i < 12; i++) {
      const p = (i + off) / 12;
      const y = horizon + Math.pow(p, 2.4) * (H - horizon);
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();
  } else if (kind === "rays") {
    g.save();
    g.translate(W / 2, H * 0.3);
    g.rotate(time * 0.08);
    for (let i = 0; i < 8; i++) {
      g.rotate(Math.PI / 4);
      g.fillStyle = hexA(pal.glow, 0.055 * k);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.max(W, H) * 1.4, -W * 0.12);
      g.lineTo(Math.max(W, H) * 1.4, W * 0.12);
      g.closePath();
      g.fill();
    }
    g.restore();
  } else if (kind === "hills") {
    for (let layer = 0; layer < 3; layer++) {
      const amp = H * (0.035 + layer * 0.02);
      const baseY = H * (0.55 + layer * 0.14);
      const speed = 0.06 + layer * 0.1;
      g.fillStyle = hexA(mix(pal.deep, layer === 2 ? "#000000" : pal.glow, 0.2 + layer * 0.12), 0.55 * k);
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 12) {
        const y =
          baseY +
          Math.sin((x + scroll * speed * 6) * 0.008 + layer * 1.7 + time * speed) * amp +
          Math.sin(x * 0.021 + layer) * amp * 0.4;
        g.lineTo(x, y);
      }
      g.lineTo(W, H);
      g.closePath();
      g.fill();
    }
  }

  const v = opts.vignette ?? 0.5;
  if (v > 0) vignette(g, W, H, v);
}

/** Darkens the edges so the play area reads as the focal point. */
export function vignette(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  amount = 0.5
) {
  const r = g.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.32,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.78
  );
  r.addColorStop(0, "rgba(0,0,0,0)");
  r.addColorStop(1, `rgba(0,0,0,${clamp(amount, 0, 1) * 0.62})`);
  g.fillStyle = r;
  g.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- combo

export interface Combo {
  /** register a hit; returns the multiplier the hit was worth */
  hit(): number;
  /** drop the chain (a miss) */
  break(): void;
  /** drop the chain and forget the run's best (a new run) */
  clear(): void;
  update(dt: number): void;
  /** the streak length */
  readonly value: number;
  /** 1, 2, 3… — one step per `step` hits */
  readonly mult: number;
  /** 0..1 of the chain window left, for drawing a decay bar */
  readonly fuse: number;
  readonly best: number;
}

/**
 * A streak that pays out. `window` is how long you have to keep it alive
 * (0 = it never times out, so only a miss breaks it).
 */
export function createCombo(step = 4, window = 0): Combo {
  let value = 0;
  let best = 0;
  let t = 0;
  return {
    hit() {
      value += 1;
      best = Math.max(best, value);
      t = window;
      return this.mult;
    },
    break() {
      value = 0;
      t = 0;
    },
    clear() {
      value = 0;
      best = 0;
      t = 0;
    },
    update(dt) {
      if (window > 0 && value > 0) {
        t -= dt;
        if (t <= 0) {
          value = 0;
          t = 0;
        }
      }
    },
    get value() {
      return value;
    },
    get mult() {
      return 1 + Math.floor(value / step);
    },
    get fuse() {
      return window > 0 ? clamp(t / window, 0, 1) : 1;
    },
    get best() {
      return best;
    },
  };
}

/** The x2 / x3 chip. Draws nothing while the multiplier is 1. */
export function drawCombo(
  g: CanvasRenderingContext2D,
  combo: Combo,
  x: number,
  y: number,
  colour: string,
  font: string,
  time: number
) {
  if (combo.mult < 2) return;
  const bump = 1 + pulse(time, 0.6) * 0.06;
  g.save();
  g.translate(x, y);
  g.scale(bump, bump);
  g.textAlign = "center";
  g.font = `900 26px ${font}`;
  g.fillStyle = hexA(colour, 0.25);
  g.fillText(`x${combo.mult}`, 0, 2);
  g.fillStyle = colour;
  g.fillText(`x${combo.mult}`, 0, 0);
  if (combo.fuse < 1) {
    g.fillStyle = hexA(colour, 0.28);
    g.fillRect(-22, 8, 44, 3);
    g.fillStyle = colour;
    g.fillRect(-22, 8, 44 * combo.fuse, 3);
  }
  g.restore();
  g.textAlign = "left";
}

// ---------------------------------------------------------------- HUD bits

/** Lives / misses as a row of pips. */
export function pips(
  g: CanvasRenderingContext2D,
  cx: number,
  y: number,
  total: number,
  filled: number,
  on: string,
  off: string,
  r = 6
) {
  const gap = r * 3.4;
  const start = cx - ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    const live = i < filled;
    g.beginPath();
    g.arc(start + i * gap, y, live ? r : r * 0.72, 0, Math.PI * 2);
    g.fillStyle = live ? on : hexA(off, 0.5);
    g.fill();
  }
}

/** A soft rounded panel — the chrome under HUD text. */
export function panel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  alpha = 0.5
) {
  g.fillStyle = hexA(fill, alpha);
  roundRect(g, x, y, w, h, r);
  g.fill();
}

interface CardTheme {
  ink: string;
  inkDim: string;
  surface: string;
  fontDisplay: string;
  fontBody: string;
}

export interface ResultOpts {
  /** the headline, e.g. "CRASHED" */
  title: string;
  score: number;
  unit?: string;
  best?: number;
  /** a line of flavour: "longest chain x7" */
  sub?: string;
  /** seconds since the run ended — drives the entrance animation */
  age: number;
  accent?: string;
}

/**
 * The shared game-over card, now with the number you actually earned,
 * a spring entrance, and a "new best" callout worth chasing.
 */
export function resultCard(
  g: CanvasRenderingContext2D,
  t: CardTheme,
  W: number,
  H: number,
  o: ResultOpts
) {
  const k = easeOutBack(clamp(o.age / 0.42, 0, 1));
  const bw = Math.min(W * 0.8, 330);
  const bh = o.sub ? 190 : 168;
  const x = W / 2 - bw / 2;
  const y = H * 0.3;
  const accent = o.accent ?? t.ink;
  const isBest = o.best !== undefined && o.score >= o.best && o.score > 0;

  // scrim: pushes the frozen game back so the card owns the frame
  g.fillStyle = `rgba(0,0,0,${0.34 * clamp(o.age / 0.3, 0, 1)})`;
  g.fillRect(0, 0, W, H);

  g.save();
  g.translate(W / 2, y + bh / 2);
  g.scale(k, k);
  g.translate(-W / 2, -(y + bh / 2));

  g.fillStyle = "rgba(0,0,0,.3)";
  roundRect(g, x + 3, y + 7, bw, bh, 24);
  g.fill();
  g.fillStyle = t.surface;
  roundRect(g, x, y, bw, bh, 24);
  g.fill();
  g.strokeStyle = hexA(accent, 0.45);
  g.lineWidth = 1.5;
  roundRect(g, x + 0.75, y + 0.75, bw - 1.5, bh - 1.5, 23.5);
  g.stroke();

  g.textAlign = "center";
  g.fillStyle = t.inkDim;
  g.font = `800 14px ${t.fontBody}`;
  g.fillText(o.title.toUpperCase(), W / 2, y + 32);

  // the number, big enough to feel like a result
  const num = `${Math.round(o.score)}`;
  g.fillStyle = accent;
  g.font = `900 58px ${t.fontDisplay}`;
  g.fillText(num, W / 2, y + 92);
  if (o.unit) {
    const nw = g.measureText(num).width;
    g.font = `700 16px ${t.fontBody}`;
    g.fillStyle = t.inkDim;
    g.textAlign = "left";
    g.fillText(o.unit, W / 2 + nw / 2 + 7, y + 92);
    g.textAlign = "center";
  }

  let line = y + 122;
  if (isBest) {
    g.fillStyle = accent;
    g.font = `800 14px ${t.fontBody}`;
    g.fillText("NEW PERSONAL BEST", W / 2, line);
  } else if (o.best !== undefined && o.best > 0) {
    g.fillStyle = t.inkDim;
    g.font = `600 14px ${t.fontBody}`;
    g.fillText(`best ${o.best}`, W / 2, line);
  }
  if (o.sub) {
    line += 22;
    g.fillStyle = t.inkDim;
    g.font = `600 13px ${t.fontBody}`;
    g.fillText(o.sub, W / 2, line);
  }

  // the invitation, breathing so it reads as interactive
  const a = 0.55 + pulse(o.age, 1.4) * 0.45;
  g.fillStyle = hexA(t.ink, a);
  g.font = `700 15px ${t.fontBody}`;
  g.fillText("tap to go again", W / 2, y + bh - 22);

  g.restore();
  g.textAlign = "left";
}

/**
 * The three-two-one before a run that can kill you instantly. Returns true
 * while it is still counting, so callers can freeze the world.
 */
export function drawGetReady(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: CardTheme,
  remaining: number,
  hint?: string
) {
  const n = Math.ceil(remaining);
  const frac = 1 - (n - remaining); // 1 at the start of each beat, 0 at its end
  g.save();
  g.textAlign = "center";
  g.globalAlpha = clamp(frac * 1.6, 0, 1);
  const s = 0.7 + easeOutCubic(clamp(1 - frac, 0, 1)) * 0.5;
  g.translate(W / 2, H * 0.44);
  g.scale(s, s);
  g.fillStyle = t.ink;
  g.font = `900 76px ${t.fontDisplay}`;
  g.fillText(n > 0 ? String(n) : "GO", 0, 0);
  g.restore();
  if (hint) {
    g.save();
    g.textAlign = "center";
    g.globalAlpha = 0.8;
    g.fillStyle = t.inkDim;
    g.font = `700 15px ${t.fontBody}`;
    g.fillText(hint, W / 2, H * 0.56);
    g.restore();
  }
  g.textAlign = "left";
}
