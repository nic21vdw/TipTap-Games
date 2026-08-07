"use client";

import { SOUNDTRACK, type SoundtrackTrack } from "@/lib/soundtrack";

/**
 * Tip Tap Radio - the feed's soundtrack.
 *
 * The music is Nic Bops, volumes 1 to 3: our own catalogue, cut down to the
 * best minute of each track and served from `/public/music`. Two rules drive
 * the design:
 *
 *  1. Every game has its own song. The track is picked deterministically from
 *     the slug, so Nokia Mode always sounds like Nokia Mode.
 *  2. A song never starts at the start. Each excerpt is lifted from a quarter
 *     of the way in, so scrolling into a card lands on the meat of the track.
 *     Nobody doom scrolls through an eight-bar intro.
 */

export type { SoundtrackTrack };

export interface TrackSeedMeta {
  slug: string;
  intensity: number;
  nostalgia: number;
  luck: number;
  tags: readonly string[];
}

export interface TrackSpec {
  /** the game this was picked for */
  slug: string;
  /** track id in the soundtrack manifest */
  id: string;
  /** display title, shown in the now-playing chip */
  name: string;
  volume: number;
  volumeLabel: string;
  src: string;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const specCache = new Map<string, TrackSpec>();

/** Deterministic: the same game is always the same song. */
export function trackSpecFor(meta: TrackSeedMeta): TrackSpec {
  const cached = specCache.get(meta.slug);
  if (cached) return cached;
  const track = SOUNDTRACK[hash(`song:${meta.slug}`) % SOUNDTRACK.length];
  const spec: TrackSpec = {
    slug: meta.slug,
    id: track.id,
    name: track.title,
    volume: track.volume,
    volumeLabel: `Nic Bops Vol ${track.volume}`,
    src: track.src,
  };
  specCache.set(meta.slug, spec);
  return spec;
}

// ----------------------------------------------------------------- engine

// Audit hook, same idea as __rafActive in games/engine.ts: after any number
// of swipes there must be exactly one live track and one audio context.
declare global {
  interface Window {
    __ttgMusic?: {
      ac: AudioContext;
      master: GainNode;
      /** tracks still sounding; anything above 1 is a leak */
      live: number;
    };
  }
}

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
let enabled = true;
let volume = 0.55;
let suspended = false;

interface Source {
  el: HTMLAudioElement;
  node: MediaElementAudioSourceNode;
  gain: GainNode;
}

interface Track {
  spec: TrackSpec;
  source: Source;
  started: boolean;
  dead: boolean;
}

let current: Track | null = null;

/** A MediaElementAudioSourceNode can only be built once per element, so the
 *  element, its node and its fader are cached as one unit and reused. */
const sources = new Map<string, Source>();
const recent: string[] = [];
const CACHE_LIMIT = 8;

function ctx(): AudioContext | null {
  if (ac) return ac;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  ac = new Ctor();

  // iOS routes WebAudio through the "ambient" session by default, which the
  // hardware ring/silent switch mutes outright. Asking for "playback" is what
  // makes the soundtrack audible with the switch flipped, the same as any
  // native music app. Absent everywhere but Safari 16.4+, hence the guard.
  const session = (
    navigator as unknown as { audioSession?: { type: string } }
  ).audioSession;
  if (session) {
    try {
      session.type = "playback";
    } catch {
      // read-only on browsers that expose the object but not the setter
    }
  }

  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.14;
  limiter.connect(ac.destination);

  master = ac.createGain();
  master.gain.value = enabled ? volume : 0;
  master.connect(limiter);

  // An iOS interruption (a call, Siri, Control Center) drops the context out
  // of "running" without ever firing visibilitychange. The next gesture is the
  // only thing allowed to bring it back, so arm one.
  const c = ac;
  c.addEventListener("statechange", () => {
    if (c.state === "running" || !unlocked || document.hidden) return;
    const rearm = () => {
      window.removeEventListener("pointerdown", rearm);
      window.removeEventListener("touchstart", rearm);
      resumeMusic();
    };
    window.addEventListener("pointerdown", rearm, { once: true, passive: true });
    window.addEventListener("touchstart", rearm, { once: true, passive: true });
  });

  window.__ttgMusic = { ac, master, live: 0 };
  return ac;
}

function auditLive(delta: number) {
  if (typeof window === "undefined" || !window.__ttgMusic) return;
  window.__ttgMusic.live = Math.max(0, window.__ttgMusic.live + delta);
}

function sourceFor(spec: TrackSpec): Source | null {
  const c = ctx();
  if (!c || !master) return null;

  const touch = () => {
    const at = recent.indexOf(spec.src);
    if (at >= 0) recent.splice(at, 1);
    recent.push(spec.src);
  };

  const cached = sources.get(spec.src);
  if (cached) {
    touch();
    return cached;
  }

  const el = new Audio(spec.src);
  el.loop = true;
  el.preload = "auto";
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  gain.connect(master);
  const node = c.createMediaElementSource(el);
  node.connect(gain);

  const source: Source = { el, node, gain };
  sources.set(spec.src, source);
  touch();

  while (recent.length > CACHE_LIMIT) {
    const evict = recent.shift();
    if (!evict || evict === current?.spec.src) continue;
    const dead = sources.get(evict);
    if (!dead) continue;
    sources.delete(evict);
    dead.el.pause();
    dead.el.removeAttribute("src");
    dead.el.load();
    try {
      dead.node.disconnect();
      dead.gain.disconnect();
    } catch {
      // already torn down
    }
  }

  return source;
}

function fade(gain: GainNode, to: number, seconds: number) {
  const c = ac;
  if (!c) return;
  const t = c.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), t + seconds);
}

