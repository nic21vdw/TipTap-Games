// Client-side persistence layer. Everything the Supabase schema models
// (profiles, scores, signals, prefs) works locally first, so the app is fully
// playable with zero backend, and every read stays synchronous — a card that
// lands never waits on a network round trip to know your best.
//
// When NEXT_PUBLIC_SUPABASE_URL is configured, lib/cloud.ts subscribes to the
// change feed below and mirrors these writes to Postgres in the background,
// then merges the cloud's copy back in on sign-in. localStorage stays the
// read path either way; the cloud is a replica, not a dependency.

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

// ---- change feed (lib/cloud.ts is the only subscriber today) ----

export type StorageSlice = "bests" | "signals" | "likes" | "custom" | "prefs";

const listeners = new Set<(slice: StorageSlice) => void>();

/** Fires after any local write. Returns an unsubscribe. */
export function onStorageChange(fn: (slice: StorageSlice) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(slice: StorageSlice) {
  for (const fn of listeners) fn(slice);
}

export function getHandle(): string {
  let h = safe.get(KEY.handle);
  if (!h) {
    h = `guest-${1000 + Math.floor(Math.random() * 9000)}`;
    safe.set(KEY.handle, h);
  }
  return h;
}

/** Adopts the handle the account owns, so the rail and board agree. */
export function setHandle(handle: string) {
  safe.set(KEY.handle, handle);
}

export function isGuestHandle(): boolean {
  return getHandle().startsWith("guest-");
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

export function allBests(): Record<string, number> {
  return readBests();
}

/**
 * Folds the cloud's bests in, keeping whichever side is higher. Used on
 * sign-in, so a guest's unsynced runs survive and another device's runs
 * arrive. Deliberately silent: a merge is not a new local write to push back.
 */
export function mergeBests(incoming: Record<string, number>) {
  const bests = readBests();
  let changed = false;
  for (const [slug, score] of Object.entries(incoming)) {
    if (score > (bests[slug] ?? 0)) {
      bests[slug] = score;
      changed = true;
    }
  }
  if (changed) safe.set(KEY.bests, JSON.stringify(bests));
  return changed;
}

/** Records a finished run. Returns rank info vs the seeded leaderboard. */
export function submitRun(slug: string, score: number) {
  const bests = readBests();
  const prevBest = bests[slug] ?? 0;
  const isBest = score > prevBest;
  if (isBest) {
    bests[slug] = score;
    safe.set(KEY.bests, JSON.stringify(bests));
    emit("bests");
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
  emit("signals");
}

export function allSignals(): Record<string, GameSignals> {
  return readSignals();
}

/** Cloud signals are cumulative counters, so a merge takes the larger side. */
export function mergeSignals(incoming: Record<string, GameSignals>) {
  const all = readSignals();
  for (const [slug, s] of Object.entries(incoming)) {
    const mine = all[slug] ?? { dwellMs: 0, runs: 0, fastSwipes: 0, replays: 0 };
    all[slug] = {
      dwellMs: Math.max(mine.dwellMs, s.dwellMs),
      runs: Math.max(mine.runs, s.runs),
      fastSwipes: Math.max(mine.fastSwipes, s.fastSwipes),
      replays: Math.max(mine.replays, s.replays),
    };
  }
  safe.set(KEY.signals, JSON.stringify(all));
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
  emit("likes");
  return nowLiked;
}

/** Union, not replace: a like made as a guest is still a like. */
export function mergeLikes(incoming: string[]) {
  const set = likedSlugs();
  for (const slug of incoming) set.add(slug);
  safe.set(KEY.likes, JSON.stringify([...set]));
}

// ---- player-generated games (specs only; engines stay ours) ----

export interface CustomGameSpec {
  slug: string;
  base: string; // slug of the engine it runs on
  title: string;
  rule: string;
  description: string;
  history: string;
  accent: string; // hex; recolours the base engine
  tags: string[];
  intensity: number;
  luck: number;
  nostalgia: number;
}

export function loadCustomSpecs(): CustomGameSpec[] {
  try {
    return JSON.parse(safe.get(KEY.custom) ?? "[]");
  } catch {
    return [];
  }
}

export function saveCustomSpec(spec: CustomGameSpec) {
  const all = loadCustomSpecs().filter((s) => s.slug !== spec.slug);
  all.push(spec);
  safe.set(KEY.custom, JSON.stringify(all));
  emit("custom");
}

/** Games you generated on another device, keyed by slug. */
export function mergeCustomSpecs(incoming: CustomGameSpec[]) {
  const mine = loadCustomSpecs();
  const bySlug = new Map(incoming.map((s) => [s.slug, s]));
  for (const s of mine) bySlug.set(s.slug, s);
  safe.set(KEY.custom, JSON.stringify([...bySlug.values()]));
}

export function loadJson<T>(key: "algo" | "theme", fallback: T): T {
  try {
    const raw = safe.get(KEY[key]);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: "algo" | "theme", value: unknown) {
  safe.set(KEY[key], JSON.stringify(value));
  emit("prefs");
}

/** Applies a pulled pref without echoing it straight back to the cloud. */
export function adoptJson(key: "algo" | "theme", value: unknown) {
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
