// Client-side persistence layer. Everything the Supabase schema models
// (players, scores, signals, prefs) works locally first, so the app is fully
// playable with zero backend. Swap the internals for Supabase calls when
// NEXT_PUBLIC_SUPABASE_URL is configured — the call sites don't change.
//
// Scores, signals, likes and the algorithm vector are *per account*: they hang
// off `ttg:u:<accountId>:*`, so switching accounts switches your whole feed
// history. The theme and the music settings stay device-wide, because those
// belong to the phone, not the player.

import {
  addXp,
  currentAccount,
  currentAccountId,
  listAccounts,
  scopedKey,
  scopedKeyFor,
} from "@/lib/accounts";

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

/** Device-wide keys. Everything else is scoped to the signed-in account. */
const DEVICE_KEY = {
  theme: "ttg:theme",
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
  return currentAccount().handle;
}

// ---- personal bests ----

function readBests(accountId?: string): Record<string, number> {
  const key = accountId ? scopedKeyFor(accountId, "bests") : scopedKey("bests");
  try {
    return JSON.parse(safe.get(key) ?? "{}");
  } catch {
    return {};
  }
}

export function getBest(slug: string): number {
  return readBests()[slug] ?? 0;
}

export function bestsFor(accountId: string): Record<string, number> {
  return readBests(accountId);
}

/** XP per finished run: showing up counts, beating yourself counts more. */
function xpForRun(isBest: boolean, topTen: boolean): number {
  return 5 + (isBest ? 10 : 0) + (topTen ? 15 : 0);
}

/** Records a finished run. Returns rank info vs the seeded leaderboard. */
export function submitRun(slug: string, score: number) {
  const bests = readBests();
  const prevBest = bests[slug] ?? 0;
  const isBest = score > prevBest;
  if (isBest) {
    bests[slug] = score;
    safe.set(scopedKey("bests"), JSON.stringify(bests));
  }
  const seeds = seededScores(slug);
  const above = seeds.filter((s) => s.score > score).length;
  const rank = above + 1;
  const percentile =
    seeds.length === 0
      ? 100
      : Math.round(((seeds.length - above) / seeds.length) * 100);
  const topTen = rank <= 10;
  addXp(xpForRun(isBest, topTen));
  return { isBest, prevBest, rank, percentile, topTen };
}

// ---- implicit signals (feeds the algorithm) ----

function readSignals(accountId?: string): Record<string, GameSignals> {
  const key = accountId ? scopedKeyFor(accountId, "signals") : scopedKey("signals");
  try {
    return JSON.parse(safe.get(key) ?? "{}");
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
  safe.set(scopedKey("signals"), JSON.stringify(all));
}

export function allSignals(): Record<string, GameSignals> {
  return readSignals();
}

/** Headline numbers for a profile card — works for any account on the device. */
export function statsFor(accountId: string): {
  runs: number;
  minutes: number;
  gamesPlayed: number;
  bestScore: number;
  bestSlug: string | null;
} {
  const signals = readSignals(accountId);
  const bests = readBests(accountId);
  const runs = Object.values(signals).reduce((n, s) => n + s.runs, 0);
  const dwell = Object.values(signals).reduce((n, s) => n + s.dwellMs, 0);
  let bestScore = 0;
  let bestSlug: string | null = null;
  for (const [slug, score] of Object.entries(bests)) {
    if (score > bestScore) {
      bestScore = score;
      bestSlug = slug;
    }
  }
  return {
    runs,
    minutes: Math.round(dwell / 60000),
    gamesPlayed: Object.keys(bests).length,
    bestScore,
    bestSlug,
  };
}

// ---- likes (explicit algorithm signal + rail UI state) ----

export function likedSlugs(): Set<string> {
  try {
    return new Set(JSON.parse(safe.get(scopedKey("likes")) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function toggleLike(slug: string): boolean {
  const set = likedSlugs();
  const nowLiked = !set.has(slug);
  if (nowLiked) set.add(slug);
  else set.delete(slug);
  safe.set(scopedKey("likes"), JSON.stringify([...set]));
  return nowLiked;
}

// ---- generic JSON prefs (algorithm vector per account, theme per device) ----

export function loadJson<T>(key: "algo" | "theme" | "music", fallback: T): T {
  const storageKey = key === "algo" ? scopedKey("algo") : DEVICE_KEY[key];
  try {
    const raw = safe.get(storageKey);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: "algo" | "theme" | "music", value: unknown) {
  const storageKey = key === "algo" ? scopedKey("algo") : DEVICE_KEY[key];
  safe.set(storageKey, JSON.stringify(value));
}

// ---- seeded leaderboards (deterministic per game, plausible scores) ----

// The first eight are the bot accounts in lib/accounts.ts, so a name on the
// leaderboard is a profile you can open and message.
const SEED_HANDLES = [
  "pixelpete", "swipequeen", "thumbwizard", "nervebank", "combo_carl",
  "latenightlena", "frame_perfect", "onemorego", "greenzone", "bustproof",
  "feedrider", "chip_stack", "dodgemom", "tap_god_77", "snackbreak",
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

/**
 * Top N with every account on this device merged in. Two players sharing a
 * phone see each other on the board, each under their own handle.
 */
export function leaderboard(slug: string, n = 10): LeaderboardEntry[] {
  const rows = [...seededScores(slug)];
  const meId = currentAccountId();
  for (const account of listAccounts()) {
    if (account.kind === "bot") continue;
    const best = readBests(account.id)[slug] ?? 0;
    if (best > 0)
      rows.push({ handle: account.handle, score: best, you: account.id === meId });
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, n);
}