function startTrack(tr: Track) {
  if (tr.dead || tr.started) return;
  tr.started = true;
  auditLive(1);
  tr.source.el.currentTime = 0;
  void tr.source.el.play().catch(() => {
    // Autoplay refused; unlockAudio() retries off the next gesture.
    tr.started = false;
    auditLive(-1);
  });
  fade(tr.source.gain, 1, 0.35);
}

function killTrack(tr: Track, seconds: number) {
  if (tr.dead) return;
  tr.dead = true;
  if (tr.started) auditLive(-1);
  fade(tr.source.gain, 0.0001, seconds);
  const el = tr.source.el;
  setTimeout(() => {
    if (current?.source.el === el) return;
    el.pause();
  }, (seconds + 0.1) * 1000);
}

/** Browsers need a gesture before audio is allowed. Call from any handler. */
export function unlockAudio() {
  const c = ctx();
  if (!c) return;
  const settle = () => {
    unlocked = c.state === "running";
    // A card cued before the gesture is holding a built-but-silent track.
    if (unlocked && enabled && current && !current.started && !current.dead) {
      startTrack(current);
    }
    listeners.forEach((fn) => fn());
  };
  if (c.state === "running") settle();
  else void Promise.resolve(c.resume?.()).then(settle, settle);
}

export function isUnlocked() {
  return unlocked;
}

const listeners = new Set<() => void>();
/** Notified when the audio context actually starts running. */
export function onAudioUnlock(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setMusicEnabled(on: boolean) {
  enabled = on;
  if (!ac || !master) return;
  master.gain.cancelScheduledValues(ac.currentTime);
  master.gain.setTargetAtTime(on ? volume : 0, ac.currentTime, 0.05);
}

export function setMusicVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (!ac || !master || !enabled) return;
  master.gain.setTargetAtTime(volume, ac.currentTime, 0.05);
}

export function getMusicVolume() {
  return volume;
}

/** Tab hidden, or the whole feed paused. Pausing the element as well as the
 *  context stops a hidden tab pulling audio down the wire. */
export function suspendMusic() {
  suspended = true;
  if (current?.started) current.source.el.pause();
  if (ac && ac.state === "running") void ac.suspend();
}

export function resumeMusic() {
  suspended = false;
  // Not `=== "suspended"`: a phone call or Siri leaves an iOS context in
  // "interrupted", and a resume gated on "suspended" would never fire again
  // for the rest of the session.
  if (ac && ac.state !== "running" && unlocked) {
    void Promise.resolve(ac.resume?.()).catch(() => {});
  }
  if (enabled && current?.started && !current.dead) {
    void current.source.el.play().catch(() => {});
  }
}

/**
 * Swipe handler. Ducks whatever was playing and drops the new game's track
 * in on top of it. Returns the spec so the UI can name what's playing.
 */
export function playFor(meta: TrackSeedMeta): TrackSpec {
  const spec = trackSpecFor(meta);
  const c = ctx();
  if (!c) return spec;
  if (current?.spec.id === spec.id && !current.dead) {
    current.spec = spec;
    return spec;
  }
  if (current) killTrack(current, 0.28);

  const source = sourceFor(spec);
  if (!source) return spec;
  const tr: Track = { spec, source, started: false, dead: false };
  current = tr;

  if (c.state === "running" && !suspended) startTrack(tr);
  else {
    // Queued behind the gesture that unlocks audio. iOS rejects a resume that
    // did not come from a gesture, and an unhandled rejection here would fire
    // on every first card load, so both outcomes are handled.
    const settle = () => {
      unlocked = c.state === "running";
      if (unlocked && !suspended && current === tr && !tr.dead) startTrack(tr);
      listeners.forEach((fn) => fn());
    };
    void Promise.resolve(c.resume?.()).then(settle, settle);
  }
  return spec;
}

export function stopMusic(seconds = 0.3) {
  if (current) killTrack(current, seconds);
  current = null;
}

export function nowPlaying(): TrackSpec | null {
  return current && !current.dead ? current.spec : null;
}
