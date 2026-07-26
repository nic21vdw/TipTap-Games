"use client";

/**
 * Tip Tap Radio - the feed's soundtrack.
 *
 * Every track is synthesised live in the browser out of oscillators and
 * noise, so there is no audio file to license, host, download or attribute:
 * the music does not exist until the page makes it. That keeps it genuinely
 * royalty-free and it keeps the payload at zero bytes.
 *
 * Two rules drive the design:
 *
 *  1. Every game has its own song. The track is derived deterministically
 *     from the slug, so Snake Feed always sounds like Snake Feed, and it is
 *     styled by the game's own algorithm axes (intensity / nostalgia / luck).
 *  2. A song never starts at the start. Scrolling into a card lands you on
 *     the drop: crash, kick, full bassline, bar one. Nobody doom scrolls
 *     through an eight-bar intro.
 */

export type MusicStyle =
  | "house"
  | "trap"
  | "futurebass"
  | "synthwave"
  | "dnb";

export const STYLE_LABEL: Record<MusicStyle, string> = {
  house: "House",
  trap: "Trap",
  futurebass: "Future Bass",
  synthwave: "Synthwave",
  dnb: "Drum & Bass",
};

/** The slice of a game's meta the composer needs. Kept structural so this
 *  module never has to import the registry. */
export interface TrackSeedMeta {
  slug: string;
  intensity: number;
  nostalgia: number;
  luck: number;
  tags: readonly string[];
}

export interface TrackSpec {
  slug: string;
  /** display title, generated - shown in the now-playing chip */
  name: string;
  style: MusicStyle;
  styleLabel: string;
  bpm: number;
  /** midi note of the tonic */
  root: number;
  /** one scale degree per bar */
  progression: number[];
  /** 16 sixteenths: -1 is a rest, otherwise a scale degree */
  motif: number[];
  bright: number; // 0..1, filter openness
  swing: number; // 0..0.3 of a sixteenth
}

// ---------------------------------------------------------------- theory

const MINOR = [0, 2, 3, 5, 7, 8, 10];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scale degree (can go below 0 or above 6) to a midi note. */
function degreeMidi(root: number, degree: number): number {
  const oct = Math.floor(degree / 7);
  const idx = degree - oct * 7;
  return root + MINOR[idx] + oct * 12;
}

function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Triad on a scale degree, as midi notes. */
function triad(root: number, degree: number): number[] {
  return [degree, degree + 2, degree + 4].map((d) => degreeMidi(root, d));
}

// -------------------------------------------------------------- composing

const PROGRESSIONS: number[][] = [
  [0, 5, 2, 6], // i - VI - III - VII, the EDM workhorse
  [0, 6, 5, 4], // i - VII - VI - v
  [5, 2, 6, 0], // VI - III - VII - i
  [0, 3, 5, 4], // i - iv - VI - v
  [0, 4, 5, 2], // i - v - VI - III
];

const NAME_A = [
  "Neon", "Chrome", "Static", "Velvet", "Midnight", "Paper", "Glass",
  "Cobalt", "Feral", "Hollow", "Sugar", "Iron", "Lunar", "Signal", "Riot",
  "Amber", "Quiet", "Salt", "Vapour", "Bright", "Low", "Marble", "Cheap",
  "Slow", "Wired", "Plastic", "Gold", "Blunt", "Tidal", "Hyper",
];
const NAME_B = [
  "Circuit", "Bloom", "Hazard", "Drift", "Cascade", "Fever", "Rush",
  "Pulse", "Machine", "Weather", "Ghost", "Freeway", "Habit", "Engine",
  "Kingdom", "Traffic", "Season", "Motion", "Signal", "Runner", "Theory",
  "Static", "Appetite", "Mercy", "Physics", "Hours", "Contact", "Frame",
  "Reactor", "Hymn",
];

