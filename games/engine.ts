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
