// Tiny shared loop helper. Owns rAF lifecycle so every game gets
// pause/resume/destroy for free and we can audit leaks globally.

declare global {
  interface Window {
    __rafActive?: number;
  }
}

export interface Loop {
  start: () => void;
  pause: () => void;
  resume: () => void;
  destroy: () => void;
}

export function makeLoop(frame: (dt: number, t: number) => void): Loop {
  let handle = 0;
  let running = false;
  let destroyed = false;
  let last = 0;

  const tick = (now: number) => {
    if (!running || destroyed) return;
    const dt = Math.min(50, last ? now - last : 16.7); // clamp: tab-switch dt spikes
    last = now;
    frame(dt / 1000, now / 1000);
    handle = requestAnimationFrame(tick);
  };

  const start = () => {
    if (running || destroyed) return;
    running = true;
    last = 0;
    if (typeof window !== "undefined") {
      window.__rafActive = (window.__rafActive ?? 0) + 1;
    }
    handle = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(handle);
    if (typeof window !== "undefined") {
      window.__rafActive = Math.max(0, (window.__rafActive ?? 1) - 1);
    }
  };

  return {
    start,
    pause: stop,
    resume: start,
    destroy: () => {
      stop();
      destroyed = true;
    },
  };
}

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Lighten (+) or darken (-) a hex colour by a ratio. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) =>
    Math.max(
      0,
      Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))
    );
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Blend two hex colours. t=0 is a, t=1 is b. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const l = (sh: number) => {
    const va = (pa >> sh) & 255;
    const vb = (pb >> sh) & 255;
    return Math.round(va + (vb - va) * t);
  };
  return `#${((l(16) << 16) | (l(8) << 8) | l(0)).toString(16).padStart(6, "0")}`;
}

/** Hex plus an alpha channel, as an rgba() string. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function circle(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number
) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Axis-aligned overlap between two centre-anchored boxes. */
export function overlaps(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return (
    Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh
  );
}

/** Move `v` toward `to` by at most `step`. */
export function approach(v: number, to: number, step: number): number {
  return v < to ? Math.min(to, v + step) : Math.max(to, v - step);
}

/** Deterministic 0..1 noise from an integer — cheap scenery without state. */
export function hashed(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

interface EndTheme {
  ink: string;
  inkDim: string;
  surface: string;
  fontDisplay: string;
  fontBody: string;
}

/** The shared game-over card. One look across every game. */
export function endCard(
  g: CanvasRenderingContext2D,
  t: EndTheme,
  W: number,
  H: number,
  msg: string
) {
  g.textAlign = "center";
  const bw = Math.min(W * 0.78, 320);
  const bh = 104;
  const x = W / 2 - bw / 2;
  const y = H * 0.33;
  g.fillStyle = "rgba(0,0,0,.26)";
  roundRect(g, x + 3, y + 5, bw, bh, 20);
  g.fill();
  g.fillStyle = t.surface;
  roundRect(g, x, y, bw, bh, 20);
  g.fill();
  g.fillStyle = t.ink;
  g.font = `800 27px ${t.fontDisplay}`;
  g.fillText(msg, W / 2, y + 46);
  g.fillStyle = t.inkDim;
  g.font = `600 15px ${t.fontBody}`;
  g.fillText("tap to go again", W / 2, y + 74);
  g.textAlign = "left";
}