function pickStyle(meta: TrackSeedMeta, rnd: () => number): MusicStyle {
  const casino = meta.tags.includes("casino");
  const retro = meta.tags.includes("retro");
  // Scored rather than branched, so two games with similar axes can still
  // land on different genres. Nostalgia only starts pulling towards
  // synthwave past the halfway mark, or a handful of mildly retro games
  // swallow the whole feed.
  const score: Record<MusicStyle, number> = {
    synthwave:
      0.15 + Math.max(0, meta.nostalgia - 0.45) * 2.1 + (retro ? 0.35 : 0),
    dnb: 0.5 + Math.max(0, meta.intensity - 0.45) * 2.4,
    house: 1.0 + meta.luck * 1.1 + (casino ? 0.9 : 0) - meta.nostalgia * 0.35,
    trap: 0.85 + meta.intensity * 1.0 - meta.nostalgia * 0.5,
    futurebass: 0.6 + (1 - Math.abs(meta.intensity - 0.5)) * 0.5,
  };
  let best: MusicStyle = "futurebass";
  let bestVal = -Infinity;
  for (const k of Object.keys(score) as MusicStyle[]) {
    const v = score[k] + rnd() * 0.95;
    if (v > bestVal) {
      bestVal = v;
      best = k;
    }
  }
  return best;
}

const BASE_BPM: Record<MusicStyle, number> = {
  house: 126,
  trap: 142,
  futurebass: 150,
  synthwave: 116,
  dnb: 174,
};

const specCache = new Map<string, TrackSpec>();

/** Deterministic: the same game is always the same song. */
export function trackSpecFor(meta: TrackSeedMeta): TrackSpec {
  const cached = specCache.get(meta.slug);
  if (cached) return cached;

  // Independent streams per concern. Sharing one stream correlated the
  // title with the genre, so same-genre games kept drawing the same name.
  const rnd = mulberry32(hash(`song:${meta.slug}`));
  const rndName = mulberry32(hash(`title:${meta.slug}`));
  const style = pickStyle(meta, mulberry32(hash(`genre:${meta.slug}`)));
  const bpm = Math.round(
    BASE_BPM[style] + (rnd() * 11 - 5) + (meta.intensity - 0.5) * 8
  );
  // Minor tonics low enough that the bass has somewhere to go. A2..G#2.
  const root = 45 + Math.floor(rnd() * 12);
  const progression = PROGRESSIONS[Math.floor(rnd() * PROGRESSIONS.length)];

  // A 16-step hook: denser and higher when the game is frantic.
  const density = 0.3 + meta.intensity * 0.35;
  const motif: number[] = [];
  for (let i = 0; i < 16; i++) {
    const onBeat = i % 4 === 0;
    const play = rnd() < (onBeat ? density + 0.3 : density);
    motif.push(play ? Math.floor(rnd() * 7) + (rnd() < 0.35 ? 7 : 0) : -1);
  }
  if (motif.every((n) => n < 0)) motif[0] = 0;

  const spec: TrackSpec = {
    slug: meta.slug,
    name: `${NAME_A[Math.floor(rndName() * NAME_A.length)]} ${
      NAME_B[Math.floor(rndName() * NAME_B.length)]
    }`,
    style,
    styleLabel: STYLE_LABEL[style],
    bpm,
    root,
    progression,
    motif,
    bright: 0.35 + meta.intensity * 0.5 + rnd() * 0.15,
    swing: style === "house" || style === "trap" ? rnd() * 0.12 : 0,
  };
  specCache.set(meta.slug, spec);
  return spec;
}

// ----------------------------------------------------------------- engine

const LOOKAHEAD = 0.14; // seconds of audio scheduled ahead of the clock
const TICK_MS = 25;

// Audit hook, same idea as __rafActive in games/engine.ts: after any number
// of swipes there must be exactly one live track and one audio context.
declare global {
  interface Window {
    __ttgMusic?: {
      ac: AudioContext;
      master: GainNode;
      /** tracks still scheduling; anything above 1 is a leak */
      live: number;
    };
  }
}

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let impulse: AudioBuffer | null = null;
let unlocked = false;
let enabled = true;
let volume = 0.55;

