// Client-side persistence layer. Everything the Supabase schema models
// (players, scores, signals, prefs) works locally first, so the app is fully
// playable with zero backend. Swap the internals for Supabase calls when
// NEXT_PUBLIC_SUPABASE_URL is configured — the call sites don't change.
import { normalizeSpec, type CustomGameSpec } from "@/lib/specs";

export interface LeaderboardEntry {
  handle: string;
  score: number;
  you?: boolean;
}

export interface GameSignals {
  dwellMs: number;
  runs: number;
  fastSwipes: number;
  replays: number;
}

const KEY = {
  handle: "ttg:handle",
  bests: "ttg:bests",
  signals: "ttg:signals",
  algo: "ttg:algo",
  theme: "ttg:theme",
  likes: "ttg:likes",
  custom: "ttg:customGames",
  music: "ttg:music",
};

const safe = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      // private mode / quota — play on without persistence
    }
  },
};

export function getHandle(): string {
  let h = safe.get(KEY.handle);
  if (!h) {
    h = `guest-${1000 + Math.floor(Math.random() * 9000)}`;
    safe.set(KEY.handle, h);
  }
  return h;
}

// ---- personal bests ----

function readBests(): Record<string, number> {
  try {
    return JSON.parse(safe.get(KEY.bests) ?? "{}");
  } catch {
    return {};
  }
}

export function getBest(slug: string): number {
  return readBests()[slug] ?? 0;
}

/** Records a finished run. Returns rank info vs the seeded leaderboard. */
export function submitRun(slug: string, score: number) {
  const bests = readBests();
  const prevBest = bests[slug] ?? 0;
  const isBest = score > prevBest;
  if (isBest) {
    bests[slug] = score;
    safe.set(KEY.bests, JSON.stringify(bests));
  }
  const seeds = seededScores(slug);
  const above = seeds.filter((s) => s.score > score).length;
  const rank = above + 1;
  const percentile =
    seeds.length === 0
      ? 100
      : Math.round(((seeds.length - above) / seeds.length) * 100);
  return { isBest, prevBest, rank, percentile, topTen: rank <= 10 };
}

// ---- implicit signals (feeds the algorithm) ----

function readSignals(): Record<string, GameSignals> {
  try {
    return JSON.parse(safe.get(KEY.signals) ?? "{}");
  } catch {
    return {};
  }
}

export function getSignals(slug: string): GameSignals {
  return (
    readSignals()[slug] ?? { dwellMs: 0, runs: 0, fastSwipes: 0, replays: 0 }
  );
}

export function bumpSignals(slug: string, delta: Partial<GameSignals>) {
  const all = readSignals();
  const s = all[slug] ?? { dwellMs: 0, runs: 0, fastSwipes: 0, replays: 0 };
  all[slug] = {
    dwellMs: s.dwellMs + (delta.dwellMs ?? 0),
    runs: s.runs + (delta.runs ?? 0),
    fastSwipes: s.fastSwipes + (delta.fastSwipes ?? 0),
    replays: s.replays + (delta.replays ?? 0),
  };
  safe.set(KEY.signals, JSON.stringify(all));
}

export function allSignals(): Record<string, GameSignals> {
  return readSignals();
}

// ---- generic JSON prefs (algorithm vector, theme) ----

// ---- likes (explicit algorithm signal + rail UI state) ----

export function likedSlugs(): Set<string> {
  try {
    return new Set(JSON.parse(safe.get(KEY.likes) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function toggleLike(slug: string): boolean {
  const set = likedSlugs();
  const nowLiked = !set.has(slug);
  if (nowLiked) set.add(slug);
  else set.delete(slug);
  safe.set(KEY.likes, JSON.stringify([...set]));
  return nowLiked;
}

// ---- player-generated games (specs only; engines stay ours) ----

export type { CustomGameSpec };

/**
 * Anything already in localStorage was written by whatever build was live at
 * the time, so it is repaired on the way out — a game saved with a broken
 * accent or an unknown base still comes back playable.
 */
export function loadCustomSpecs(): CustomGameSpec[] {
  try {
    const raw = JSON.parse(safe.get(KEY.custom) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s) => s && typeof s === "object")
      .map((s) => normalizeSpec(s as Partial<CustomGameSpec>));
  } catch {
    return [];
  }
}

export function saveCustomSpec(spec: CustomGameSpec) {
  const clean = normalizeSpec(spec);
  const all = loadCustomSpecs().filter((s) => s.slug !== clean.slug);
  all.push(clean);
  safe.set(KEY.custom, JSON.stringify(all));
}

export function loadJson<T>(key: "algo" | "theme" | "music", fallback: T): T {
  try {
    const raw = safe.get(KEY[key]);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: "algo" | "theme" | "music", value: unknown) {
  safe.set(KEY[key], JSON.stringify(value));
}

// ---- seeded leaderboards (deterministic per game, plausible scores) ----

const SEED_HANDLES = [
  "pixelpete", "swipequeen", "thumbwizard", "nervebank", "combo_carl",
  "latenightlena", "greenzone", "bustproof", "tap_god_77", "onemorego",
  "feedrider", "chip_stack", "dodgemom", "frame_perfect", "snackbreak",
];

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

// Rough "good score" scale per game so seeds look human, not random noise.
const SCORE_SCALE: Record<string, number> = {
  "reflex-gate": 24,
  "tap-rush": 60,
  "word-trap": 32,
  "hold-line": 18,
  "flash-recall": 12,
  "drop-dodge": 75,
  "one-lane": 90,
  "pop-chain": 340,
  "cash-out": 900,
};

export function seededScores(slug: string): LeaderboardEntry[] {
  const rnd = mulberry32(hash(slug));
  const scale = SCORE_SCALE[slug] ?? 50;
  const entries: LeaderboardEntry[] = [];
  const used = new Set<number>();
  for (let i = 0; i < 12; i++) {
    let hi = Math.floor(rnd() * SEED_HANDLES.length);
    while (used.has(hi)) hi = (hi + 1) % SEED_HANDLES.length;
    used.add(hi);
    const falloff = 1 - i * 0.055;
    const jitter = 0.85 + rnd() * 0.3;
    entries.push({
      handle: SEED_HANDLES[hi],
      score: Math.max(1, Math.round(scale * falloff * jitter)),
    });
  }
  return entries.sort((a, b) => b.score - a.score);
}

/** Top N with the player's best merged in. */
export function leaderboard(slug: string, n = 10): LeaderboardEntry[] {
  const rows = [...seededScores(slug)];
  const best = getBest(slug);
  if (best > 0) rows.push({ handle: getHandle(), score: best, you: true });
  return rows.sort((a, b) => b.score - a.score).slice(0, n);
}