interface Track {
  spec: TrackSpec;
  out: GainNode; // per-track fader, used for crossfades
  drums: GainNode;
  duck: GainNode; // sidechained bus: everything tonal lives here
  delay: GainNode; // send level into the feedback delay
  verb: GainNode; // send level into the reverb
  timer: ReturnType<typeof setInterval> | null;
  step: number;
  nextTime: number;
  started: boolean;
  dead: boolean;
}

let current: Track | null = null;

function ctx(): AudioContext | null {
  if (ac) return ac;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  ac = new Ctor();

  // A limiter on the end of the chain: several voices can land on the same
  // sixteenth and the last thing a feed needs is a clipped downbeat.
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.14;
  limiter.connect(ac.destination);

  master = ac.createGain();
  master.gain.value = enabled ? volume : 0;
  master.connect(limiter);

  const sr = ac.sampleRate;
  noise = ac.createBuffer(1, sr * 2, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // Cheap plate-ish reverb: exponentially decaying stereo noise.
  const len = Math.floor(sr * 1.7);
  impulse = ac.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = impulse.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
  }
  window.__ttgMusic = { ac, master, live: 0 };
  return ac;
}

function auditLive(delta: number) {
  if (typeof window === "undefined" || !window.__ttgMusic) return;
  window.__ttgMusic.live = Math.max(0, window.__ttgMusic.live + delta);
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
  else void c.resume().then(settle, settle);
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

/** Tab hidden, or the whole feed paused. */
export function suspendMusic() {
  if (ac && ac.state === "running") void ac.suspend();
}

export function resumeMusic() {
  if (ac && ac.state === "suspended" && unlocked) void ac.resume();
}

// ------------------------------------------------------------ sound design

function env(
  g: GainNode,
  t: number,
  peak: number,
  attack: number,
  decay: number
) {
  const p = Math.max(0.0002, peak);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(p, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function burst(
  dest: AudioNode,
  t: number,
  dur: number,
  freq: number,
  type: BiquadFilterType,
  level: number,
  q = 1
) {
  const c = ac!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

/** The pump. Every kick ducks the tonal bus, which is most of what makes
 *  four-to-the-floor feel like four-to-the-floor. */
function sidechain(tr: Track, t: number, depth: number) {
  const beat = 60 / tr.spec.bpm;
  const g = tr.duck.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(1 - depth, t);
  g.linearRampToValueAtTime(1, t + beat * 0.82);
}

function kick(tr: Track, t: number, top = 165, dur = 0.36, depth = 0.72) {
  const c = ac!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(top, t);
  o.frequency.exponentialRampToValueAtTime(43, t + 0.085);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.98, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(tr.drums);
  o.start(t);
  o.stop(t + dur + 0.02);
  burst(tr.drums, t, 0.018, 2600, "highpass", 0.22);
  sidechain(tr, t, depth);
}

function snare(tr: Track, t: number, level = 0.55) {
  const c = ac!;
  burst(tr.drums, t, 0.16, 1900, "bandpass", level, 0.8);
  burst(tr.drums, t, 0.05, 220, "lowpass", level * 0.7);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(196, t);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
  env(g, t, level * 0.5, 0.002, 0.09);
  o.connect(g).connect(tr.drums);
  o.start(t);
  o.stop(t + 0.14);
  // snares are the other thing worth sending to the plate
  const send = c.createGain();
  send.gain.value = 0.25;
  g.connect(send).connect(tr.verb);
}

function clap(tr: Track, t: number, level = 0.5) {
  for (let i = 0; i < 3; i++) {
    burst(tr.drums, t + i * 0.011, 0.035, 1500, "bandpass", level, 1.4);
  }
  burst(tr.drums, t + 0.03, 0.18, 1250, "bandpass", level * 0.7, 0.9);
}

function hat(tr: Track, t: number, open = false, level = 0.26) {
  burst(
    tr.drums,
    t,
    open ? 0.26 : 0.045,
    open ? 8200 : 9500,
    "highpass",
    open ? level * 0.8 : level
  );
}

function crash(tr: Track, t: number, level = 0.36) {
  burst(tr.drums, t, 1.5, 4200, "highpass", level);
  burst(tr.verb, t, 1.2, 3000, "highpass", level * 0.6);
}

type BassKind = "sub" | "saw" | "reese";

function bass(
  tr: Track,
  t: number,
  midi: number,
  dur: number,
  kind: BassKind,
  level = 0.5,
  glideFrom?: number
) {
  const c = ac!;
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  const oscs: OscillatorNode[] = [];

  if (kind === "sub") {
    // 808: sine, a little drive, and a pitch glide into the note
    const o = c.createOscillator();
    o.type = "sine";
    if (glideFrom !== undefined) {
      o.frequency.setValueAtTime(hz(glideFrom), t);
      o.frequency.exponentialRampToValueAtTime(hz(midi), t + 0.075);
    } else {
      o.frequency.setValueAtTime(hz(midi) * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(hz(midi), t + 0.035);
    }
    oscs.push(o);
    f.frequency.value = 900;
    f.Q.value = 0.4;
  } else if (kind === "saw") {
    for (const det of [-6, 6]) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(midi);
      o.detune.value = det;
      oscs.push(o);
    }
    f.frequency.setValueAtTime(180 + tr.spec.bright * 700, t);
    f.frequency.exponentialRampToValueAtTime(160, t + dur);
    f.Q.value = 6;
  } else {
    // reese: two saws beating against each other, filtered dark
    for (const det of [-14, 13]) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(midi);
      o.detune.value = det;
      oscs.push(o);
    }
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.7;
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(f.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
    f.frequency.value = 420;
    f.Q.value = 7;
  }

  env(g, t, level, 0.008, dur);
  for (const o of oscs) {
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  f.connect(g).connect(tr.duck);

  if (kind === "sub") {
    // a touch of saturation so the 808 survives phone speakers
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    g.disconnect();
    g.connect(shaper).connect(tr.duck);
  }
}

/** Detuned-saw chord stab, filter-enveloped. Used for house plucks, future
 *  bass swells and synthwave arps alike, tuned by attack/decay. */
function stab(
  tr: Track,
  t: number,
  midis: number[],
  dur: number,
  level = 0.2,
  attack = 0.006,
  wobble = 0
) {
  const c = ac!;
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = 3;
  const openTo = 900 + tr.spec.bright * 4200;
  f.frequency.setValueAtTime(openTo, t);
  f.frequency.exponentialRampToValueAtTime(500, t + dur);

  for (const m of midis) {
    for (const det of [-9, 9]) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(m);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.08);
    }
  }

  env(g, t, level, attack, dur);
  f.connect(g);
  g.connect(tr.duck);

  if (wobble > 0) {
    // future bass: retrigger the amp with an LFO so the chord breathes
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = (tr.spec.bpm / 60) * 2;
    lfo.type = "triangle";
    lg.gain.value = level * wobble;
    lfo.connect(lg).connect(g.gain);
    lfo.start(t);
    lfo.stop(t + dur + 0.08);
  }

  const send = c.createGain();
  send.gain.value = 0.3;
  g.connect(send).connect(tr.verb);
}

/** Supersaw lead. The thing you actually hum. */
function lead(tr: Track, t: number, midi: number, dur: number, level = 0.15) {
  const c = ac!;
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = 2;
  f.frequency.setValueAtTime(1400 + tr.spec.bright * 5200, t);
  f.frequency.exponentialRampToValueAtTime(1100, t + dur);

  for (const det of [-16, -7, 0, 7, 16]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = hz(midi);
    o.detune.value = det;
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.08);
  }
  env(g, t, level, 0.01, dur);
  f.connect(g).connect(tr.duck);

  const d = c.createGain();
  d.gain.value = 0.4;
  g.connect(d).connect(tr.delay);
  const v = c.createGain();
  v.gain.value = 0.28;
  g.connect(v).connect(tr.verb);
}

/** The bell/pluck voice trap and synthwave use for their hook. */
function bell(tr: Track, t: number, midi: number, dur: number, level = 0.14) {
  const c = ac!;
  const g = c.createGain();
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.value = hz(midi);
  const o2 = c.createOscillator();
  o2.type = "sine";
  o2.frequency.value = hz(midi) * 2.01;
  const g2 = c.createGain();
  g2.gain.value = 0.35;
  env(g, t, level, 0.004, dur);
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(tr.duck);
  const d = c.createGain();
  d.gain.value = 0.45;
  g.connect(d).connect(tr.delay);
  o.start(t);
  o.stop(t + dur + 0.05);
  o2.start(t);
  o2.stop(t + dur + 0.05);
}

/** The one-shot that sells "you just landed on the drop". */
function impact(tr: Track, t: number) {
  const c = ac!;
  crash(tr, t, 0.4);
  // sub drop under the crash
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(32, t + 0.55);
  env(g, t, 0.7, 0.006, 0.6);
  o.connect(g).connect(tr.drums);
  o.start(t);
  o.stop(t + 0.7);
  burst(tr.verb, t, 0.9, 600, "lowpass", 0.4);
}

// ------------------------------------------------------------ arrangement

function schedule(tr: Track, step: number, t: number) {
  const { spec } = tr;
  const s = ((step % 16) + 16) % 16;
  const bar = Math.floor(step / 16);
  const beat = 60 / spec.bpm;
  const six = beat / 4;
  const degree = spec.progression[bar % spec.progression.length];
  const chord = triad(spec.root + 24, degree);
  const rootLow = degreeMidi(spec.root, degree) - 12;
  const lastBar = bar % 8 === 7;

  // A crash every 8 bars keeps the loop from flattening out.
  if (s === 0 && bar > 0 && bar % 8 === 0) crash(tr, t, 0.22);
  // ...and a snare roll into it.
  if (lastBar && s >= 12) {
    snare(tr, t, 0.18 + (s - 12) * 0.06);
    if (s === 15) snare(tr, t + six / 2, 0.4);
  }

  switch (spec.style) {
    case "house":
      houseStep(tr, s, t, chord, rootLow, six);
      break;
    case "trap":
      trapStep(tr, s, t, chord, rootLow, six, bar);
      break;
    case "futurebass":
      futureStep(tr, s, t, chord, rootLow, six);
      break;
    case "synthwave":
      synthwaveStep(tr, s, t, chord, rootLow, six, bar);
      break;
    case "dnb":
      dnbStep(tr, s, t, chord, rootLow, six, bar);
      break;
  }

  // The generated hook rides on top of every style.
  const note = spec.motif[s];
  if (note >= 0 && (spec.style !== "trap" || s % 2 === 0)) {
    const midi = degreeMidi(spec.root + 36, note + degree);
    if (spec.style === "trap" || spec.style === "synthwave") {
      bell(tr, t, midi, six * 3, 0.13);
    } else {
      lead(tr, t, midi, six * 2.4, 0.12);
    }
  }
}

function houseStep(
  tr: Track,
  s: number,
  t: number,
  chord: number[],
  rootLow: number,
  six: number
) {
  if (s % 4 === 0) kick(tr, t);
  if (s === 4 || s === 12) clap(tr, t, 0.42);
  if (s % 2 === 0) hat(tr, t, false, s % 4 === 0 ? 0.14 : 0.2);
  // the offbeat open hat, the whole point of the genre
  if (s % 4 === 2) hat(tr, t, true, 0.24);
  // rolling sixteenth bass with a gap on the downbeat
  if (s % 4 !== 0) bass(tr, t, rootLow, six * 0.85, "saw", 0.42);
  // offbeat chord stabs
  if (s === 2 || s === 6 || s === 10 || s === 14) {
    stab(tr, t, chord, six * 1.6, 0.17);
  }
}

function trapStep(
  tr: Track,
  s: number,
  t: number,
  chord: number[],
  rootLow: number,
  six: number,
  bar: number
) {
  // halftime: kick on 1 and the and-of-3, snare only on 3
  if (s === 0 || s === 10) kick(tr, t, 150, 0.3, 0.55);
  if (s === 6 && bar % 2 === 1) kick(tr, t, 150, 0.26, 0.5);
  if (s === 8) snare(tr, t, 0.6);
  // hats on every sixteenth, with rolls
  if (s % 2 === 0) hat(tr, t, false, 0.2);
  if (s === 7 || s === 15) {
    for (let i = 0; i < 3; i++) hat(tr, t + (i * six) / 3, false, 0.16);
  }
  if (s === 3 && bar % 4 === 3) {
    for (let i = 0; i < 4; i++) hat(tr, t + (i * six) / 4, false, 0.14);
  }
  // 808 that glides between notes
  if (s === 0) bass(tr, t, rootLow - 12, six * 7, "sub", 0.62);
  if (s === 10) {
    bass(tr, t, rootLow - 12 + 5, six * 5, "sub", 0.55, rootLow - 12);
  }
  if (s === 0 || s === 8) stab(tr, t, chord, six * 6, 0.1, 0.05);
}

function futureStep(
  tr: Track,
  s: number,
  t: number,
  chord: number[],
  rootLow: number,
  six: number
) {
  if (s === 0 || s === 6) kick(tr, t, 160, 0.32, 0.68);
  if (s === 8) snare(tr, t, 0.55);
  if (s % 2 === 0) hat(tr, t, false, 0.18);
  if (s === 4 || s === 12) hat(tr, t, true, 0.2);
  // the big breathing supersaw chord, retriggered twice a bar
  if (s === 0 || s === 8) {
    stab(tr, t, [...chord, chord[0] + 12], six * 7.5, 0.24, 0.03, 0.55);
  }
  if (s === 0) bass(tr, t, rootLow - 12, six * 7.5, "sub", 0.5);
  if (s === 8) bass(tr, t, rootLow - 12, six * 7.5, "sub", 0.5);
}

function synthwaveStep(
  tr: Track,
  s: number,
  t: number,
  chord: number[],
  rootLow: number,
  six: number,
  bar: number
) {
  if (s % 4 === 0) kick(tr, t, 150, 0.3, 0.5);
  if (s === 4 || s === 12) snare(tr, t, 0.42);
  if (s % 2 === 1) hat(tr, t, false, 0.16);
  // eighth-note octave bass, the eighties engine room
  if (s % 2 === 0) {
    bass(tr, t, s % 4 === 0 ? rootLow : rootLow + 12, six * 1.7, "saw", 0.4);
  }
  // gated sixteenth arpeggio through the chord
  const arp = chord[(s + bar) % chord.length] + (s % 8 >= 4 ? 12 : 0);
  stab(tr, t, [arp], six * 0.9, 0.11, 0.004);
}

function dnbStep(
  tr: Track,
  s: number,
  t: number,
  chord: number[],
  rootLow: number,
  six: number,
  bar: number
) {
  // two-step break
  if (s === 0 || s === 10) kick(tr, t, 155, 0.24, 0.6);
  if (s === 4 || s === 12) snare(tr, t, 0.55);
  if (s === 14 && bar % 2 === 1) snare(tr, t, 0.3);
  if (s % 2 === 0) hat(tr, t, false, 0.15);
  if (s === 6) hat(tr, t, true, 0.18);
  // long reese under the whole bar
  if (s === 0) bass(tr, t, rootLow - 12, six * 8, "reese", 0.44);
  if (s === 8) bass(tr, t, rootLow - 12 + 3, six * 8, "reese", 0.4);
  if (s === 0 || s === 8) stab(tr, t, chord, six * 3, 0.12, 0.02);
}

// -------------------------------------------------------------- transport

function buildTrack(spec: TrackSpec): Track {
  const c = ac!;
  const out = c.createGain();
  out.gain.value = 0;
  out.connect(master!);

  const drums = c.createGain();
  drums.gain.value = 0.85;
  drums.connect(out);

  const duck = c.createGain();
  duck.gain.value = 1;
  duck.connect(out);

  // 3/16 feedback delay, the standard EDM throw
  const delaySend = c.createGain();
  delaySend.gain.value = 0.5;
  const dl = c.createDelay(1.5);
  dl.delayTime.value = (60 / spec.bpm) * 0.75;
  const fb = c.createGain();
  fb.gain.value = 0.34;
  const dampen = c.createBiquadFilter();
  dampen.type = "lowpass";
  dampen.frequency.value = 2600;
  delaySend.connect(dl);
  dl.connect(dampen).connect(fb).connect(dl);
  dl.connect(out);

  const verbSend = c.createGain();
  verbSend.gain.value = 0.45;
  const conv = c.createConvolver();
  conv.buffer = impulse;
  verbSend.connect(conv).connect(out);

  return {
    spec,
    out,
    drums,
    duck,
    delay: delaySend,
    verb: verbSend,
    timer: null,
    step: 0,
    nextTime: 0,
    started: false,
    dead: false,
  };
}

function startTrack(tr: Track) {
  const c = ac!;
  if (tr.started || tr.dead) return;
  tr.started = true;
  auditLive(1);
  const t0 = c.currentTime + 0.06;
  tr.nextTime = t0;
  tr.step = 0;
  // No intro, no build: the crash and the sub drop land on the same
  // sixteenth the beat does.
  impact(tr, t0);
  tr.out.gain.setValueAtTime(0.0001, t0);
  tr.out.gain.exponentialRampToValueAtTime(1, t0 + 0.05);

  const six = 60 / tr.spec.bpm / 4;
  const run = () => {
    if (tr.dead || !ac) return;
    while (tr.nextTime < ac.currentTime + LOOKAHEAD) {
      const swung =
        tr.step % 2 === 1 ? tr.nextTime + six * tr.spec.swing : tr.nextTime;
      schedule(tr, tr.step, swung);
      tr.nextTime += six;
      tr.step++;
    }
  };
  run();
  tr.timer = setInterval(run, TICK_MS);
}

function killTrack(tr: Track, fade: number) {
  if (tr.dead) return;
  tr.dead = true;
  if (tr.started) auditLive(-1);
  if (tr.timer !== null) clearInterval(tr.timer);
  tr.timer = null;
  const c = ac;
  if (!c) return;
  const t = c.currentTime;
  tr.out.gain.cancelScheduledValues(t);
  tr.out.gain.setValueAtTime(Math.max(0.0001, tr.out.gain.value), t);
  tr.out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
  setTimeout(() => {
    try {
      tr.out.disconnect();
    } catch {
      // already torn down
    }
  }, (fade + 0.4) * 1000);
}

/**
 * Swipe handler. Ducks whatever was playing and drops the new game's track
 * in on top of it. Returns the spec so the UI can name what's playing.
 */
export function playFor(meta: TrackSeedMeta): TrackSpec {
  const spec = trackSpecFor(meta);
  const c = ctx();
  if (!c) return spec;
  if (current?.spec.slug === spec.slug && !current.dead) return spec;
  if (current) killTrack(current, 0.28);
  const tr = buildTrack(spec);
  current = tr;
  if (c.state === "running") startTrack(tr);
  else {
    // queued behind the gesture that unlocks audio
    void c.resume().then(() => {
      unlocked = c.state === "running";
      if (current === tr && !tr.dead) startTrack(tr);
      listeners.forEach((fn) => fn());
    });
  }
  return spec;
}

export function stopMusic(fade = 0.3) {
  if (current) killTrack(current, fade);
  current = null;
}

export function nowPlaying(): TrackSpec | null {
  return current && !current.dead ? current.spec : null;
}
